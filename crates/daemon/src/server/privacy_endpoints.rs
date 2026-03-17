use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, error, info};

use crate::server::app_state::AppState;
use crate::server::privacy::{
    CreateMaskedItemRequest, MaskedItem, MaskedItemType, PrivacyResult, UpdateMaskedItemRequest,
};
use crate::server::storage_endpoints::ApiResponse;

/// Query parameters for listing masked items
#[derive(Debug, Deserialize)]
pub struct ListMaskedItemsQuery {
    #[serde(rename = "type")]
    pub item_type: Option<String>,
}

/// Query parameters for searching masked items
#[derive(Debug, Deserialize)]
pub struct SearchMaskedItemsQuery {
    pub q: String,
}

/// Response with list of masked items
#[derive(Debug, Serialize)]
pub struct MaskedItemsListResponse {
    pub items: Vec<MaskedItem>,
    pub total: usize,
}

/// GET /privacy/masked - List all masked items (optionally filtered by type)
pub async fn list_masked_items(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListMaskedItemsQuery>,
) -> Json<ApiResponse<MaskedItemsListResponse>> {
    debug!("Listing masked items, type filter: {:?}", query.item_type);

    let result = if let Some(type_str) = query.item_type {
        match type_str.parse::<MaskedItemType>() {
            Ok(item_type) => state.privacy_manager.list_by_type(item_type).await,
            Err(_) => {
                return Json(ApiResponse::err(format!("Invalid type: {}", type_str)));
            }
        }
    } else {
        state.privacy_manager.list_all().await
    };

    match result {
        Ok(items) => {
            let total = items.len();
            Json(ApiResponse::ok(MaskedItemsListResponse { items, total }))
        }
        Err(e) => {
            error!("Failed to list masked items: {}", e);
            Json(ApiResponse::err(format!("Failed to list items: {}", e)))
        }
    }
}

/// GET /privacy/masked/search - Search masked items by name
pub async fn search_masked_items(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchMaskedItemsQuery>,
) -> Json<ApiResponse<MaskedItemsListResponse>> {
    debug!("Searching masked items: {}", query.q);

    match state.privacy_manager.search(&query.q).await {
        Ok(items) => {
            let total = items.len();
            Json(ApiResponse::ok(MaskedItemsListResponse { items, total }))
        }
        Err(e) => {
            error!("Failed to search masked items: {}", e);
            Json(ApiResponse::err(format!("Failed to search items: {}", e)))
        }
    }
}

/// POST /privacy/masked - Create a new masked item
pub async fn create_masked_item(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateMaskedItemRequest>,
) -> Json<ApiResponse<MaskedItem>> {
    info!("Creating masked item: {} ({})", request.name, request.item_type);

    match state.privacy_manager.create(request).await {
        Ok(item) => Json(ApiResponse::ok(item)),
        Err(e) => {
            // Check for unique constraint violation
            let error_msg = e.to_string();
            if error_msg.contains("UNIQUE constraint") {
                Json(ApiResponse::err("This item is already masked".to_string()))
            } else {
                error!("Failed to create masked item: {}", e);
                Json(ApiResponse::err(format!("Failed to create item: {}", e)))
            }
        }
    }
}

/// PUT /privacy/masked/:id - Update a masked item
pub async fn update_masked_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateMaskedItemRequest>,
) -> Json<ApiResponse<MaskedItem>> {
    info!("Updating masked item {}: {}", id, request.name);

    match state.privacy_manager.update(id, request).await {
        Ok(item) => Json(ApiResponse::ok(item)),
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("UNIQUE constraint") {
                Json(ApiResponse::err("An item with this name already exists".to_string()))
            } else {
                error!("Failed to update masked item {}: {}", id, e);
                Json(ApiResponse::err(format!("Failed to update item: {}", e)))
            }
        }
    }
}

/// DELETE /privacy/masked/:id - Delete a masked item
pub async fn delete_masked_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<ApiResponse<PrivacyResult>> {
    info!("Deleting masked item: {}", id);

    match state.privacy_manager.delete(id).await {
        Ok(result) => {
            if result.success {
                Json(ApiResponse::ok(result))
            } else {
                Json(ApiResponse::err(result.message))
            }
        }
        Err(e) => {
            error!("Failed to delete masked item {}: {}", id, e);
            Json(ApiResponse::err(format!("Failed to delete item: {}", e)))
        }
    }
}

/// GET /privacy/check - Check if a specific app/URL should be masked
#[derive(Debug, Deserialize)]
pub struct CheckMaskQuery {
    pub app_name: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CheckMaskResponse {
    pub should_mask: bool,
    pub reason: Option<String>,
}

pub async fn check_should_mask(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CheckMaskQuery>,
) -> Json<ApiResponse<CheckMaskResponse>> {
    let app_name = query.app_name.as_deref().unwrap_or("");
    let url = query.url.as_deref();

    let should_mask = state.privacy_manager.should_mask(app_name, url).await;

    let reason = if should_mask {
        if state.privacy_manager.cache().is_app_masked(app_name).await {
            Some(format!("App '{}' is masked", app_name))
        } else if let Some(u) = url {
            Some(format!("URL '{}' is masked", u))
        } else {
            Some("Masked".to_string())
        }
    } else {
        None
    };

    Json(ApiResponse::ok(CheckMaskResponse { should_mask, reason }))
}

/// POST /privacy/refresh - Refresh the privacy cache from database
pub async fn refresh_privacy_cache(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<PrivacyResult>> {
    info!("Refreshing privacy cache");

    match state.privacy_manager.refresh_cache().await {
        Ok(_) => {
            let (websites, apps) = state.privacy_manager.cache().get_stats().await;
            Json(ApiResponse::ok(PrivacyResult {
                success: true,
                message: format!("Cache refreshed: {} websites, {} apps", websites, apps),
            }))
        }
        Err(e) => {
            error!("Failed to refresh privacy cache: {}", e);
            Json(ApiResponse::err(format!("Failed to refresh cache: {}", e)))
        }
    }
}
