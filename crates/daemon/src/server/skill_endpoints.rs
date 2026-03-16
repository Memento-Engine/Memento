use axum::{ extract::{ Json, State }, response::{ IntoResponse, Response } };
use chrono::{DateTime, Utc};
use reqwest::StatusCode;
use serde::{ Deserialize, Serialize };
use sqlx::Column;
use std::sync::Arc;
use std::time::Instant;
use tracing::{ info, error, warn };

use crate::server::app_state::AppState;

/// Request payload for SQL execution
#[derive(Debug, Deserialize)]
pub struct SqlExecuteRequest {
    pub sql: String,
}

/// Response for SQL execution
#[derive(Debug, Serialize)]
pub struct SqlExecuteResponse {
    pub success: bool,
    pub rows: Option<Vec<serde_json::Value>>,
    pub columns: Option<Vec<String>>,
    pub row_count: usize,
    pub error: Option<String>,
    pub execution_time_ms: u128,
}

/// Forbidden keywords that indicate write operations
const FORBIDDEN_KEYWORDS: &[&str] = &[
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "REPLACE",
    "ATTACH",
    "DETACH",
    "PRAGMA",
    "VACUUM",
    "REINDEX",
];

/// Maximum rows to return
const MAX_ROWS: i32 = 100;

/// Default limit if not specified
const DEFAULT_LIMIT: i32 = 50;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkRequest {
    pub chunk_ids: Vec<i32>,
    pub include_text_json: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkResult {
    pub chunk_id: i32,
    pub app_name: String,
    pub window_name: String,
    pub captured_at: DateTime<Utc>,
    pub browser_url: Option<String>,
    pub image_path: Option<String>,
    pub text_content: Option<String>,
    pub text_json: Option<String>,
}

pub async fn search_results_by_chunk_ids(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChunkRequest>
) -> Response {
    let start_time = Instant::now();
    info!("Received request for search results with chunk_ids: {:?}", payload.chunk_ids);

    match state.db.get_results_by_chunk_ids(payload.chunk_ids, payload.include_text_json).await {
        Ok(results) => {
            let duration = start_time.elapsed();

            let chunk_result = results
                .into_iter()
                .map(|r| ChunkResult {
                    chunk_id: r.chunk_id,
                    app_name: r.app_name,
                    window_name: r.window_title,
                    captured_at: r.captured_at,
                    browser_url: Some(r.browser_url),
                    image_path: Some(r.image_path),
                    text_content: Some(r.text_content),
                    text_json: Some(r.text_json),
                })
                .collect::<Vec<ChunkResult>>();

            info!("Successfully retrieved search results in {:?} ms", duration.as_millis());
            (StatusCode::OK, Json(chunk_result)).into_response()
        }
        Err(e) => {
            error!("Error retrieving search results: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "search_results_by_chunk_ids");
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("search_results_by_chunk_ids failed", sentry::Level::Error);
            });
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve search results").into_response()
        }
    }
}

/// Validate that the SQL is read-only
fn validate_sql(sql: &str) -> Result<String, String> {
    let trimmed = sql.trim();
    let upper = trimmed.to_uppercase();

    // Must start with SELECT or WITH (for CTEs)
    if !upper.starts_with("SELECT") && !upper.starts_with("WITH") {
        return Err("Query must start with SELECT or WITH (CTEs)".to_string());
    }

    // Check for forbidden keywords
    for keyword in FORBIDDEN_KEYWORDS {
        let pattern = format!(r"\b{}\b", keyword);
        if let Ok(re) = regex::Regex::new(&pattern) {
            if re.is_match(&upper) {
                return Err(format!("Query contains forbidden operation: {}", keyword));
            }
        }
    }

    // Check for multiple statements
    let semicolon_pos = trimmed.find(';');
    if let Some(pos) = semicolon_pos {
        if pos < trimmed.len() - 1 {
            let after_semicolon = trimmed[pos + 1..].trim();
            if !after_semicolon.is_empty() {
                return Err("Multiple SQL statements are not allowed".to_string());
            }
        }
    }

    // Check for SQL comments (potential injection)
    if trimmed.contains("--") || trimmed.contains("/*") {
        return Err("SQL comments are not allowed".to_string());
    }

    // Enforce LIMIT clause
    let normalized = if !upper.contains("LIMIT") {
        format!("{} LIMIT {}", trimmed.trim_end_matches(';').trim(), DEFAULT_LIMIT)
    } else {
        // Check if existing LIMIT is too high
        let re = regex::Regex::new(r"LIMIT\s+(\d+)").unwrap();
        if let Some(caps) = re.captures(&upper) {
            if let Ok(limit) = caps.get(1).unwrap().as_str().parse::<i32>() {
                if limit > MAX_ROWS {
                    let new_sql = re.replace(&trimmed, format!("LIMIT {}", MAX_ROWS).as_str());
                    return Ok(new_sql.trim_end_matches(';').to_string());
                }
            }
        }
        trimmed.trim_end_matches(';').to_string()
    };

    Ok(normalized)
}

