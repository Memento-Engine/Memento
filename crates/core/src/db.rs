use chrono::{ DateTime, Utc };
use image::DynamicImage;
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{ SqliteConnectOptions, SqlitePool, SqlitePoolOptions };
use std::fs;
use std::time::Duration;
use sqlx::pool::PoolConnection;
use tracing::{ debug, info, warn };
use libsqlite3_sys::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;
use sqlx::{ QueryBuilder, Sqlite, Result, FromRow };
use serde::{ Serialize, Deserialize };
use std::fmt::Debug;
use std::collections::{ HashMap, HashSet };
use std::sync::{ Arc, Mutex };
// use crate::{ embedding::engine::EmbeddingModel };

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum SearchType {
    Vector,
    FTS,
    Hybrid,
}

impl Rect {
    /// Check if two rectangles overlap (share any area)
    pub fn overlaps(&self, other: &Rect) -> bool {
        let self_right = self.x + (self.width as i32);
        let self_bottom = self.y + (self.height as i32);
        let other_right = other.x + (other.width as i32);
        let other_bottom = other.y + (other.height as i32);

        self.x < other_right &&
            self_right > other.x &&
            self.y < other_bottom &&
            self_bottom > other.y
    }

    /// Compute the intersection area between two rectangles (0 if no overlap)
    pub fn intersection_area(&self, other: &Rect) -> u64 {
        let self_right = self.x + (self.width as i32);
        let self_bottom = self.y + (self.height as i32);
        let other_right = other.x + (other.width as i32);
        let other_bottom = other.y + (other.height as i32);

        let left = self.x.max(other.x);
        let top = self.y.max(other.y);
        let right = self_right.min(other_right);
        let bottom = self_bottom.min(other_bottom);

        if right > left && bottom > top {
            ((right - left) as u64) * ((bottom - top) as u64)
        } else {
            0
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChunkBlock {
    pub text: String,
    pub text_json: String,
    pub text_embeddings: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct ProcessedOcrResult {
    pub window_name: String,
    pub app_name: String,
    pub text_blocks: Vec<ChunkBlock>,
    pub focused: bool,
    pub confidence: f64,
    pub browser_url: Option<String>,
    pub monitor_dimensions: Rect,
    pub image: DynamicImage,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchQuery {
    pub app_name: Option<Vec<String>>,
    pub window_name: Option<Vec<String>>,
    pub browser_url: Option<Vec<String>>,
    pub query: String,
    pub semantic_query: Option<String>,
    pub key_words: Option<Vec<String>>,
    pub time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    pub entities: Option<Vec<String>>,
    pub embedding: Option<Vec<f32>>,
    pub rewrite_query: Option<bool>,
    pub use_cross_encoder: Option<bool>,
}

// Intermediate Struct for getting struct from rewritten query
#[derive(Serialize, Deserialize, Debug)]
pub struct StructuredQuery {
    pub app_name: Option<Vec<String>>,
    pub window_name: Option<Vec<String>>,
    pub browser_url: Option<Vec<String>>,
    pub query: String,
    pub semantic_query: Option<String>,
    pub key_words: Option<Vec<String>>,
    pub time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    pub entities: Option<Vec<String>>,
    pub rewrite_query: Option<bool>,
    pub use_cross_encoder: Option<bool>,
}

pub struct DatabaseManager {
    pub pool: SqlitePool,
    rerank_state: Arc<Mutex<CrossEncoderDecision>>,
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
    pub text_json: String,
    pub browser_url: String,

    pub window_x: i32,
    pub window_y: i32,
    pub window_width: i32,
    pub window_height: i32,

    pub chunk_id: i32,
    pub frame_id: i32,

    pub image_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CrossEncoderDecision {
    pub should_run: bool,
    pub candidate_pool: usize,
    pub requested_limit: usize,
    pub reason: String,
    pub decided_at: DateTime<Utc>,
}

impl Default for CrossEncoderDecision {
    fn default() -> Self {
        Self {
            should_run: false,
            candidate_pool: 0,
            requested_limit: 0,
            reason: "not evaluated yet".to_string(),
            decided_at: Utc::now(),
        }
    }
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
            // Ensure the database directory exists using the standardized config
            let db_dir = crate::config::database_dir();
            if !db_dir.exists() {
                fs::create_dir_all(&db_dir)?;
            }
            tracing::info!("connectionString : {:#?}", connection_string);
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

        Ok(Self {
            pool,
            rerank_state: Arc::new(Mutex::new(CrossEncoderDecision::default())),
        })
    }

    pub fn last_rerank_decision(&self) -> CrossEncoderDecision {
        self.rerank_state
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default()
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

    fn build_fts_select(&self, qb: &mut QueryBuilder<Sqlite>, limit: i32) {
        qb.push(
            r#"
        SELECT
            fc.captured_at,
            fc.app_name,
            fc.window_title,
            fc.text_content,
            fc.text_json,
            fc.browser_url,
            fc.window_x,
            fc.window_y,
            fc.window_width,
            fc.window_height,
            fc.chunk_id,
            fc.frame_id,
            fc.image_path
        FROM keyword_matches km
        JOIN filtered_chunks fc ON fc.chunk_id = km.id
        ORDER BY km.keyword_hit DESC, fc.captured_at DESC
        LIMIT
        "#
        );
        qb.push_bind(limit);
    }

    fn build_vector_select(
        &self,
        qb: &mut QueryBuilder<Sqlite>,
        _include_text_layout: bool,
        limit: i32
    ) {
        qb.push(
            r#"
        SELECT
            fc.captured_at,
            fc.app_name,
            fc.window_title,
            fc.text_content,
            fc.text_json,
            fc.browser_url,
            fc.window_x,
            fc.window_y,
            fc.window_width,
            fc.window_height,
            fc.chunk_id,
            fc.frame_id,
            fc.image_path
        FROM vector_matches vm
        JOIN filtered_chunks fc ON fc.chunk_id = vm.id
        ORDER BY vm.semantic_score
        LIMIT
        "#
        );
        qb.push_bind(limit);
    }

    fn build_hybrid_merge(&self, qb: &mut QueryBuilder<Sqlite>) {
        qb.push(
            r#"
combined AS (
    SELECT
        id,
        SUM(rrf_component) as rrf_score,
        MIN(semantic_score) as semantic_score,
        MAX(keyword_hit) as keyword_hit
    FROM (
        SELECT
            id,
            1.0 / (60.0 + ROW_NUMBER() OVER (ORDER BY semantic_score ASC)) as rrf_component,
            semantic_score,
            0.0 as keyword_hit
        FROM vector_matches
        UNION ALL
        SELECT
            id,
            1.0 / (60.0 + ROW_NUMBER() OVER (ORDER BY keyword_hit DESC, id ASC)) as rrf_component,
            1.0 as semantic_score,
            keyword_hit
        FROM keyword_matches
        WHERE id IS NOT NULL
    )
    GROUP BY id
)
"#
        );
    }

    fn build_fts_cte<'a>(&self, qb: &mut QueryBuilder<'a, Sqlite>, keywords_str: &'a str) {
        qb.push(r#"
            keyword_matches AS (
            "#);

        if !keywords_str.is_empty() {
            qb.push(
                r#"
                SELECT
                    rowid as id,
                    1.0 / (1.0 + ABS(bm25(chunks_fts))) as keyword_hit
                FROM chunks_fts
                WHERE chunks_fts MATCH
                "#
            );

            qb.push_bind(keywords_str);

            qb.push(" AND rowid IN (SELECT chunk_id FROM filtered_chunks)");
        } else {
            qb.push("SELECT NULL as id, 0.0 as keyword_hit WHERE 1=0");
        }

        qb.push(")");
    }

    fn build_vector_cte<'a>(
        &self,
        qb: &mut QueryBuilder<'a, Sqlite>,
        embedding_json: &'a str,
        limit: i32
    ) {
        qb.push(
            r#"
        vector_matches AS (
            SELECT
                v.chunk_id as id,
                vec_distance_cosine(v.embedding,
        "#
        );

        qb.push_bind(embedding_json);

        qb.push(
            r#"
        ) as semantic_score
        FROM vec_chunks v
        JOIN filtered_chunks fc ON fc.chunk_id = v.chunk_id
        ORDER BY semantic_score ASC
        LIMIT
        "#
        );
        qb.push_bind(limit);
        qb.push(")");
    }

    fn rewrite_keywords(key_words: Option<Vec<&str>>) -> Vec<String> {
        let mut uniq: HashSet<String> = HashSet::new();

        if let Some(words) = key_words {
            for raw in words {
                for token in raw.split_whitespace() {
                    let normalized = token
                        .trim_matches(|c: char| !c.is_alphanumeric())
                        .to_lowercase();

                    if normalized.len() < 2 {
                        continue;
                    }

                    uniq.insert(normalized.clone());

                    if normalized.ends_with("ing") && normalized.len() > 5 {
                        uniq.insert(normalized.trim_end_matches("ing").to_string());
                    } else if normalized.ends_with("ed") && normalized.len() > 4 {
                        uniq.insert(normalized.trim_end_matches("ed").to_string());
                    } else if normalized.ends_with('s') && normalized.len() > 3 {
                        uniq.insert(normalized.trim_end_matches('s').to_string());
                    }
                }
            }
        }

        let mut terms = uniq.into_iter().collect::<Vec<_>>();
        terms.sort();
        terms
    }

    fn build_keywords_match_query(keywords: &[String]) -> String {
        keywords
            .iter()
            .filter(|w| !w.trim().is_empty())
            .map(|w| format!("\"{}\"*", w))
            .collect::<Vec<_>>()
            .join(" OR ")
    }

    fn metadata_filter_count(
        app_names: &Option<Vec<&str>>,
        window_names: &Option<Vec<&str>>,
        browser_urls: &Option<Vec<&str>>,
        start_time: &Option<DateTime<Utc>>,
        end_time: &Option<DateTime<Utc>>
    ) -> usize {
        let app_count = app_names.as_ref().map_or(0, |v| v.len());
        let window_count = window_names.as_ref().map_or(0, |v| v.len());
        let url_count = browser_urls.as_ref().map_or(0, |v| v.len());
        let time_count = if start_time.is_some() && end_time.is_some() { 1 } else { 0 };

        app_count + window_count + url_count + time_count
    }

    fn build_cross_encoder_decision(
        candidate_count: usize,
        requested_limit: usize,
        metadata_filter_count: usize,
        keyword_count: usize
    ) -> CrossEncoderDecision {
        let effective_limit = requested_limit.max(1);
        let ambiguity_ratio = (candidate_count as f32) / (effective_limit as f32);
        let low_metadata_precision = metadata_filter_count == 0;

        let should_run =
            candidate_count > effective_limit &&
            (ambiguity_ratio >= 2.0 ||
                (low_metadata_precision && candidate_count >= 24) ||
                (keyword_count >= 3 && candidate_count >= 16));

        let candidate_pool = if should_run {
            (effective_limit * 3).min(120).max(effective_limit)
        } else {
            effective_limit
        };

        let reason = if should_run {
            format!(
                "high ambiguity (candidates={}, limit={}, metadata_filters={}, keywords={})",
                candidate_count,
                effective_limit,
                metadata_filter_count,
                keyword_count
            )
        } else {
            format!(
                "skip expensive rerank (candidates={}, limit={}, metadata_filters={}, keywords={})",
                candidate_count,
                effective_limit,
                metadata_filter_count,
                keyword_count
            )
        };

        CrossEncoderDecision {
            should_run,
            candidate_pool,
            requested_limit: effective_limit,
            reason,
            decided_at: Utc::now(),
        }
    }

    fn token_jaccard_similarity(a: &str, b: &str) -> f32 {
        let a_set: HashSet<&str> = a
            .split_whitespace()
            .filter(|t| !t.is_empty())
            .collect();
        let b_set: HashSet<&str> = b
            .split_whitespace()
            .filter(|t| !t.is_empty())
            .collect();

        if a_set.is_empty() || b_set.is_empty() {
            return 0.0;
        }

        let intersection = a_set.intersection(&b_set).count() as f32;
        let union = a_set.union(&b_set).count() as f32;

        if union == 0.0 {
            0.0
        } else {
            intersection / union
        }
    }

    fn result_similarity(a: &SearchResult, b: &SearchResult) -> f32 {
        if a.image_path == b.image_path {
            return 1.0;
        }

        let text_sim = Self::token_jaccard_similarity(&a.text_content, &b.text_content);
        let window_sim = if a.window_title.eq_ignore_ascii_case(&b.window_title) {
            0.2
        } else {
            0.0
        };

        (text_sim + window_sim).min(1.0)
    }

    fn apply_mmr_dedup(
        &self,
        results: Vec<SearchResult>,
        final_k: usize,
        lambda: f32
    ) -> Vec<SearchResult> {
        if results.len() <= 1 || final_k == 0 {
            return results.into_iter().take(final_k).collect();
        }

        let mut remaining: Vec<(usize, SearchResult)> = results.into_iter().enumerate().collect();
        let mut selected: Vec<(usize, SearchResult)> = Vec::new();
        let bounded_lambda = lambda.clamp(0.0, 1.0);

        while !remaining.is_empty() && selected.len() < final_k {
            let mut best_idx = 0usize;
            let mut best_score = f32::MIN;

            for (idx, (rank, candidate)) in remaining.iter().enumerate() {
                let relevance = 1.0 / ((*rank + 1) as f32);
                let max_similarity = selected
                    .iter()
                    .map(|(_, chosen)| Self::result_similarity(candidate, chosen))
                    .fold(0.0f32, f32::max);

                let mmr_score =
                    bounded_lambda * relevance - (1.0 - bounded_lambda) * max_similarity;

                if mmr_score > best_score {
                    best_score = mmr_score;
                    best_idx = idx;
                }
            }

            selected.push(remaining.swap_remove(best_idx));
        }

        selected
            .into_iter()
            .map(|(_, r)| r)
            .collect()
    }
    fn build_filtered_chunks_cte(
        &self,
        qb: &mut QueryBuilder<Sqlite>,
        app_names: Option<Vec<&str>>,
        window_names: Option<Vec<&str>>,
        browser_urls: Option<Vec<&str>>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        include_text_layout: bool
    ) {
        qb.push(
            r#"
filtered_chunks AS (
    SELECT
        c.id AS chunk_id,
        c.text_content,
"#
        );

        if include_text_layout {
            qb.push("        c.text_json,\n");
        } else {
            qb.push("        '' AS text_json,\n");
        }

        qb.push(
            r#"
        f.id AS frame_id,
        f.captured_at,
        f.app_name,
        f.window_title,
        f.is_focused,
        f.browser_url,
        f.window_x,
        f.window_y,
        f.window_width,
        f.window_height,
        f.monitor_height,
        f.monitor_width,
        f.image_path
    FROM chunks c
    JOIN frames f ON c.frame_id = f.id
    WHERE 1=1
"#
        );

        // Handle app_name array - match if ANY app_name variant matches
        if let Some(apps) = app_names {
            if !apps.is_empty() {
                qb.push(" AND (");
                for (idx, _) in apps.iter().enumerate() {
                    if idx > 0 {
                        qb.push(" OR ");
                    }
                    qb.push("LOWER(f.app_name) LIKE ");
                    qb.push_bind(format!("%{}%", apps[idx].to_lowercase()));
                }
                qb.push(")");
            }
        }

        // Handle window_title array - match if ANY window title variant matches
        if let Some(windows) = window_names {
            if !windows.is_empty() {
                qb.push(" AND (");
                for (idx, _) in windows.iter().enumerate() {
                    if idx > 0 {
                        qb.push(" OR ");
                    }
                    qb.push("LOWER(f.window_title) LIKE ");
                    qb.push_bind(format!("%{}%", windows[idx].to_lowercase()));
                }
                qb.push(")");
            }
        }

        // Handle browser_url array - match if ANY url variant matches
        if let Some(urls) = browser_urls {
            if !urls.is_empty() {
                qb.push(" AND (");
                for (idx, _) in urls.iter().enumerate() {
                    if idx > 0 {
                        qb.push(" OR ");
                    }
                    qb.push("LOWER(f.browser_url) LIKE ");
                    qb.push_bind(format!("%{}%", urls[idx].to_lowercase()));
                }
                qb.push(")");
            }
        }

        if let (Some(start), Some(end)) = (start_time, end_time) {
            // DB stores local time via datetime('now','localtime') — format as YYYY-MM-DD HH:MM:SS
            let local_start = start
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let local_end = end
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            qb.push(" AND f.captured_at BETWEEN ");
            qb.push_bind(local_start);
            qb.push(" AND ");
            qb.push_bind(local_end);
        }

        qb.push(")");
    }

    pub async fn get_results_by_chunk_ids(
        &self,
        chunk_ids: Vec<i32>,
        include_text_json: bool
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        if chunk_ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"
SELECT
    f.captured_at,
    f.app_name,
    f.window_title,
    f.browser_url,
    f.window_x,
    f.window_y,
    f.window_width,
    f.window_height,
    f.id AS frame_id,
    f.image_path,
    c.text_content,
    CASE 
        WHEN 
"#
        );

        qb.push_bind(include_text_json);

        qb.push(
            r#"
        THEN c.text_json
        ELSE ''
        END AS text_json,
        c.id AS chunk_id
    FROM frames f
    JOIN chunks c ON c.frame_id = f.id
    WHERE c.id IN (
"#
        );

        let mut separated = qb.separated(", ");

        for id in chunk_ids {
            separated.push_bind(id);
        }

        qb.push(")");

        let rows = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

        Ok(rows)
    }

    pub async fn search_tool(
        &self,
        app_names: Option<Vec<&str>>,
        window_names: Option<Vec<&str>>,
        browser_urls: Option<Vec<&str>>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        key_words: Option<Vec<&str>>,
        search_type: &SearchType,
        limit: Option<i32>,
        include_text_layout: bool,
        embedding_json: &str,
        _sort_field: Option<&str>,
        _sort_order: Option<&str>
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let requested_limit = limit.unwrap_or(40).clamp(1, 100);
        let candidate_fetch_limit = (requested_limit * 3).clamp(30, 150);
        let metadata_filter_count = Self::metadata_filter_count(
            &app_names,
            &window_names,
            &browser_urls,
            &start_time,
            &end_time
        );

        let rewritten_keywords = Self::rewrite_keywords(key_words);
        let keywords_str = Self::build_keywords_match_query(&rewritten_keywords);
        let has_keywords = !rewritten_keywords.is_empty();

        let effective_search_type = match search_type {
            SearchType::Vector if has_keywords => SearchType::Hybrid,
            SearchType::Hybrid if !has_keywords => SearchType::Vector,
            _ => *search_type,
        };

        if matches!(effective_search_type, SearchType::FTS) && !has_keywords {
            if let Ok(mut state) = self.rerank_state.lock() {
                *state = CrossEncoderDecision {
                    should_run: false,
                    candidate_pool: 0,
                    requested_limit: requested_limit as usize,
                    reason: "skip search: fts selected without keywords".to_string(),
                    decided_at: Utc::now(),
                };
            }
            return Ok(Vec::new());
        }

        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("WITH ");

        self.build_filtered_chunks_cte(
            &mut qb,
            app_names,
            window_names,
            browser_urls,
            start_time,
            end_time,
            include_text_layout
        );

        match effective_search_type {
            SearchType::Vector => {
                qb.push(",");
                self.build_vector_cte(&mut qb, &embedding_json, candidate_fetch_limit);

                self.build_vector_select(&mut qb, include_text_layout, candidate_fetch_limit);
            }

            SearchType::FTS => {
                qb.push(",");
                self.build_fts_cte(&mut qb, &keywords_str);

                self.build_fts_select(&mut qb, candidate_fetch_limit);
            }

            SearchType::Hybrid => {
                qb.push(",");
                self.build_vector_cte(&mut qb, &embedding_json, candidate_fetch_limit);

                qb.push(",");
                self.build_fts_cte(&mut qb, &keywords_str);

                qb.push(",");
                self.build_hybrid_merge(&mut qb);

                self.build_final_select(&mut qb, candidate_fetch_limit);
            }
        }

        let mut results = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

        let decision = Self::build_cross_encoder_decision(
            results.len(),
            requested_limit as usize,
            metadata_filter_count,
            rewritten_keywords.len()
        );

        if let Ok(mut state) = self.rerank_state.lock() {
            *state = decision.clone();
        }

        if decision.should_run && results.len() > decision.candidate_pool {
            results.truncate(decision.candidate_pool);
        }

        let deduped = self.apply_mmr_dedup(results, requested_limit as usize, 0.75);

        info!(
            "Search strategy => effective_type={:?}, keywords={}, metadata_filters={}, rerank={}, reason={}",
            effective_search_type,
            rewritten_keywords.len(),
            metadata_filter_count,
            decision.should_run,
            decision.reason
        );

        Ok(deduped)
    }

    fn build_final_select(&self, qb: &mut QueryBuilder<Sqlite>, limit: i32) {
        qb.push(
            r#"
            SELECT
            f.id as frame_id,
            f.captured_at,
            f.app_name,
            f.window_title,
            f.is_focused,
            f.browser_url,
            f.window_x,
            f.window_y,
            f.window_width,
            f.window_height,
            f.image_path,

            c.text_content,
            fc.text_json,
            c.id as chunk_id,

            (
              rrf_score * 0.85
                + CASE WHEN f.is_focused = 1 THEN 0.3 ELSE 0 END
                + (1.0 / (1 + (julianday('now') - julianday(f.captured_at)))) * 0.2
            ) as final_score

            FROM combined
            JOIN chunks c ON combined.id = c.id
            JOIN filtered_chunks fc ON fc.chunk_id = c.id
            JOIN frames f ON c.frame_id = f.id

            ORDER BY final_score DESC
      LIMIT
"#
        );
        qb.push_bind(limit);
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

    pub async fn insert_frames_with_chunks(
        &self,
        result: &ProcessedOcrResult,
        image_path: &str
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.begin_immediate_with_retry().await?;

        let ProcessedOcrResult {
            app_name,
            browser_url,
            focused,
            monitor_dimensions,
            text_blocks,
            window_name,
            ..
        } = result;

        // Insert Frame
        let frame_id = sqlx
            ::query(
                r#"
                INSERT INTO frames (
                app_name,
                window_title,
                is_focused,
                browser_url,
                window_x,
                window_y,
                window_width,
                window_height,
                monitor_width,
                monitor_height,
                image_path
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(app_name)
            .bind(window_name)
            .bind(focused)
            .bind(browser_url)
            .bind(monitor_dimensions.x as i64)
            .bind(monitor_dimensions.y as i64)
            .bind(monitor_dimensions.width as i64)
            .bind(monitor_dimensions.height as i64)
            .bind(monitor_dimensions.width as i64)
            .bind(monitor_dimensions.height as i64)
            .bind(image_path)
            .execute(&mut **tx.conn()).await?
            .last_insert_rowid();

        // Insert Chunks
        for chunk in text_blocks {
            let chunk_id = sqlx
                ::query(
                    r#"
            INSERT INTO chunks (
                frame_id,
                text_content,
                text_json
            )
            VALUES (?, ?, ?)
            "#
                )
                .bind(frame_id)
                .bind(&chunk.text)
                .bind(&chunk.text_json)
                .execute(&mut **tx.conn()).await?
                .last_insert_rowid();

            // Only write vectors when non-empty; sqlite-vec rejects zero-length vectors.
            if !chunk.text_embeddings.is_empty() {
                let embedding_bytes: Vec<u8> = chunk.text_embeddings
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();

                sqlx
                    ::query(
                        r#"
                INSERT INTO vec_chunks (chunk_id, embedding)
                VALUES (?, ?)
                "#
                    )
                    .bind(chunk_id)
                    .bind(&embedding_bytes)
                    .execute(&mut **tx.conn()).await?;
            }
        }

        tx.commit().await?;

        Ok(())
    }

    async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        debug!("Running database migrations");

        sqlx::migrate!("../../migrations").run(pool).await?;

        Ok(())
    }

    /// Save a chat message and return its id.
    pub async fn save_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)"
        )
            .bind(session_id)
            .bind(role)
            .bind(content)
            .execute(&self.pool)
            .await?;

        Ok(result.last_insert_rowid())
    }

    /// Save message sources (chunk references) for a message.
    pub async fn save_message_sources(
        &self,
        message_id: i64,
        sources: &[(i64, &str, Option<&str>)], // (chunk_id, usage_type, step_id)
    ) -> Result<(), sqlx::Error> {
        if sources.is_empty() {
            return Ok(());
        }

        let mut tx = self.begin_immediate_with_retry().await?;

        for (chunk_id, usage_type, step_id) in sources {
            sqlx::query(
                "INSERT INTO message_sources (message_id, chunk_id, usage_type, step_id) VALUES (?, ?, ?, ?)"
            )
                .bind(message_id)
                .bind(chunk_id)
                .bind(usage_type)
                .bind(step_id)
                .execute(&mut **tx.conn())
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Load recent messages for a session.
    /// Returns (id, role, content, created_at) ordered oldest-first.
    pub async fn get_session_messages(
        &self,
        session_id: &str,
        limit: i32,
    ) -> Result<Vec<(i64, String, String, String)>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?"
        )
            .bind(session_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;

        Ok(rows.iter().map(|r| {
            use sqlx::Row;
            (
                r.get::<i64, _>("id"),
                r.get::<String, _>("role"),
                r.get::<String, _>("content"),
                r.get::<String, _>("created_at"),
            )
        }).collect())
    }
}
