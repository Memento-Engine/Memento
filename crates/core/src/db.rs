use chrono::{ DateTime, Utc };
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{ SqliteConnectOptions, SqlitePool, SqlitePoolOptions };
use std::time::Duration;
use sqlx::pool::PoolConnection;
use tracing::{ warn, info, error, debug };
use libsqlite3_sys::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;
use sqlx::{ sqlite::SqliteRow, Row, QueryBuilder, Sqlite, Result, FromRow };

pub struct SearchQuery {
    pub app_name: Option<String>,
    pub window_name: Option<String>,
    pub browser_url: Option<String>,
    pub focused: bool,
    pub query: String,
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

// Ensure your result struct can be mapped automatically
#[derive(Debug, FromRow)]
pub struct SearchResult {
    pub captured_at: DateTime<Utc>, // sqlx maps SQLite strings/ints to DateTime automatically
    pub app_name: String,
    pub window_title: String,
    pub text_content: String,
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
        p_hash: u64,
        captured_at: DateTime<Utc>
    ) -> Result<i64, sqlx::Error> {
        let id = sqlx
            ::query(
                "INSERT INTO frames (app_name, window_title, p_hash, captured_at)
         VALUES (?1, ?2, ?3, ?4)"
            )
            .bind(app_name)
            .bind(window_title)
            .bind(p_hash as i64) // sqlite INTEGER = i64
            .bind(captured_at)
            .execute(&self.pool).await
            ? // IMPORTANT
            .last_insert_rowid();
        Ok(id)
    }

    pub async fn insert_into_vec_chunks(&self, chunk_id: i64, embedding: Vec<f32>) {
        let bytes: &[u8] = bytemuck::cast_slice(&embedding);

        sqlx::query("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)")
            .bind(chunk_id)
            .bind(bytes)
            .execute(&self.pool).await
            .unwrap();
    }

    pub async fn perform_search_test(
        &self,
        _search: SearchQuery,
        _query_embedding: Vec<f32>
    ) -> Result<()> {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "SELECT * FROM frames WHERE app_name = "
        );
        qb.push_bind("Google Chrome");

        // 1. Use .build() instead of .build_query_as()
        // This returns a raw query that doesn't try to map to a struct.
        let query = qb.build();

        // 2. Fetch the rows as generic SqliteRow objects
        let rows = query.fetch_all(&self.pool).await?;

        // 3. Log the results dynamically
        info!("Found {} rows matching 'Google Chrome'", rows.len());

        for row in rows {
            // You can access columns by name or index safely.
            // This won't crash even if some columns are missing from your struct.
            let id: i64 = row.get("id");
            let app: String = row.get("app_name");
            let title: Option<String> = row.get("window_title");

            info!("Row -> ID: {}, App: {}, Title: {:?}", id, app, title);
        }

        Ok(())
    }

    pub async fn debug_search(&self, query_embedding: Vec<f32>) -> Result<()> {
        // 1. Convert embedding
        let embedding_json = serde_json
            ::to_string(&query_embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        // 2. Simple Direct Query
        // We select the top 5 closest rows, NO MATTER how bad the match is.
        let sql =
            "
        SELECT 
            c.id,
            c.text_content,
            vec_distance_cosine(v.embedding, ?) as distance
        FROM vec_chunks v
        JOIN chunks c ON v.chunk_id = c.id
        ORDER BY distance ASC
        LIMIT 5
    ";

        let rows = sqlx::query(sql).bind(embedding_json).fetch_all(&self.pool).await?;

        println!("--- DEBUG SEARCH RESULTS ---");
        if rows.is_empty() {
            println!("CRITICAL: No rows returned. 'vec_chunks' table might be empty!");
        }

        for row in rows {
            let id: i64 = row.get("id");
            let text: String = row.get("text_content");
            let dist: f32 = row.get("distance");
            println!("ID: {}, Dist: {:.4} | Text: {:.50}...", id, dist, text);
        }
        println!("----------------------------");
        Ok(())
    }

    pub async fn perform_search(
        &self,
        search: SearchQuery,
        query_embedding: Vec<f32>
    ) -> Result<Vec<SearchResult>> {
        // 1. Prepare Data
        let embedding_json = serde_json
            ::to_string(&query_embedding)
            .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

        // FIX: Add Wildcards (*) so "microservice" matches "microservices"
        let keywords = search.key_words
            .as_ref()
            .map(|k|
                k
                    .iter()
                    .map(|w| format!("{}*", w))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            )
            .unwrap_or_else(|| "".to_string());

        // 2. Start Query Builder (The CTE starts here)
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "WITH matches AS (
                -- A. Vector Search Candidates
                SELECT 
                    chunk_id as id, 
                    vec_distance_cosine(embedding, "
        );

        qb.push_bind(embedding_json);
        // FIX: Ensure threshold is loose enough (0.65)
        qb.push(") as distance FROM vec_chunks WHERE distance < 0.65 ");

        // 3. Add Keyword Search (Only if keywords exist)
        if !keywords.is_empty() {
            qb.push(" UNION ALL ");
            // We give FTS matches a 'better' distance (-1.0) so they sort first
            qb.push("SELECT rowid as id, -1.0 as distance FROM chunks_fts WHERE chunks_fts MATCH ");
            qb.push_bind(keywords);
        }

        qb.push(
            ") 
            -- 4. Main Selection (Join the temporary 'matches' to real tables)
            SELECT 
                f.captured_at, 
                f.app_name, 
                f.window_title, 
                c.text_content,
                MIN(m.distance) as best_score -- Remove duplicates if found by both engines
            FROM matches m
            JOIN chunks c ON m.id = c.id
            JOIN frames f ON c.frame_id = f.id
            WHERE 1=1 "
        );

        // 5. Apply Metadata Filters
        if let Some(app) = &search.app_name {
            qb.push(" AND LOWER(f.app_name) LIKE ");
            qb.push_bind(format!("%{}%", app.to_lowercase()));
        }

        if let Some(win) = &search.window_name {
            qb.push(" AND LOWER(f.window_title) LIKE ");
            qb.push_bind(format!("%{}%", win.to_lowercase()));
        }

        if let Some((start, end)) = search.time_range {
            // We cast both the DB column and the input binding to standard format
            // This ignores nanoseconds and timezone differences (Z vs +00:00)
            qb.push(" AND datetime(f.captured_at) BETWEEN datetime(");
            qb.push_bind(start.to_rfc3339());
            qb.push(") AND datetime(");
            qb.push_bind(end.to_rfc3339());
            qb.push(") ");
        }

        // 6. Order & Limit
        qb.push(" GROUP BY c.id ORDER BY best_score ASC, f.captured_at DESC LIMIT 20");

        // 7. Execute
        // If this still returns zero, your filters (App Name / Time) do not match the data.
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
