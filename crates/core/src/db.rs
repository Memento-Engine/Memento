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

pub struct DatabaseManager {
    pub pool: SqlitePool,
}

pub struct ImmediateTx {
    conn: Option<PoolConnection<Sqlite>>,
    committed: bool,
}

// Ensure your result struct can be mapped automatically
#[derive(Debug, FromRow, Serialize, Deserialize)]
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

    pub chunk_id : i32,

    pub image_path: String,
    // Optional: Include distance if you want to see the score
    // pub distance: f32,
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

    pub async fn perform_search(
        &self,
        search: SearchQuery
    ) -> Result<Vec<SearchResult>> {
        // 1. Prepare Embedding JSON
        let embedding_json = serde_json
            ::to_string(&search.embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        // 2. Prepare Keywords (Add Wildcards)
        // specific keywords like "searched" might fail if exact, so we use prefixes (e.g. "search*")
        let keywords_str = search.key_words
            .as_ref()
            .map(|k| {
                k.iter()
                    .filter(|w| !w.trim().is_empty()) // Remove empty keywords
                    .map(|w| format!("{}*", w)) // Add wildcard
                    .collect::<Vec<_>>()
                    .join(" OR ")
            })
            .unwrap_or_default();

        // 3. Start Query Builder with CTE
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "WITH matches AS (
            -- A. Vector Search (Relaxed Threshold)
            SELECT 
                chunk_id as id, 
                vec_distance_cosine(embedding, "
        );

        qb.push_bind(embedding_json);

        // NOTE: We relax the threshold to 0.80.
        // 0.65 is often too strict for short text chunks.
        qb.push(") as distance FROM vec_chunks WHERE distance < 0.80 ");

        // 4. Add Keyword Search (Union) if keywords exist
        if !keywords_str.is_empty() {
            qb.push(" UNION ALL ");
            // Give FTS matches a 'better' distance (-1.0) so they sort first
            qb.push("SELECT rowid as id, -1.0 as distance FROM chunks_fts WHERE chunks_fts MATCH ");
            qb.push_bind(keywords_str);
        }

        qb.push(
            ") 
        -- 5. Main Selection
        SELECT 
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
            MIN(m.distance) as best_score -- Deduplicate if found by both engines
        FROM matches m
        JOIN chunks c ON m.id = c.id
        JOIN frames f ON c.frame_id = f.id
        WHERE 1=1 "
        );

        // 6. Apply Metadata Filters (App Name)
        if let Some(app) = &search.app_name {
            // We use LOWER() for case-insensitive matching
            qb.push(" AND LOWER(f.app_name) LIKE ");
            qb.push_bind(format!("%{}%", app.to_lowercase()));
        }

        // 7. Apply Metadata Filters (Window Name)
        if let Some(win) = &search.window_name {
            qb.push(" AND LOWER(f.window_title) LIKE ");
            qb.push_bind(format!("%{}%", win.to_lowercase()));
        }

        // 8. Apply Time Range
        if let Some((start, end)) = search.time_range {
            qb.push(" AND datetime(f.captured_at) BETWEEN datetime(");
            qb.push_bind(start.to_rfc3339());
            qb.push(") AND datetime(");
            qb.push_bind(end.to_rfc3339());
            qb.push(") ");
        }

        // 9. Order & Limit
        // Sort by score (ascending, so -1.0 first, then 0.1, etc.)
        // Then by time (most recent first)
        qb.push(" GROUP BY c.id ORDER BY best_score ASC, f.captured_at DESC LIMIT 50");

        // 10. Execute
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
