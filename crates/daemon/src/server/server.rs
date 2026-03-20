use std::sync::Arc;
use std::time::Duration;
use axum::{routing::post, routing::get, routing::put, routing::delete, Router, Json};
use serde::Serialize;
use tower_http::cors::{CorsLayer, Any};
use tracing::{error, info, warn};

use crate::core::ShutdownController;
use crate::server::app_state::AppState;
use crate::server::search_tool::search_tool;
use crate::server::skill_endpoints::{sql_execute, semantic_search, hybrid_search, search_results_by_chunk_ids};
use crate::server::storage_endpoints::{
    get_disk_usage_handler, get_capture_status, pause_capture, resume_capture, clear_storage
};
use crate::server::privacy_endpoints::{
    list_masked_items, search_masked_items, create_masked_item, 
    update_masked_item, delete_masked_item, check_should_mask, refresh_privacy_cache
};
use crate::server::model_endpoints::{
    check_models_status, download_models_sse, download_models_sync, model_state_stream
};
use crate::server::chat_endpoints::{
    save_message, get_messages, list_chats, rename_chat, pin_chat, delete_chat
};

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: &'static str,
    pub version: &'static str,
    pub uptime_secs: u64,
}

/// Health check endpoint
async fn health_check() -> Json<HealthStatus> {
    Json(HealthStatus {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: 0, // Would need lifecycle access for real uptime
    })
}

fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/search_tool", post(search_tool))
        .route("/sql_execute", post(sql_execute))
        .route("/semantic_search", post(semantic_search))
        .route("/hybrid_search", post(hybrid_search))
        .route("/search_results_by_chunk_ids", post(search_results_by_chunk_ids))
        .route("/healthz", get(|| async { "ok" }))
        .route("/health", get(health_check))
        // Storage management endpoints
        .route("/disk_usage", get(get_disk_usage_handler))
        .route("/capture/status", get(get_capture_status))
        .route("/capture/pause", post(pause_capture))
        .route("/capture/resume", post(resume_capture))
        .route("/clear", post(clear_storage))
        // Privacy/masking endpoints
        .route("/privacy/masked", get(list_masked_items))
        .route("/privacy/masked", post(create_masked_item))
        .route("/privacy/masked/search", get(search_masked_items))
        .route("/privacy/masked/{id}", put(update_masked_item))
        .route("/privacy/masked/{id}", delete(delete_masked_item))
        .route("/privacy/check", get(check_should_mask))
        .route("/privacy/refresh", post(refresh_privacy_cache))
        // Model setup endpoints (for onboarding)
        .route("/models/status", get(check_models_status))
        .route("/models/download", get(download_models_sse))
        .route("/models/download", post(download_models_sync))
        // Real-time model state stream (SSE)
        .route("/models/state/stream", get(model_state_stream))
        // Chat message persistence
        .route("/chat/messages", post(save_message))
        .route("/chat/messages/list", post(get_messages))
        .route("/chat/sessions", post(list_chats))
        .route("/chat/sessions/{session_id}", put(rename_chat))
        .route("/chat/sessions/{session_id}", delete(delete_chat))
        .route("/chat/sessions/{session_id}/pin", put(pin_chat))
}

pub async fn start_server(app_state: Arc<AppState>, shutdown: Arc<ShutdownController>) {
    let prefix = "/api/v1";
    
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::CACHE_CONTROL,
        ]);
    
    let app = Router::new()
        .nest(prefix, api_router())
        .with_state(app_state)
        .layer(cors);
    
    // Bind with retry
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(64);
    
    let listener = loop {
        match tokio::net::TcpListener::bind("127.0.0.1:0").await {
            Ok(l) => break l,
            Err(e) => {
                error!("Failed to bind server: {:?}", e);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "daemon");
                    scope.set_tag("service", "daemon");
                    scope.set_tag("area", "server-bind");
                    scope.set_extra("error", e.to_string().into());
                }, || {
                    sentry::capture_message("Daemon server bind failed", sentry::Level::Error);
                });
                warn!("Retrying in {:?}...", backoff);
                tokio::time::sleep(backoff).await;
                backoff = std::cmp::min(backoff * 2, max_backoff);
            }
        }
    };
    
    let port = listener.local_addr()
        .map(|a| a.port())
        .unwrap_or(0);
    
    write_port_file(port);
    info!("Server running on http://127.0.0.1:{}", port);
    
    // Serve with graceful shutdown
    let shutdown_signal = shutdown.clone();
    
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal.wait_for_shutdown().await;
            info!("Server received shutdown signal");
        })
        .await
        .unwrap_or_else(|e| {
            error!("Server error: {:?}", e);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "server-runtime");
                scope.set_extra("error", e.to_string().into());
            }, || {
                sentry::capture_message("Daemon server runtime error", sentry::Level::Error);
            });
        });
    
    info!("Server stopped");
}

fn write_port_file(port: u16) {
    use std::fs::{create_dir_all, write};
    
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(64);
    let max_retries = 8;
    
    for attempt in 1..=max_retries {
        let result = (|| -> Result<(), String> {
            // Use the standardized ports directory from config
            let file_path = app_core::config::port_file_path("daemon");
            
            // Ensure directory exists
            if let Some(dir_path) = file_path.parent() {
                create_dir_all(dir_path)
                    .map_err(|e| format!("Failed to create directory {:?}: {}", dir_path, e))?;
            }
            
            write(&file_path, port.to_string())
                .map_err(|e| format!("Failed to write to file {:?}: {}", file_path, e))?;
            
            Ok(())
        })();
        
        match result {
            Ok(_) => {
                info!("Successfully wrote port {} to port file", port);
                return;
            }
            Err(e) => {
                if attempt >= max_retries {
                    error!("Max retries reached. Fatal error writing port file: {}", e);
                    sentry::with_scope(|scope| {
                        scope.set_tag("environment", "daemon");
                        scope.set_tag("service", "daemon");
                        scope.set_tag("area", "port-file");
                        scope.set_extra("error", e.clone().into());
                        scope.set_extra("port", (port as u64).into());
                    }, || {
                        sentry::capture_message("Failed to write daemon port file", sentry::Level::Error);
                    });
                    return;
                }
                
                warn!("Attempt {} failed: {}. Retrying in {:?}...", attempt, e, backoff);
                std::thread::sleep(backoff);
                backoff = std::cmp::min(backoff * 2, max_backoff);
            }
        }
    }
}
