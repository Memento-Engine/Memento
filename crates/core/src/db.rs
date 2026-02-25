use chrono::{ DateTime, Utc };
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{ SqliteConnectOptions, SqlitePool, SqlitePoolOptions };
use std::time::Duration;
use sqlx::pool::PoolConnection;
use tracing::{ warn, debug };
use libsqlite3_sys::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;
use sqlx::{ QueryBuilder, Sqlite, Result, FromRow };
use serde::{ Serialize, Deserialize };
use std::fmt::Debug;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchQuery {
    pub app_name: Option<String>,
    pub window_name: Option<String>,
    pub browser_url: Option<String>,
    pub query: String,
    pub semantic_query: Option<String>,
    pub key_words: Option<Vec<String>>,
    pub time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    pub entities: Option<Vec<String>>,
    pub embedding: Option<Vec<f32>>,
}

// Intermediate Struct for getting struct from rewritten query
#[derive(Serialize, Deserialize, Debug)]
pub struct StructuredQuery {
    pub app_name: Option<String>,
    pub window_name: Option<String>,
    pub browser_url: Option<String>,
    pub query: String,
    pub semantic_query: Option<String>,
    pub key_words: Option<Vec<String>>,
    pub time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    pub entities: Option<Vec<String>>,
}

pub struct DatabaseManager {
    pub pool: SqlitePool,
}

pub struct ImmediateTx {
    conn: Option<PoolConnection<Sqlite>>,
    committed: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GroupedSearchResult {
    pub app_name: String,
    pub window_title: String,
    pub browser_url: String,
    pub text_contents: Vec<String>,
    pub captured_at: DateTime<Utc>,
    pub source_id: i32, // Source ID is chunk id
}
// Ensure your result struct can be mapped automatically
#[derive(Debug, FromRow, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub captured_at: DateTime<Utc>,
    // sqlx maps SQLite strings/ints to DateTime automatically

    pub app_name: String,
    pub window_title: String,
    pub text_content: String,
    pub browser_url: String,

    pub process_id: i32,

    pub window_x: i32,
    pub window_y: i32,
    pub window_width: i32,
    pub window_height: i32,

    pub chunk_id: i32,
    pub frame_id: i32,

    pub image_path: String,
    // Optional: Include distance if you want to see the score
    // pub distance: f32,
}

pub fn group_results(results: &Vec<SearchResult>) -> Vec<GroupedSearchResult> {
    let mut map: HashMap<String, GroupedSearchResult> = HashMap::new();

    for r in results {
        let entry = map.entry(r.image_path.clone()).or_insert_with(|| GroupedSearchResult {
            app_name: r.app_name.clone(),
            window_title: r.window_title.clone(),
            browser_url: r.browser_url.clone(),
            text_contents: Vec::new(),
            source_id: r.chunk_id,
            captured_at: r.captured_at,
        });

        // Only push text content (multiple per image)
        entry.text_contents.push(r.text_content.clone());
    }

    map.into_values().collect()
}
impl ImmediateTx {
    /// Access the underlying connection for executing queries.
    pub fn conn(&mut self) -> &mut PoolConnection<Sqlite> {
        self.conn.as_mut().expect("connection already taken")
    }

    /// Commit the transaction. Must be called explicitly — drop without commit = rollback.
    pub async fn commit(mut self) -> Result<(), sqlx::Error> {
        if let Some(ref mut conn) = self.conn {
            sqlx::query("COMMIT").execute(&mut **conn).await?;
        }
        self.committed = true;
        Ok(())
    }

    /// Explicitly rollback the transaction.
    #[allow(dead_code)]
    pub async fn rollback(mut self) -> Result<(), sqlx::Error> {
        if let Some(ref mut conn) = self.conn {
            sqlx::query("ROLLBACK").execute(&mut **conn).await?;
        }
        self.committed = true; // prevent double-rollback in drop
        Ok(())
    }
}

impl Drop for ImmediateTx {
    fn drop(&mut self) {
        if !self.committed {
            if let Some(mut conn) = self.conn.take() {
                // Best-effort synchronous rollback to clean up the connection before
                // it goes back to the pool. We can't do async in Drop, so we use
                // futures::executor::block_on. SQLite connections are synchronous
                // under the hood, so this completes immediately.
                let _ = futures::executor::block_on(async {
                    sqlx::query("ROLLBACK").execute(&mut *conn).await
                });
                warn!("ImmediateTx dropped without commit — rolled back");
            }
        }
    }
}

