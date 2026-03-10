use app_core::db::{ SearchResult, SearchType };
use axum::{ extract::{ Json, State } };
use chrono::{ DateTime, Utc };
use crate::server::app_state::AppState;
use std::sync::Arc;
use serde::{ Deserialize, Serialize };
use std::time::Instant;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SortableField {
    Timestamp,
    AppName,
    WindowTitle,
    BrowserUrl,
    IsFocused,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TimeRange {
    pub start: Option<DateTime<Utc>>,
    pub end: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DatabaseFilter {
    #[serde(default)]
    pub app_name: Option<Vec<String>>,
    #[serde(default)]
    pub window_title_contains: Option<Vec<String>>,
    #[serde(default)]
    pub browser_url_contains: Option<Vec<String>>,
    #[serde(default)]
    pub is_focused: Option<bool>,
    #[serde(default, alias = "textSearch")]
    pub text_search: Option<String>,
    #[serde(default)]
    pub time_range: Option<TimeRange>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SortConfig {
    pub field: Option<SortableField>,
    pub order: Option<SortOrder>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQuery {
    pub semantic_query: String,
    #[serde(default)]
    pub keywords: Vec<String>,
    pub filter: Option<DatabaseFilter>,
    pub sort: Option<SortConfig>,
    pub limit: Option<i32>,
    #[serde(default)]
    pub include_text_layout: bool,
}

use axum::response::{ IntoResponse, Response };

#[derive(Debug, Serialize)]
pub struct ToolErrorBody {
    pub code: String,
    pub message: String,
    pub stage: String,
    pub details: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ToolMetadata {
    pub search_type: String,
    pub row_count: usize,
    pub elapsed_ms: u128,
    pub query_limit: i32,
    pub keyword_count: usize,
    pub sort_field: String,
    pub sort_order: String,
}

#[derive(Debug, Serialize)]
pub struct ToolResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<ToolErrorBody>,
    pub metadata: ToolMetadata,
}

fn normalize_keywords(top_level_keywords: Vec<String>, filter: Option<&DatabaseFilter>) -> Vec<String> {
    let mut combined = top_level_keywords;

    if let Some(f) = filter {
        if let Some(text_search) = &f.text_search {
            let split_words = text_search
                .split_whitespace()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            combined.extend(split_words);
        }
    }

    combined
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .fold(Vec::<String>::new(), |mut acc, current| {
            if !acc.iter().any(|existing| existing.eq_ignore_ascii_case(&current)) {
                acc.push(current);
            }
            acc
        })
}

fn build_metadata(
    row_count: usize,
    elapsed_ms: u128,
    query_limit: i32,
    keyword_count: usize,
    sort_field: &str,
    sort_order: &str
) -> ToolMetadata {
    ToolMetadata {
        search_type: "vector".to_string(),
        row_count,
        elapsed_ms,
        query_limit,
        keyword_count,
        sort_field: sort_field.to_string(),
        sort_order: sort_order.to_string(),
    }
}

fn ok_response(
    rows: Vec<SearchResult>,
    elapsed_ms: u128,
    query_limit: i32,
    keyword_count: usize,
    sort_field: &str,
    sort_order: &str
) -> Response {
    let metadata = build_metadata(
        rows.len(),
        elapsed_ms,
        query_limit,
        keyword_count,
        sort_field,
        sort_order
    );

    let response = ToolResponse {
        success: true,
        data: Some(rows),
        error: None,
        metadata,
    };

    (axum::http::StatusCode::OK, axum::Json(response)).into_response()
}

fn error_response(
    code: &str,
    message: &str,
    stage: &str,
    details: Option<String>,
    elapsed_ms: u128,
    query_limit: i32,
    keyword_count: usize,
    sort_field: &str,
    sort_order: &str
) -> Response {
    let metadata = build_metadata(0, elapsed_ms, query_limit, keyword_count, sort_field, sort_order);

    let response = ToolResponse::<Vec<SearchResult>> {
        success: false,
        data: None,
        error: Some(ToolErrorBody {
            code: code.to_string(),
            message: message.to_string(),
            stage: stage.to_string(),
            details,
        }),
        metadata,
    };

    (axum::http::StatusCode::INTERNAL_SERVER_ERROR, axum::Json(response)).into_response()
}

pub async fn search_tool(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<DatabaseQuery>
) -> Response {
    let start = Instant::now();
    // call search logic here
    let model = state.embeddingModel.clone();
    tracing::info!("Database Query Information : {:#?}", payload);

    let DatabaseQuery {
        filter,
        semantic_query,
        limit,
        sort,
        keywords,
        include_text_layout,
    } = payload;

    let normalized_keywords = normalize_keywords(keywords, filter.as_ref());

    let (app_names, window_titles, browser_urls, start_time, end_time) = match
        filter
    {
        Some(f) =>
            (
                f.app_name.unwrap_or_default(),
                f.window_title_contains.unwrap_or_default(),
                f.browser_url_contains.unwrap_or_default(),
                f.time_range.as_ref().and_then(|t| t.start),
                f.time_range.as_ref().and_then(|t| t.end),
            ),
        None => (vec![], vec![], vec![], None, None),
    };

    // Convert Vec<String> to Vec<&str>
    let app_names_refs: Vec<&str> = app_names.iter().map(|s| s.as_str()).collect();
    let window_titles_refs: Vec<&str> = window_titles.iter().map(|s| s.as_str()).collect();
    let browser_urls_refs: Vec<&str> = browser_urls.iter().map(|s| s.as_str()).collect();

    let embeddings: Vec<f32> = match tokio::task
        ::spawn_blocking(
            move || -> Result<Vec<f32>, String> {
                let mut model = model
                    .lock()
                    .map_err(|e| format!("Embedding model lock failed: {e}"))?;

                model
                    .generate_embedding(&semantic_query)
                    .map_err(|e| format!("Embedding generation failed: {e}"))
            }
        ).await
    {
        Ok(Ok(value)) => value,
        Ok(Err(message)) => {
            tracing::error!("{message}");
            return error_response(
                "EMBEDDING_GENERATION_FAILED",
                "Embedding generation failed",
                "embedding",
                Some(message),
                start.elapsed().as_millis(),
                limit.unwrap_or(40).max(1).min(100),
                normalized_keywords.len(),
                "timestamp",
                "desc"
            );
        }
        Err(join_error) => {
            tracing::error!("Embedding task join failed: {join_error}");
            return error_response(
                "EMBEDDING_TASK_FAILED",
                "Embedding task failed",
                "embedding",
                Some(join_error.to_string()),
                start.elapsed().as_millis(),
                limit.unwrap_or(40).max(1).min(100),
                normalized_keywords.len(),
                "timestamp",
                "desc"
            );
        }
    };

    let embedding_json = match serde_json::to_string(&embeddings) {
        Ok(value) => value,
        Err(e) => {
            tracing::error!("Embedding serialization failed: {e}");
            return error_response(
                "EMBEDDING_SERIALIZATION_FAILED",
                "Embedding serialization failed",
                "embedding",
                Some(e.to_string()),
                start.elapsed().as_millis(),
                limit.unwrap_or(40).max(1).min(100),
                normalized_keywords.len(),
                "timestamp",
                "desc"
            );
        }
    };

    let db = state.db.clone();
    
    // Extract sort configuration
    let sort_field = sort.as_ref().and_then(|s| s.field.as_ref());
    let sort_order = sort.as_ref().and_then(|s| s.order.as_ref());
    let sort_field_str =
        sort_field.map(|f| {
            match f {
                SortableField::Timestamp => "captured_at",
                SortableField::AppName => "app_name",
                SortableField::WindowTitle => "window_title",
                SortableField::BrowserUrl => "browser_url",
                SortableField::IsFocused => "is_focused",
            }
        }).unwrap_or("captured_at");
    let sort_order_str =
        sort_order.map(|o| {
            match o {
                SortOrder::Asc => "asc",
                SortOrder::Desc => "desc",
            }
        }).unwrap_or("desc");
    
    // Default limit to 40 if not provided, cap at 100
    let query_limit = limit.unwrap_or(40).max(1).min(100) as i32;

    let keyword_refs: Vec<&str> = normalized_keywords.iter().map(|s| s.as_str()).collect();

    let db_results = db.search_tool(
        if app_names_refs.is_empty() { None } else { Some(app_names_refs) },
        if window_titles_refs.is_empty() { None } else { Some(window_titles_refs) },
        if browser_urls_refs.is_empty() { None } else { Some(browser_urls_refs) },
        start_time,
        end_time,
        if keyword_refs.is_empty() { None } else { Some(keyword_refs) },
        &SearchType::Vector,
        Some(query_limit),
        include_text_layout,
        &embedding_json,
        Some(sort_field_str),
        Some(sort_order_str)
    ).await;

    let db_results = match db_results {
        Ok(res) => res,
        Err(e) => {
            tracing::error!("Error From Database : {:#?}", e);
            return error_response(
                "DATABASE_OPERATION_FAILED",
                "Database operation failed",
                "database",
                Some(e.to_string()),
                start.elapsed().as_millis(),
                query_limit,
                normalized_keywords.len(),
                sort_field_str,
                sort_order_str
            );
        }
    };
    tracing::info!("Database Results : {:#?}", db_results);

    ok_response(
        db_results,
        start.elapsed().as_millis(),
        query_limit,
        normalized_keywords.len(),
        sort_field_str,
        sort_order_str
    )
}
