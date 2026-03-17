use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::server::app_state::AppState;
use crate::server::disk_usage::{self, ClearResult, DiskUsage};

/// Response for capture status
#[derive(Debug, Serialize)]
pub struct CaptureStatus {
    pub paused: bool,
    pub reason: String,
}

/// Response for pause/resume operations
#[derive(Debug, Serialize)]
pub struct PauseResumeResponse {
    pub success: bool,
    pub paused: bool,
    pub message: String,
}

/// Request for clear operations
#[derive(Debug, Deserialize)]
pub struct ClearRequest {
    /// What to clear: "cache", "logs", "media", "database", or "all"
    pub target: String,
}

/// Response wrapper for API responses
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// GET /disk_usage - Get comprehensive disk usage statistics
pub async fn get_disk_usage_handler() -> Json<ApiResponse<DiskUsage>> {
    debug!("Getting disk usage");
    let usage = disk_usage::get_disk_usage();
    Json(ApiResponse::ok(usage))
}

/// GET /capture/status - Get current capture status (paused or not)
pub async fn get_capture_status(State(state): State<Arc<AppState>>) -> Json<ApiResponse<CaptureStatus>> {
    let paused = state.scheduler.is_paused().await;
    let reason = if paused {
        "Manually paused".to_string()
    } else {
        "Running normally".to_string()
    };

    Json(ApiResponse::ok(CaptureStatus { paused, reason }))
}

/// POST /capture/pause - Pause screen capture
pub async fn pause_capture(State(state): State<Arc<AppState>>) -> Json<PauseResumeResponse> {
    info!("Pausing screen capture via API");
    state.scheduler.pause().await;

    Json(PauseResumeResponse {
        success: true,
        paused: true,
        message: "Screen capture paused".to_string(),
    })
}

/// POST /capture/resume - Resume screen capture
pub async fn resume_capture(State(state): State<Arc<AppState>>) -> Json<PauseResumeResponse> {
    info!("Resuming screen capture via API");
    state.scheduler.resume().await;

    Json(PauseResumeResponse {
        success: true,
        paused: false,
        message: "Screen capture resumed".to_string(),
    })
}

/// POST /clear - Clear specified storage (cache, logs, media, database, or all)
/// 
/// For database clearing, this will automatically pause capture first and resume after
pub async fn clear_storage(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ClearRequest>,
) -> Json<ApiResponse<ClearResult>> {
    let target = request.target.to_lowercase();
    info!("Clearing storage: {}", target);

    // For database or all, we need to pause capture first
    let needs_pause = target == "database" || target == "all";
    let was_paused = if needs_pause {
        let already_paused = state.scheduler.is_paused().await;
        if !already_paused {
            info!("Pausing capture before clearing {}", target);
            state.scheduler.pause().await;
            // Wait a moment for any in-flight captures to complete
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        already_paused
    } else {
        false
    };

    let result = match target.as_str() {
        "cache" => disk_usage::clear_cache(),
        "logs" => disk_usage::clear_logs(),
        "media" => disk_usage::clear_media(),
        "database" => disk_usage::clear_database(),
        "all" => disk_usage::clear_all(),
        _ => {
            warn!("Unknown clear target: {}", target);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "storage-endpoints");
                scope.set_extra("target", target.clone().into());
            }, || {
                sentry::capture_message("Unknown clear_storage target", sentry::Level::Warning);
            });
            return Json(ApiResponse::err(format!(
                "Unknown target: {}. Valid targets: cache, logs, media, database, all",
                target
            )));
        }
    };

    // Resume capture if we paused it and it wasn't already paused
    if needs_pause && !was_paused {
        info!("Resuming capture after clearing {}", target);
        state.scheduler.resume().await;
    }

    if result.success {
        Json(ApiResponse::ok(result))
    } else {
        sentry::with_scope(|scope| {
            scope.set_tag("environment", "daemon");
            scope.set_tag("service", "daemon");
            scope.set_tag("area", "storage-endpoints");
            scope.set_extra("target", target.into());
            scope.set_extra("message", result.message.clone().into());
        }, || {
            sentry::capture_message("clear_storage operation failed", sentry::Level::Error);
        });
        Json(ApiResponse::err(result.message.clone()))
    }
}