impl DatabaseManager {
    pub async fn new(database_path: &str) -> Result<Self, sqlx::Error> {
        debug!("Initializing DatabaseManager with database path: {}", database_path);

        let connection_string: String = format!("sqlite://{}", database_path);

        unsafe {
            sqlite3_auto_extension(
                Some(
                    std::mem::transmute::<*const (), unsafe extern "C" fn()>(
                        sqlite3_vec_init as *const ()
                    )
                )
            );
        }

        // create db if not exists
        if !sqlx::Sqlite::database_exists(&connection_string).await? {
            sqlx::Sqlite::create_database(&connection_string).await?;
        }

        let connect_options: SqliteConnectOptions = connection_string
            .parse::<SqliteConnectOptions>()?
            .busy_timeout(Duration::from_secs(10))
            .pragma("journal_mode", "WAL")
            .pragma("cache_size", "-64000")
            .pragma("mmap_size", "268435456")
            .pragma("temp_store", "MEMORY")
            .pragma("wal_autocheckpoint", "4000");

        let pool = SqlitePoolOptions::new()
            .max_connections(10)
            .min_connections(3)
            .acquire_timeout(Duration::from_secs(10))
            .connect_with(connect_options).await?;

        Self::run_migrations(&pool).await?;

        Ok(Self { pool })
    }

    pub async fn begin_immediate_with_retry(&self) -> Result<ImmediateTx, sqlx::Error> {
        let max_retries = 5;
        for attempt in 1..=max_retries {
            let mut conn = self.pool.acquire().await?;
            match sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await {
                Ok(_) => {
                    return Ok(ImmediateTx {
                        conn: Some(conn),
                        committed: false,
                    });
                }
                Err(e) if attempt < max_retries && Self::is_busy_error(&e) => {
                    warn!(
                        "BEGIN IMMEDIATE busy (attempt {}/{}), retrying...",
                        attempt,
                        max_retries
                    );
                    drop(conn);
                    tokio::time::sleep(Duration::from_millis(100 * (attempt as u64))).await;
                }
                Err(e) => {
                    return Err(e);
                }
            }
        }
        unreachable!()
    }

    /// Check if a sqlx error is a SQLite BUSY variant (code 5, 517, etc.)
    fn is_busy_error(e: &sqlx::Error) -> bool {
        match e {
            sqlx::Error::Database(db_err) => {
                let msg = db_err.message().to_lowercase();
                msg.contains("database is locked") || msg.contains("busy")
            }
            _ => false,
        }
    }

