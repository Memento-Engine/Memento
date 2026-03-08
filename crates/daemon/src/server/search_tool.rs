use app_core::db::SearchType;
use axum::{ extract::{ Json, State } };
use chrono::{ DateTime, Utc };
use crate::server::app_state::AppState;
use std::sync::Arc;
use serde::{ Deserialize, Serialize };

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
    pub app_name: Option<Vec<String>>,
    pub window_title_contains: Option<Vec<String>>,
    pub browser_url_contains: Option<Vec<String>>,
    pub is_focused: Option<bool>,
    pub key_words: Option<Vec<String>>,
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
    pub keywords: Vec<String>,
    pub filter: Option<DatabaseFilter>,
    pub sort: Option<SortConfig>,
    pub limit: Option<i32>,
}

use axum::{ response::IntoResponse };

pub async fn search_tool(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<DatabaseQuery>
) -> impl IntoResponse {
    // call search logic here
    let model = state.embeddingModel.clone();
    tracing::info!("Database Query Information : {:#?}", payload);

    let DatabaseQuery { filter, semantic_query, limit, sort, .. } = payload;

    let (app_names, window_titles, browser_urls, is_focused, start_time, end_time, key_words) = match
        filter
    {
        Some(f) =>
            (
                f.app_name.unwrap_or_default(),
                f.window_title_contains.unwrap_or_default(),
                f.browser_url_contains.unwrap_or_default(),
                f.is_focused,
                f.time_range.as_ref().and_then(|t| t.start),
                f.time_range.as_ref().and_then(|t| t.end),
                f.key_words,
            ),
        None => (vec![], vec![], vec![], None, None, None, None),
    };

    // Convert Vec<String> to Vec<&str>
    let app_names_refs: Vec<&str> = app_names.iter().map(|s| s.as_str()).collect();
    let window_titles_refs: Vec<&str> = window_titles.iter().map(|s| s.as_str()).collect();
    let browser_urls_refs: Vec<&str> = browser_urls.iter().map(|s| s.as_str()).collect();

    let embeddings: Vec<f32> = tokio::task
        ::spawn_blocking(
            move || -> Vec<f32> {
                let mut model = model.lock().unwrap();
                model.generate_embedding(&semantic_query).unwrap()
            }
        ).await
        .unwrap();

    let embedding_json = serde_json
        ::to_string(&embeddings)
        .map_err(|e| sqlx::Error::Protocol(e.to_string().into()))
        .unwrap_or_default();

    let db = state.db.clone();
    
    // Extract sort configuration
    let sort_field = sort.as_ref().and_then(|s| s.field.as_ref());
    let sort_order = sort.as_ref().and_then(|s| s.order.as_ref());
    
    // Default limit to 40 if not provided, cap at 100
    let query_limit = limit.unwrap_or(40).min(100) as i32;

    let db_results = db.search_tool(
        if app_names_refs.is_empty() { None } else { Some(app_names_refs) },
        if window_titles_refs.is_empty() { None } else { Some(window_titles_refs) },
        if browser_urls_refs.is_empty() { None } else { Some(browser_urls_refs) },
        start_time,
        end_time,
        key_words.as_ref().map(|vec| {
            vec.iter()
                .map(|s| s.as_str())
                .collect::<Vec<&str>>()
        }),
        &SearchType::Vector,
        Some(query_limit),
        &embedding_json,
        sort_field.map(|f| {
            match f {
                SortableField::Timestamp => "timestamp",
                SortableField::AppName => "app_name",
                SortableField::WindowTitle => "window_title",
                SortableField::BrowserUrl => "browser_url",
                SortableField::IsFocused => "is_focused",
            }
        }),
        sort_order.map(|o| {
            match o {
                SortOrder::Asc => "asc",
                SortOrder::Desc => "desc",
            }
        })
    ).await;

    let db_results = match db_results {
        Ok(res) => res,
        Err(e) => {
            tracing::error!("Error From Database : {:#?}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Database Operation Failed",
            ).into_response();
        }
    };
    tracing::info!("Database Results : {:#?}", db_results);

    (axum::http::StatusCode::OK, axum::Json(db_results)).into_response()
}