/// Execute a read-only SQL query
pub async fn sql_execute(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SqlExecuteRequest>
) -> Response {
    let start = Instant::now();

    info!("SQL Execute request: {}", &payload.sql[..payload.sql.len().min(100)]);

    // Validate SQL
    let safe_sql = match validate_sql(&payload.sql) {
        Ok(sql) => sql,
        Err(e) => {
            warn!("SQL validation failed: {}", e);
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(SqlExecuteResponse {
                    success: false,
                    rows: None,
                    columns: None,
                    row_count: 0,
                    error: Some(e),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    info!("Executing validated SQL: {}", &safe_sql[..safe_sql.len().min(200)]);

    // Execute the query
    let db = &state.db;

    match sqlx::query(&safe_sql).fetch_all(&db.pool).await {
        Ok(rows) => {
            // Convert rows to JSON
            let mut json_rows: Vec<serde_json::Value> = Vec::new();
            let mut columns: Vec<String> = Vec::new();

            for row in &rows {
                use sqlx::Row;

                // Get column names from first row
                if columns.is_empty() {
                    columns = row
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                }

                // Convert row to JSON object
                let mut obj = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let value: serde_json::Value = if let Ok(v) = row.try_get::<String, _>(i) {
                        serde_json::Value::String(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        serde_json::Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<i32, _>(i) {
                        serde_json::Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        serde_json::Number
                            ::from_f64(v)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        serde_json::Value::Bool(v)
                    } else {
                        // Try as nullable string
                        row.try_get::<Option<String>, _>(i)
                            .ok()
                            .flatten()
                            .map(serde_json::Value::String)
                            .unwrap_or(serde_json::Value::Null)
                    };
                    obj.insert(col.name().to_string(), value);
                }
                json_rows.push(serde_json::Value::Object(obj));
            }

            let row_count = json_rows.len();
            info!("SQL executed successfully, {} rows returned", row_count);

            (
                axum::http::StatusCode::OK,
                Json(SqlExecuteResponse {
                    success: true,
                    rows: Some(json_rows),
                    columns: Some(columns),
                    row_count,
                    error: None,
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response()
        }
        Err(e) => {
            error!("SQL execution failed: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "sql_execute");
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("sql_execute failed", sentry::Level::Error);
            });
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(SqlExecuteResponse {
                    success: false,
                    rows: None,
                    columns: None,
                    row_count: 0,
                    error: Some(format!("SQL execution error: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response()
        }
    }
}

/// Request for semantic search
#[derive(Debug, Deserialize)]
pub struct SemanticSearchRequest {
    pub query: String,
    pub limit: Option<i32>,
    pub filters: Option<SemanticFilters>,
}

#[derive(Debug, Deserialize)]
pub struct SemanticFilters {
    pub app_names: Option<Vec<String>>,
    pub time_range: Option<TimeRangeFilter>,
}

#[derive(Debug, Deserialize)]
pub struct TimeRangeFilter {
    pub start: Option<String>,
    pub end: Option<String>,
}

/// Response for semantic search
#[derive(Debug, Serialize)]
pub struct SemanticSearchResponse {
    pub success: bool,
    pub results: Option<Vec<SemanticSearchResult>>,
    pub result_count: usize,
    pub error: Option<String>,
    pub execution_time_ms: u128,
}

#[derive(Debug, Serialize)]
pub struct SemanticSearchResult {
    pub chunk_id: i32,
    pub frame_id: i32,
    pub captured_at: String,
    pub app_name: String,
    pub window_title: String,
    pub browser_url: String,
    pub text_content: String,
    pub similarity_score: f32,
}

/// Semantic search endpoint - embeds query and performs vector search
use sqlx::{ QueryBuilder, Row };

pub async fn semantic_search(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SemanticSearchRequest>
) -> Response {
    let start = Instant::now();
    let limit = payload.limit.unwrap_or(20).clamp(1, 100);

    info!("Semantic search request: query={}", payload.query);

    // Generate embedding
    let embedding = match state.embedding_model.generate_embedding(&payload.query).await {
        Ok(e) => e,
        Err(e) => {
            error!("Embedding generation failed: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "semantic_search");
                scope.set_extra("stage", "embedding".into());
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("semantic_search embedding failed", sentry::Level::Error);
            });

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SemanticSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Embedding generation failed: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    // Serialize embedding
    let embedding_json = match serde_json::to_string(&embedding) {
        Ok(v) => v,
        Err(e) => {
            error!("Embedding serialization failed: {:?}", e);

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SemanticSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Embedding serialization failed: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    // Build query
    let mut qb = QueryBuilder::new(
        r#"
        SELECT
            c.id as chunk_id,
            f.id as frame_id,
            f.captured_at,
            f.app_name,
            f.window_title,
            COALESCE(f.browser_url, '') as browser_url,
            c.text_content,
            vec_distance_cosine(v.embedding,
        "#
    );

    qb.push_bind(&embedding_json);

    qb.push(
        r#"
        ) as distance
        FROM vec_chunks v
        JOIN chunks c ON v.chunk_id = c.id
        JOIN frames f ON c.frame_id = f.id
        WHERE 1=1
        "#
    );

    // Apply filters
    if let Some(filters) = &payload.filters {
        // App filter
        if let Some(apps) = &filters.app_names {
            if !apps.is_empty() {
                qb.push(" AND (");

                for (i, app) in apps.iter().enumerate() {
                    if i > 0 {
                        qb.push(" OR ");
                    }

                    qb.push("LOWER(f.app_name) LIKE ");
                    qb.push_bind(format!("%{}%", app.to_lowercase()));
                }

                qb.push(")");
            }
        }

        // Time filter
        if let Some(time_range) = &filters.time_range {
            if let Some(start_time) = &time_range.start {
                qb.push(" AND f.captured_at >= ");
                qb.push_bind(start_time);
            }

            if let Some(end_time) = &time_range.end {
                qb.push(" AND f.captured_at <= ");
                qb.push_bind(end_time);
            }
        }
    }

    qb.push(" ORDER BY distance ASC LIMIT ");
    qb.push_bind(limit);

    let query = qb.build();

    // Execute query
    let rows = match query.fetch_all(&state.db.pool).await {
        Ok(r) => r,
        Err(e) => {
            error!("Semantic search failed: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "semantic_search");
                scope.set_extra("stage", "database".into());
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("semantic_search database failed", sentry::Level::Error);
            });

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SemanticSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Database error: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    // Map results
    let results: Vec<SemanticSearchResult> = rows
        .iter()
        .map(|row| SemanticSearchResult {
            chunk_id: row.try_get("chunk_id").unwrap_or(0),
            frame_id: row.try_get("frame_id").unwrap_or(0),
            captured_at: row.try_get::<String, _>("captured_at").unwrap_or_default(),
            app_name: row.try_get("app_name").unwrap_or_default(),
            window_title: row.try_get("window_title").unwrap_or_default(),
            browser_url: row.try_get("browser_url").unwrap_or_default(),
            text_content: row.try_get("text_content").unwrap_or_default(),
            similarity_score: 1.0 - row.try_get::<f32, _>("distance").unwrap_or(1.0),
        })
        .collect();

    let result_count = results.len();

    info!("Semantic search completed: {} results", result_count);

    (
        StatusCode::OK,
        Json(SemanticSearchResponse {
            success: true,
            results: Some(results),
            result_count,
            error: None,
            execution_time_ms: start.elapsed().as_millis(),
        }),
    ).into_response()
}

/// Request for hybrid search
#[derive(Debug, Deserialize)]
pub struct HybridSearchRequest {
    pub query: String,
    pub keywords: Option<Vec<String>>,
    pub limit: Option<i32>,
    pub filters: Option<SemanticFilters>,
}

/// Response for hybrid search
#[derive(Debug, Serialize)]
pub struct HybridSearchResponse {
    pub success: bool,
    pub results: Option<Vec<HybridSearchResult>>,
    pub result_count: usize,
    pub error: Option<String>,
    pub execution_time_ms: u128,
}

#[derive(Debug, Serialize)]
pub struct HybridSearchResult {
    pub chunk_id: i32,
    pub frame_id: i32,
    pub captured_at: String,
    pub app_name: String,
    pub window_title: String,
    pub browser_url: String,
    pub text_content: String,
    pub combined_score: f32,
    pub search_type: String, // "vector", "fts", or "both"
}

/// Hybrid search endpoint - combines FTS and vector search
pub async fn hybrid_search(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<HybridSearchRequest>
) -> Response {
    let start = Instant::now();
    let limit = payload.limit.unwrap_or(20).clamp(1, 100);
    let fetch_limit = limit * 3;

    let keywords = payload.keywords.clone().unwrap_or_default();

    info!("Hybrid search request: query={}, keywords={:?}", payload.query, keywords);

    // Generate embedding
    let embedding = match state.embedding_model.generate_embedding(&payload.query).await {
        Ok(e) => e,
        Err(e) => {
            error!("Embedding generation failed: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "hybrid_search");
                scope.set_extra("stage", "embedding".into());
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("hybrid_search embedding failed", sentry::Level::Error);
            });
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(HybridSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Embedding generation failed: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    let embedding_json = match serde_json::to_string(&embedding) {
        Ok(v) => v,
        Err(e) => {
            error!("Embedding serialization failed: {:?}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(HybridSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Embedding serialization failed: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    // Build FTS query safely
    let mut words: Vec<String> = if !keywords.is_empty() {
        keywords
            .iter()
            .map(|k| format!("\"{}\"", k.replace('"', "")))
            .collect()
    } else {
        payload.query
            .split_whitespace()
            .filter(|w| w.len() > 2)
            .map(|w| format!("\"{}\"", w.replace('"', "")))
            .collect()
    };

    if words.is_empty() {
        words.push("\"search\"".to_string());
    }

    let fts_match = words.join(" OR ");

    let mut qb = QueryBuilder::new(
        r#"
        WITH vector_results AS (
            SELECT
                c.id as chunk_id,
                f.id as frame_id,
                f.captured_at,
                f.app_name,
                f.window_title,
                COALESCE(f.browser_url,'') as browser_url,
                c.text_content,
                1.0 - vec_distance_cosine(v.embedding,
        "#
    );

    qb.push_bind(&embedding_json);

    qb.push(
        r#") as vector_score
        FROM vec_chunks v
        JOIN chunks c ON v.chunk_id = c.id
        JOIN frames f ON c.frame_id = f.id
        WHERE 1=1
        "#
    );

    // Filters
    if let Some(filters) = &payload.filters {
        if let Some(apps) = &filters.app_names {
            if !apps.is_empty() {
                qb.push(" AND (");

                for (i, app) in apps.iter().enumerate() {
                    if i > 0 {
                        qb.push(" OR ");
                    }

                    qb.push("LOWER(f.app_name) LIKE ");
                    qb.push_bind(format!("%{}%", app.to_lowercase()));
                }

                qb.push(")");
            }
        }

        if let Some(time_range) = &filters.time_range {
            if let Some(start) = &time_range.start {
                qb.push(" AND f.captured_at >= ");
                qb.push_bind(start);
            }

            if let Some(end) = &time_range.end {
                qb.push(" AND f.captured_at <= ");
                qb.push_bind(end);
            }
        }
    }

    qb.push(" ORDER BY vector_score DESC LIMIT ");
    qb.push_bind(fetch_limit);

    qb.push(
        r#"
        ),
        fts_results AS (
            SELECT
                c.id as chunk_id,
                f.id as frame_id,
                f.captured_at,
                f.app_name,
                f.window_title,
                COALESCE(f.browser_url,'') as browser_url,
                c.text_content,
                bm25(chunks_fts) * -1 as fts_score
            FROM chunks_fts
            JOIN chunks c ON chunks_fts.rowid = c.id
            JOIN frames f ON c.frame_id = f.id
            WHERE chunks_fts MATCH
        "#
    );

    qb.push_bind(&fts_match);

    qb.push(" LIMIT ");
    qb.push_bind(fetch_limit);

    qb.push(
        r#"
        ),
        combined AS (
            SELECT
                chunk_id,
                frame_id,
                captured_at,
                app_name,
                window_title,
                browser_url,
                text_content,
                MAX(vector_score) as vector_score,
                MAX(fts_score) as fts_score,
                (COALESCE(MAX(vector_score),0) * 0.6 +
                 COALESCE(MAX(fts_score),0) * 0.4) as combined_score
            FROM (
                SELECT
                    chunk_id,
                    frame_id,
                    captured_at,
                    app_name,
                    window_title,
                    browser_url,
                    text_content,
                    vector_score,
                    0 as fts_score
                FROM vector_results

                UNION ALL

                SELECT
                    chunk_id,
                    frame_id,
                    captured_at,
                    app_name,
                    window_title,
                    browser_url,
                    text_content,
                    0 as vector_score,
                    fts_score
                FROM fts_results
            )
            GROUP BY chunk_id
        )

        SELECT
            chunk_id,
            frame_id,
            captured_at,
            app_name,
            window_title,
            browser_url,
            text_content,
            combined_score,
            CASE
                WHEN vector_score > 0 AND fts_score > 0 THEN 'both'
                WHEN vector_score > 0 THEN 'vector'
                ELSE 'fts'
            END as search_type
        FROM combined
        ORDER BY combined_score DESC
        LIMIT
        "#
    );

    qb.push_bind(limit);

    let query = qb.build();

    let rows = match query.fetch_all(&state.db.pool).await {
        Ok(r) => r,
        Err(e) => {
            error!("Hybrid search failed: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "hybrid_search");
                scope.set_extra("stage", "database".into());
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("hybrid_search database failed", sentry::Level::Error);
            });

            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(HybridSearchResponse {
                    success: false,
                    results: None,
                    result_count: 0,
                    error: Some(format!("Database error: {}", e)),
                    execution_time_ms: start.elapsed().as_millis(),
                }),
            ).into_response();
        }
    };

    let results: Vec<HybridSearchResult> = rows
        .iter()
        .map(|row| HybridSearchResult {
            chunk_id: row.try_get("chunk_id").unwrap_or(0),
            frame_id: row.try_get("frame_id").unwrap_or(0),
            captured_at: row.try_get::<String, _>("captured_at").unwrap_or_default(),
            app_name: row.try_get("app_name").unwrap_or_default(),
            window_title: row.try_get("window_title").unwrap_or_default(),
            browser_url: row.try_get("browser_url").unwrap_or_default(),
            text_content: row.try_get("text_content").unwrap_or_default(),
            combined_score: row.try_get("combined_score").unwrap_or(0.0),
            search_type: row.try_get("search_type").unwrap_or_default(),
        })
        .collect();

    let result_count = results.len();

    info!("Hybrid search completed: {} results", result_count);

    (
        axum::http::StatusCode::OK,
        Json(HybridSearchResponse {
            success: true,
            results: Some(results),
            result_count,
            error: None,
            execution_time_ms: start.elapsed().as_millis(),
        }),
    ).into_response()
}
