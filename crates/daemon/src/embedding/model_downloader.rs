//! Model downloader for onboarding
//! 
//! This module handles downloading ML models during the onboarding process.
//! Models are downloaded to the user's data directory and loaded at runtime.

use anyhow::Result;
use fastembed::{TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions, TextRerank, RerankerModel, RerankInitOptions};
use serde::Serialize;
use tokio::sync::broadcast;
use tracing::{info, error};

/// Get the models directory from config
fn get_models_dir() -> std::path::PathBuf {
    app_core::config::models_dir()
}

/// Model download status for progress reporting
#[derive(Debug, Clone, Serialize)]
pub struct ModelDownloadStatus {
    /// Current model being downloaded
    pub current_model: String,
    /// Progress as a value between 0.0 and 1.0
    pub progress: f32,
    /// Status message
    pub message: String,
    /// Whether download is complete
    pub completed: bool,
    /// Error message if any
    pub error: Option<String>,
}

impl Default for ModelDownloadStatus {
    fn default() -> Self {
        Self {
            current_model: String::new(),
            progress: 0.0,
            message: "Initializing...".to_string(),
            completed: false,
            error: None,
        }
    }
}

/// Check if all required models are already downloaded
pub fn models_already_downloaded() -> bool {
    super::async_engine::all_models_exist()
}

/// Download all required models for Memento
/// Returns a broadcast receiver for progress updates
pub async fn download_all_models(
    progress_tx: broadcast::Sender<ModelDownloadStatus>,
) -> Result<()> {
    let cache_dir = get_models_dir();
    
    // Ensure directory exists
    std::fs::create_dir_all(&cache_dir)?;
    
    info!("Starting model download to {:?}", cache_dir);
    
    // Send initial status
    let _ = progress_tx.send(ModelDownloadStatus {
        current_model: "embedding".to_string(),
        progress: 0.0,
        message: "Preparing to download embedding model...".to_string(),
        completed: false,
        error: None,
    });
    
    // Download embedding model (AllMiniLML6V2)
    let cache_dir_clone = cache_dir.clone();
    let progress_tx_clone = progress_tx.clone();
    
    let embedding_result = tokio::task::spawn_blocking(move || {
        let _ = progress_tx_clone.send(ModelDownloadStatus {
            current_model: "embedding".to_string(),
            progress: 0.1,
            message: "Downloading embedding model (all-MiniLM-L6-v2)...".to_string(),
            completed: false,
            error: None,
        });
        
        let result = TextEmbedding::try_new(
            InitOptions::new(FastEmbedModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir_clone)
                .with_show_download_progress(true)
        );
        
        match &result {
            Ok(_) => {
                let _ = progress_tx_clone.send(ModelDownloadStatus {
                    current_model: "embedding".to_string(),
                    progress: 0.5,
                    message: "Embedding model downloaded successfully".to_string(),
                    completed: false,
                    error: None,
                });
            }
            Err(e) => {
                let _ = progress_tx_clone.send(ModelDownloadStatus {
                    current_model: "embedding".to_string(),
                    progress: 0.0,
                    message: format!("Failed to download embedding model: {}", e),
                    completed: false,
                    error: Some(e.to_string()),
                });
            }
        }
        
        result
    }).await?;
    
    if let Err(e) = embedding_result {
        error!("Failed to download embedding model: {}", e);
        let _ = progress_tx.send(ModelDownloadStatus {
            current_model: "embedding".to_string(),
            progress: 0.0,
            message: format!("Failed to download embedding model: {}", e),
            completed: false,
            error: Some(e.to_string()),
        });
        return Err(e.into());
    }
    
    // Download cross-encoder model (JINA Reranker)
    let progress_tx_clone = progress_tx.clone();
    
    let _ = progress_tx.send(ModelDownloadStatus {
        current_model: "cross-encoder".to_string(),
        progress: 0.5,
        message: "Preparing to download cross-encoder model...".to_string(),
        completed: false,
        error: None,
    });
    
    let cross_encoder_result = tokio::task::spawn_blocking(move || {
        let _ = progress_tx_clone.send(ModelDownloadStatus {
            current_model: "cross-encoder".to_string(),
            progress: 0.6,
            message: "Downloading cross-encoder model (JINA Reranker)...".to_string(),
            completed: false,
            error: None,
        });
        
        let result = TextRerank::try_new(
            RerankInitOptions::new(RerankerModel::JINARerankerV1TurboEn)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(true)
        );
        
        match &result {
            Ok(_) => {
                let _ = progress_tx_clone.send(ModelDownloadStatus {
                    current_model: "cross-encoder".to_string(),
                    progress: 1.0,
                    message: "All models downloaded successfully!".to_string(),
                    completed: true,
                    error: None,
                });
            }
            Err(e) => {
                let _ = progress_tx_clone.send(ModelDownloadStatus {
                    current_model: "cross-encoder".to_string(),
                    progress: 0.5,
                    message: format!("Failed to download cross-encoder model: {}", e),
                    completed: false,
                    error: Some(e.to_string()),
                });
            }
        }
        
        result
    }).await?;
    
    if let Err(e) = cross_encoder_result {
        error!("Failed to download cross-encoder model: {}", e);
        let _ = progress_tx.send(ModelDownloadStatus {
            current_model: "cross-encoder".to_string(),
            progress: 0.5,
            message: format!("Failed to download cross-encoder model: {}", e),
            completed: false,
            error: Some(e.to_string()),
        });
        return Err(e.into());
    }
    
    info!("All models downloaded successfully");
    
    Ok(())
}