    pub async fn insert_into_frames(
        &self,
        app_name: &str,
        window_title: &str,
        process_id: i32,
        is_focused: bool,
        browser_url: Option<&str>,
        window_x: i32,
        window_y: i32,
        window_width: i32,
        window_height: i32,
        image_path: &str,
        p_hash: u64
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx
            ::query(
                r#"
    INSERT INTO frames (
        app_name,
        window_title,
        process_id,
        is_focused,
        browser_url,
        window_x,
        window_y,
        window_width,
        window_height,
        image_path,
        p_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    "#
            )
            .bind(app_name)
            .bind(window_title)
            .bind(process_id)
            .bind(is_focused)
            .bind(browser_url)
            .bind(window_x)
            .bind(window_y)
            .bind(window_width)
            .bind(window_height)
            .bind(image_path)
            .bind(p_hash as i64)
            .execute(&self.pool).await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn insert_into_vec_chunks(&self, chunk_id: i64, embedding: Vec<f32>) {
        let bytes: &[u8] = bytemuck::cast_slice(&embedding);

        sqlx::query("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)")
            .bind(chunk_id)
            .bind(bytes)
            .execute(&self.pool).await
            .unwrap();
    }

    pub async fn perform_shallow_search(&self, search: SearchQuery) -> Result<Vec<SearchResult>> {
        let embedding_json = serde_json
            ::to_string(&search.embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "
    SELECT 
        f.id as frame_id,
        f.captured_at, 
        f.app_name, 
        f.window_title, 
        f.process_id,
        f.is_focused,
        f.browser_url,
        f.window_x,
        f.window_y,
        f.window_width,
        f.window_height,
        f.image_path,
        c.text_content,
        c.id as chunk_id,
        vec_distance_cosine(v.embedding, "
        );

        qb.push_bind(embedding_json.clone());

        qb.push(
            ") as score
    FROM chunks c
    JOIN frames f ON c.frame_id = f.id
    JOIN vec_chunks v ON v.chunk_id = c.id
    WHERE vec_distance_cosine(v.embedding, "
        );

        qb.push_bind(embedding_json.clone());

        qb.push(") < 0.65
    ORDER BY score ASC
    LIMIT 20
");

        let results = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

        Ok(results)
    }

    pub async fn perform_deep_search(&self, search: SearchQuery) -> Result<Vec<SearchResult>> {
        let embedding_json = serde_json
            ::to_string(&search.embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        let keywords_str = search.key_words
            .as_ref()
            .map(|k| {
                k.iter()
                    .filter(|w| !w.trim().is_empty())
                    .map(|w| format!("{}*", w))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            })
            .unwrap_or_default();

        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"
        WITH

        -- 1️⃣ Semantic Retrieval (High Recall)
        vector_matches AS (
            SELECT
                chunk_id as id,
                vec_distance_cosine(embedding, 
        "#
        );

        qb.push_bind(embedding_json);

        qb.push(
            r#") as semantic_score
        FROM vec_chunks
        WHERE semantic_score < 0.90
        LIMIT 150
        ),

        -- 2️⃣ Keyword Retrieval
        keyword_matches AS (
        "#
        );

        if !keywords_str.is_empty() {
            qb.push(
                "SELECT rowid as id, 1.0 as keyword_hit FROM chunks_fts WHERE chunks_fts MATCH "
            );
            qb.push_bind(keywords_str);
        } else {
            qb.push("SELECT NULL as id, 0.0 as keyword_hit WHERE 1=0");
        }

        qb.push(
            r#"
        ),

        combined AS (
            SELECT id,
                   MIN(semantic_score) as semantic_score,
                   MAX(keyword_hit) as keyword_hit
            FROM (
                SELECT id, semantic_score, 0.0 as keyword_hit FROM vector_matches
                UNION ALL
                SELECT id, 0.5 as semantic_score, keyword_hit FROM keyword_matches
            )
            GROUP BY id
        )

        SELECT
            f.id as frame_id,
            f.captured_at,
            f.app_name,
            f.window_title,
            f.process_id,
            f.is_focused,
            f.browser_url,
            f.window_x,
            f.window_y,
            f.window_width,
            f.window_height,
            f.image_path,
            c.text_content,
            c.id as chunk_id,

            -- 3️ FINAL SCORE (Deep Ranking)
            (
                (1 - semantic_score) * 0.7
                + keyword_hit * 0.05
                + CASE WHEN f.is_focused = 1 THEN 0.05 ELSE 0 END
                + (1.0 / (1 + (julianday('now') - julianday(f.captured_at)))) * 0.2
            ) as final_score

        FROM combined
        JOIN chunks c ON combined.id = c.id
        JOIN frames f ON c.frame_id = f.id

        ORDER BY final_score DESC
        LIMIT 50
        "#
        );

        let results = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

        Ok(results)
    }

    pub async fn perform_search(&self, search: SearchQuery) -> Result<Vec<SearchResult>> {
        let embedding_json = serde_json
            ::to_string(&search.embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        let keywords_str = search.key_words
            .as_ref()
            .map(|k| {
                k.iter()
                    .filter(|w| !w.trim().is_empty())
                    .map(|w| format!("\"{}\"*", w))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            })
            .unwrap_or_default();
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"
WITH

-- 0️⃣ Metadata Filtering FIRST
filtered_chunks AS (
    SELECT
        c.id,
        c.text_content,
        f.*
    FROM chunks c
    JOIN frames f ON c.frame_id = f.id
    WHERE 1=1
"#
        );

        // Metadata filter: App Name
        if let Some(app) = &search.app_name {
            qb.push(" AND LOWER(f.app_name) LIKE ");
            qb.push_bind(format!("%{}%", app.to_lowercase()));
        }

        // Metadata filter: Window Title
        if let Some(win) = &search.window_name {
            qb.push(" AND LOWER(f.window_title) LIKE ");
            qb.push_bind(format!("%{}%", win.to_lowercase()));
        }

        // Metadata filter: Time range
        if let Some((start, end)) = search.time_range {
            qb.push(" AND datetime(f.captured_at) BETWEEN datetime(");
            qb.push_bind(start.to_rfc3339());
            qb.push(") AND datetime(");
            qb.push_bind(end.to_rfc3339());
            qb.push(") ");
        }

        qb.push(
            r#"
),

-- 1️ Semantic Retrieval (ONLY on filtered chunks)
vector_matches AS (
    SELECT
        v.chunk_id as id,
        vec_distance_cosine(v.embedding,
"#
        );

        qb.push_bind(embedding_json);

        qb.push(
            r#") as semantic_score
    FROM vec_chunks v
    JOIN filtered_chunks fc ON fc.id = v.chunk_id
    ORDER BY semantic_score ASC
    LIMIT 150
),

-- 2️ Keyword Retrieval (ONLY filtered)
keyword_matches AS (
"#
        );

        if !keywords_str.is_empty() {
            qb.push(
                "SELECT rowid as id, 1.0 as keyword_hit FROM chunks_fts 
         WHERE chunks_fts MATCH "
            );
            qb.push_bind(keywords_str);
            qb.push(" AND rowid IN (SELECT id FROM filtered_chunks)");
        } else {
            qb.push("SELECT NULL as id, 0.0 as keyword_hit WHERE 1=0");
        }

        qb.push(
            r#"
),

combined AS (
    SELECT id,
           MIN(semantic_score) as semantic_score,
           MAX(keyword_hit) as keyword_hit
    FROM (
        SELECT id, semantic_score, 0.0 as keyword_hit FROM vector_matches
        UNION ALL
        SELECT id, 0.5 as semantic_score, keyword_hit FROM keyword_matches
    )
    GROUP BY id
)

SELECT
    f.id as frame_id,
    f.captured_at,
    f.app_name,
    f.window_title,
    f.process_id,
    f.is_focused,
    f.browser_url,
    f.window_x,
    f.window_y,
    f.window_width,
    f.window_height,
    f.image_path,
    c.text_content,
    c.id as chunk_id,

    (
        (1 - semantic_score) * 0.7
        + keyword_hit * 0.3
        + CASE WHEN f.is_focused = 1 THEN 0.3 ELSE 0 END
        + (1.0 / (1 + (julianday('now') - julianday(f.captured_at)))) * 0.2
    ) as final_score

FROM combined
JOIN chunks c ON combined.id = c.id
JOIN frames f ON c.frame_id = f.id

ORDER BY final_score DESC
LIMIT 50
"#
        );
        let results = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

        Ok(results)
    }

    pub async fn insert_into_chunks(
        &self,
        frame_id: i64,
        text_content: &str,
        role: &str,
        bbox: &str,
        text_hash: i64
    ) -> Result<i64, sqlx::Error> {
        let id = sqlx
            ::query(
                "
            INSERT INTO chunks (frame_id, text_content, role, bbox, text_hash) VALUES (?1, ?2, ?3, ?4, ?5)
        "
            )
            .bind(frame_id)
            .bind(text_content)
            .bind(role)
            .bind(bbox)
            .bind(text_hash)
            .execute(&self.pool).await?
            .last_insert_rowid();

        Ok(id)
    }

    pub async fn find_chunk_by_hash(&self, hash: u64) -> Result<Option<i64>, sqlx::Error> {
        let result = sqlx
            ::query_scalar::<_, i64>("SELECT id FROM chunks WHERE text_hash = ?1")
            .bind(hash as i64)
            .fetch_optional(&self.pool).await?;

        Ok(result)
    }

    pub async fn insert_into_occurances(
        &self,
        frame_id: i64,
        chunk_id: i64,
        bbox: &str
    ) -> Result<(), sqlx::Error> {
        sqlx
            ::query("INSERT INTO occurances (frame_id, chunk_id, bbox) VALUES (?1, ?2, ?3)")
            .bind(frame_id)
            .bind(chunk_id)
            .bind(bbox)
            .execute(&self.pool).await?;

        Ok(())
    }

    async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        debug!("Running database migrations");

        sqlx::migrate!("../../migrations").run(pool).await?;

        Ok(())
    }
}
