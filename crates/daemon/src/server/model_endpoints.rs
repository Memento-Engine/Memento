//! Model setup endpoints for onboarding
//! 
//! Provides endpoints for checking model status and downloading models during onboarding.
//! The daemon can run without models (empty state) - these endpoints help the UI
//! determine when models need to be downloaded.

use axum::{
    extract::State,
    response::sse::{Event, Sse},
    Json,
};
use futures_util::stream::Stream;
use serde::Serialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tracing::{info, error};

use crate::embedding::{ModelDownloadStatus, cross_encoder_model_exists, download_all_models, embedding_model_exists, models_already_downloaded};
use crate::server::app_state::AppState;

/// Model status enum for frontend to determine UI state
#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelState {
    /// Models not downloaded - show onboarding download UI
    NotDownloaded,
    /// Models partially downloaded - show download UI with resume option
    PartialDownload,
    /// Models downloaded but not loaded (daemon needs restart or error occurred)
    DownloadedNotLoaded,
    /// Models downloaded and loaded - ready to use
    Ready,
    /// Models exist but appear corrupted
    Corrupted,
}

/// Response for model status check
#[derive(Serialize)]
pub struct ModelStatusResponse {
    /// Overall status of the models
    pub status: ModelState,
    /// Whether all models are downloaded and ready (legacy field for compatibility)
    pub models_ready: bool,
    /// Whether the embedding model files exist on disk
    pub embedding_exists: bool,
    /// Whether the cross-encoder model files exist on disk  
    pub cross_encoder_exists: bool,
    /// Whether models are loaded in memory and ready for use
    pub models_loaded: bool,
    /// Path where models are stored
    pub models_path: String,
    /// User-friendly message explaining current state
    pub message: String,
}

/// Check if models are already downloaded and their current state
pub async fn check_models_status(
    State(state): State<Arc<AppState>>,
) -> Json<ModelStatusResponse> {
    let models_path = app_core::config::models_dir();
    let embedding_exists = embedding_model_exists();
    let cross_encoder_exists = cross_encoder_model_exists();
    let models_loaded = state.models_ready();
    let all_exist = embedding_exists && cross_encoder_exists;
    
    // Determine status
    let (status, message) = if models_loaded {
        (ModelState::Ready, "Models are ready to use.".to_string())
    } else if all_exist {
        // Models exist on disk but aren't loaded - might need restart or there was a load error
        (
            ModelState::DownloadedNotLoaded,
            "Models are downloaded but not loaded. Try restarting the app.".to_string()
        )
    } else if embedding_exists || cross_encoder_exists {
        // Partial download
        (
            ModelState::PartialDownload,
            "Some models are missing. Please complete the download.".to_string()
        )
    } else {
        // Nothing downloaded
        (
            ModelState::NotDownloaded,
            "AI models need to be downloaded for local processing.".to_string()
        )
    };
    
    Json(ModelStatusResponse {
        status,
        models_ready: models_loaded,
        embedding_exists,
        cross_encoder_exists,
        models_loaded,
        models_path: models_path.to_string_lossy().to_string(),
        message,
    })
}

/// Download models with SSE progress updates
pub async fn download_models_sse(
    State(_state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    info!("Starting model download via SSE");
    
    // Create broadcast channel for progress updates
    let (tx, rx) = broadcast::channel::<ModelDownloadStatus>(16);
    
    // Spawn the download task
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        if let Err(e) = download_all_models(tx_clone).await {
            error!("Model download failed: {}", e);
        }
    });
    
    // Convert broadcast receiver to SSE stream
    let stream = BroadcastStream::new(rx).map(|result| {
        match result {
            Ok(status) => {
                let data = serde_json::to_string(&status).unwrap_or_default();
                Ok(Event::default().data(data))
            }
            Err(_) => {
                // Channel closed, send completion
                let status = ModelDownloadStatus {
                    current_model: String::new(),
                    progress: 1.0,
                    message: "Download stream ended".to_string(),
                    completed: true,
                    error: None,
                };
                let data = serde_json::to_string(&status).unwrap_or_default();
                Ok(Event::default().data(data))
            }
        }
    });
    
    Sse::new(stream)
}

/// Simple synchronous download endpoint (alternative to SSE)
#[derive(Serialize)]
pub struct DownloadResult {
    pub success: bool,
    pub message: String,
}

pub async fn download_models_sync(
    State(state): State<Arc<AppState>>,
) -> Json<DownloadResult> {
    info!("Starting synchronous model download");
    
    // Create a dummy channel (we won't use the receiver)
    let (tx, _rx) = broadcast::channel::<ModelDownloadStatus>(16);
    

    if models_already_downloaded() {
        info!("Models already downloaded, skipping download");
        
        // Refresh state to ensure frontend updates
        state.model_state.refresh();
        
        return Json(DownloadResult {
            success: true,
            message: "Models are already downloaded.".to_string(),
        });
    }


    match download_all_models(tx).await {
        Ok(_) => {
            info!("Model download completed successfully");
            
            // Immediately refresh and broadcast state so frontend moves to next slide
            state.model_state.refresh();
            
            Json(DownloadResult {
                success: true,
                message: "All models downloaded successfully".to_string(),
            })
        }
        Err(e) => {
            error!("Model download failed: {}", e);
            
            // Broadcast updated state (partial download or error)
            state.model_state.refresh();
            
            Json(DownloadResult {
                success: false,
                message: format!("Download failed: {}", e),
            })
        }
    }
}

/// SSE endpoint for real-time model state updates
/// 
/// Frontend subscribes to this endpoint to receive instant notifications
/// when model state changes (e.g., user deletes models, download completes).
/// 
/// Events are pushed:
/// - Immediately on connect (current state)
/// - When file system changes are detected
/// - Every 30 seconds as a heartbeat/validation
pub async fn model_state_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    info!("Client subscribed to model state stream");
    
    // Get initial state and subscribe to updates
    let initial_state = state.model_state.get_state();
    let rx = state.model_state.subscribe();
    
    // Create stream that starts with initial state then continues with updates
    let initial_stream = futures_util::stream::once(async move {
        let data = serde_json::to_string(&initial_state).unwrap_or_default();
        Ok::<_, Infallible>(Event::default().event("state").data(data))
    });
    
    let update_stream = BroadcastStream::new(rx).map(|result| {
        match result {
            Ok(state) => {
                let data = serde_json::to_string(&state).unwrap_or_default();
                Ok(Event::default().event("state").data(data))
            }
            Err(_) => {
                // Channel lagged or closed - send reconnect hint
                Ok(Event::default().event("reconnect").data("{}"))
            }
        }
    });
    
    let combined = initial_stream.chain(update_stream);
    
    Sse::new(combined).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping")
    )
}
