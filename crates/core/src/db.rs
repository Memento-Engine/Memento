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
use std::collections::HashMap;
use std::sync::{ Arc, Mutex };
// use crate::{ embedding::engine::EmbeddingModel };

#[derive(Debug, Clone, Copy)]
pub struct Rect {
  pub x: i32,
  pub y: i32,
  pub width: u32,
  pub height: u32,
}

#[derive(Serialize, Deserialize, Debug)]
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

    self.x < other_right && self_right > other.x && self.y < other_bottom && self_bottom > other.y
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
          std::mem::transmute::<*const (), unsafe extern "C" fn()>(sqlite3_vec_init as *const ())
        )
      );
    }

    // create db if not exists
    if !sqlx::Sqlite::database_exists(&connection_string).await? {
      let home_dir = dirs::home_dir().expect("Failed to get the homeDir");
      let memento_dir = home_dir.join(".memento");
      if !memento_dir.exists() {
        fs::create_dir_all(memento_dir)?;
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
          warn!("BEGIN IMMEDIATE busy (attempt {}/{}), retrying...", attempt, max_retries);
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

  fn build_hybrid_select(
    &self,

    qb: &mut QueryBuilder<Sqlite>
  ) {
    qb.push(r#"
SELECT *
FROM combined
ORDER BY semantic_score ASC, keyword_hit DESC
LIMIT 50
"#);
  }
  fn build_fts_select(&self, qb: &mut QueryBuilder<Sqlite>) {
    qb.push(
      r#"
        SELECT *
        FROM keyword_matches
        WHERE id IS NOT NULL
        LIMIT 50
        "#
    );
  }

  fn build_vector_select(&self, qb: &mut QueryBuilder<Sqlite>, include_text_layout: bool) {
    qb.push(
      r#"
        SELECT
            fc.captured_at,
            fc.app_name,
            fc.window_title,
            fc.text_content,
        "#
    );

    if include_text_layout {
      qb.push("fc.text_json");
    } else {
      qb.push("'' AS text_json");
    }

    qb.push(
      r#",
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
        LIMIT 50
        "#
    );
  }

  fn build_hybrid_merge(&self, qb: &mut QueryBuilder<Sqlite>) {
    qb.push(
      r#"
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
                    1.0 as keyword_hit
                FROM chunks_fts
                WHERE chunks_fts MATCH
                "#
      );

      qb.push_bind(keywords_str);

      qb.push(" AND rowid IN (SELECT id FROM filtered_chunks)");
    } else {
      qb.push("SELECT NULL as id, 0.0 as keyword_hit WHERE 1=0");
    }

    qb.push(")");
  }

  fn build_vector_cte<'a>(&self, qb: &mut QueryBuilder<'a, Sqlite>, embedding_json: &'a str) {
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
        LIMIT 150
        )
        "#
    );
  }
  fn build_filtered_chunks_cte(
    &self,
    qb: &mut QueryBuilder<Sqlite>,
    app_names: Option<Vec<&str>>,
    window_names: Option<Vec<&str>>,
    browser_urls: Option<Vec<&str>>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>
  ) {
    qb.push(
      r#"
filtered_chunks AS (
    SELECT
        c.id AS chunk_id,
        c.text_content,
        c.text_json,
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
      qb.push(" AND f.captured_at BETWEEN ");
      qb.push_bind(start.to_rfc3339());
      qb.push(" AND ");
      qb.push_bind(end.to_rfc3339());
    }

    qb.push(")");
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
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("WITH ");

    let keywords_str = key_words
      .as_ref()
      .map(|k| {
        k.iter()
          .filter(|w| !w.trim().is_empty())
          .map(|w| format!("\"{}\"*", w))
          .collect::<Vec<_>>()
          .join(" OR ")
      })
      .unwrap_or_default();

    self.build_filtered_chunks_cte(
      &mut qb,
      app_names,
      window_names,
      browser_urls,
      start_time,
      end_time
    );

    match search_type {
      SearchType::Vector => {
        println!("Embeddinjson len {:?}", embedding_json.len());
        qb.push(",");
        self.build_vector_cte(&mut qb, &embedding_json);

        self.build_vector_select(&mut qb, include_text_layout);
      }

      SearchType::FTS => {
        qb.push(",");
        self.build_fts_cte(&mut qb, &keywords_str);

        self.build_fts_select(&mut qb);
      }

      SearchType::Hybrid => {
        qb.push(",");
        self.build_vector_cte(&mut qb, &embedding_json);

        qb.push(",");
        self.build_fts_cte(&mut qb, &keywords_str);

        qb.push(",");
        self.build_hybrid_merge(&mut qb);

        self.build_final_select(&mut qb);
      }
    }

    let results = qb.build_query_as::<SearchResult>().fetch_all(&self.pool).await?;

    Ok(results)
  }

  fn build_final_select(&self, qb: &mut QueryBuilder<Sqlite>) {
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
            c.text_json,
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

      //  Insert Embedding — serialize Vec<f32> to raw bytes for sqlite-vec
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

    tx.commit().await?;

    Ok(())
  }

  pub async fn perform_search(&self, search: SearchQuery) -> Result<Vec<SearchResult>> {
    let embedding_json = serde_json
      ::to_string(&search.embedding)
      .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))?;

    // Pro-tip: Let's also merge `entities` into the FTS keywords so you don't lose that valuable data!
    let mut all_keywords = search.key_words.clone().unwrap_or_default();
    if let Some(entities) = &search.entities {
      all_keywords.extend(entities.clone());
    }

    let keywords_str = if all_keywords.is_empty() {
      String::new()
    } else {
      all_keywords
        .iter()
        .filter(|w| !w.trim().is_empty())
        .map(|w| format!("\"{}\"*", w))
        .collect::<Vec<_>>()
        .join(" OR ")
    };

    info!("Keyword str : {:#?}", keywords_str);

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
      r#"
WITH


-- 0️ Metadata Filtering FIRST
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

    // 1️⃣ Metadata filter: App Name (Now an array of aliases)
    if let Some(app_names) = &search.app_name {
      if !app_names.is_empty() {
        qb.push(" AND (");
        let mut first = true;

        for app in app_names {
          if !first {
            qb.push(" OR ");
          }
          first = false;

          let term = format!("%{}%", app.to_lowercase());

          // Check if this specific alias matches the app, window, or URL
          qb.push("(");
          qb.push("LOWER(f.app_name) LIKE ");
          qb.push_bind(term.clone());

          qb.push(" OR LOWER(f.window_title) LIKE ");
          qb.push_bind(term.clone());

          qb.push(" OR LOWER(f.browser_url) LIKE ");
          qb.push_bind(term);
          qb.push(")");
        }
        qb.push(") ");
      }
    }

    // 2️⃣ Metadata filter: Window Title (Also an array)
    if let Some(win_names) = &search.window_name {
      if !win_names.is_empty() {
        qb.push(" AND (");
        let mut first = true;

        for win in win_names {
          if !first {
            qb.push(" OR ");
          }
          first = false;

          let term = format!("%{}%", win.to_lowercase());
          qb.push("LOWER(f.window_title) LIKE ");
          qb.push_bind(term);
        }
        qb.push(") ");
      }
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
    LIMIT 50
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

    info!("Database results right into the db: {:#?}", results);

    Ok(results)
  }
  async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    debug!("Running database migrations");

    sqlx::migrate!("../../migrations").run(pool).await?;

    Ok(())
  }
}
