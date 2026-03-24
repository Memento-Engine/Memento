//! Model downloader for onboarding
//!
//! This module handles downloading ML models during the onboarding process.
//! Models are downloaded to the user's data directory and loaded at runtime.

use anyhow::Result;
use fastembed::{ TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions };
use serde::Serialize;
use tokio::sync::broadcast;
use tracing::{ info, error };

/// Get the models directory from config
fn get_models_dir() -> std::path::PathBuf {
    app_core::config::models_dir()
}

/// Get the temporary directory for model downloads
fn get_temp_dir() -> std::path::PathBuf {
    app_core::config::temp_dir()
}

const EMBEDDING_MODEL_PREFIXES: &[&str] = &[
    "models--Qdrant--all-MiniLM-L6-v2-onnx",
    "fast-all-MiniLM-L6-v2",
];

const EMBEDDING_CANDIDATE_FILES: &[&str] = &[
    "model.onnx",
    "onnx/model.onnx",
    "model_optimized.onnx",
    "onnx/model_quantized.onnx",
];

const MIN_MODEL_FILE_BYTES: u64 = 1024;

/// Find model files in Hugging Face Hub cache structure
/// The structure is: models--Org--Name/snapshots/<hash>/model.onnx
fn find_model_in_snapshots(model_dir: &std::path::Path) -> bool {
    let snapshots_dir = model_dir.join("snapshots");
    if !snapshots_dir.exists() {
        return false;
    }

    // Just check if snapshots directory has any subdirectories with files
    if let Ok(entries) = std::fs::read_dir(&snapshots_dir) {
        for entry in entries.flatten() {
            let snapshot_path = entry.path();
            if snapshot_path.is_dir() {
                // If any snapshot directory has files, we're good
                if let Ok(files) = std::fs::read_dir(&snapshot_path) {
                    if files.count() > 0 {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Model download status for progress reporting
#[derive(Debug, Clone, Serialize)]
pub struct ModelDownloadStatus {
    /// Current model being downloaded
    pub current_model: String,
    /// Progress as a value between 0.0 and 1.0
    pub progress: f32,
    /// Progress as an integer percentage between 0 and 100
    pub progress_percent: u8,
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
            progress_percent: 0,
            message: "Initializing...".to_string(),
            completed: false,
            error: None,
        }
    }
}

fn status(
    current_model: &str,
    progress: f32,
    message: String,
    completed: bool,
    error: Option<String>
) -> ModelDownloadStatus {
    ModelDownloadStatus {
        current_model: current_model.to_string(),
        progress,
        progress_percent: (progress.clamp(0.0, 1.0) * 100.0).round() as u8,
        message,
        completed,
        error,
    }
}

fn remove_embedding_cache_dirs(cache_dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if EMBEDDING_MODEL_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

fn validate_embedding_artifacts(cache_dir: &std::path::Path) -> Result<()> {
    if !cache_dir.exists() {
        error!("Cache directory does not exist: {:?}", cache_dir);
        anyhow::bail!("Cache directory does not exist: {:?}", cache_dir);
    }

    info!("Validating embedding model in cache directory: {:?}", cache_dir);

    // Look for directories matching embedding model prefixes
    let entries = std::fs::read_dir(cache_dir)?;
    
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        // Check if this directory matches any of our known model prefixes
        if EMBEDDING_MODEL_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) {
            info!("Found model directory: {:?}", name);
            
            // Validate that it has the HuggingFace cache structure with model files
            if find_model_in_snapshots(&path) {
                info!("✓ Model validated successfully in {:?}", path);
                return Ok(());
            } else {
                error!("Model directory exists but snapshots are incomplete: {:?}", path);
            }
        }
    }

    anyhow::bail!("No valid embedding model artifact found after download");
}

/// Check if all required models are already downloaded
pub fn models_already_downloaded() -> bool {
    super::async_engine::all_models_exist()
}

/// Copy a directory recursively from source to destination
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dst.join(&file_name);

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}

/// Download all required models for Memento
/// Returns a broadcast receiver for progress updates
pub async fn download_all_models(
    progress_tx: broadcast::Sender<ModelDownloadStatus>
) -> Result<()> {
    let temp_dir = get_temp_dir();
    let production_dir = get_models_dir();

    // Ensure directories exist
    std::fs::create_dir_all(&temp_dir)?;
    std::fs::create_dir_all(&production_dir)?;

    info!("Starting model download to temp directory: {:?}", temp_dir);
    info!("Production directory: {:?}", production_dir);

    // Send initial status
    let _ = progress_tx.send(
        status(
            "embedding",
            0.0,
            "Preparing to download embedding model... (0%)".to_string(),
            false,
            None
        )
    );

    // Download embedding model (AllMiniLML6V2)
    let max_attempts = 3;
    let mut last_error: Option<String> = None;

    for attempt in 1..=max_attempts {
        let _ = progress_tx.send(
            status(
                "embedding",
                0.1,
                format!(
                    "Downloading embedding model (attempt {}/{})... (10%)",
                    attempt,
                    max_attempts
                ),
                false,
                None
            )
        );

        info!(
            "Download attempt {}/{} - Target temp directory: {:?}",
            attempt,
            max_attempts,
            temp_dir
        );

        let temp_dir_clone = temp_dir.clone();
        let download_result = tokio::task::spawn_blocking(move || {
            info!("Initializing TextEmbedding with temp cache_dir: {:?}", temp_dir_clone);
            TextEmbedding::try_new(
                InitOptions::new(FastEmbedModel::AllMiniLML6V2)
                    .with_cache_dir(temp_dir_clone)
                    .with_show_download_progress(true)
            )
        }).await?;

        if let Err(e) = download_result {
            let err_text = e.to_string();
            last_error = Some(err_text.clone());

            remove_embedding_cache_dirs(&temp_dir);

            if attempt < max_attempts {
                let _ = progress_tx.send(
                    status(
                        "embedding",
                        0.2,
                        format!("Download attempt {} failed, retrying... (20%)", attempt),
                        false,
                        None
                    )
                );
                tokio::time::sleep(std::time::Duration::from_secs((attempt as u64) * 2)).await;
                continue;
            }

            break;
        }

        let _ = progress_tx.send(
            status(
                "embedding",
                0.8,
                "Download complete, validating files... (80%)".to_string(),
                false,
                None
            )
        );

        // Log all directories in temp_dir for debugging
        info!("Listing all contents of temp directory: {:?}", temp_dir);
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if path.is_dir() {
                        info!("  [DIR] {}", name);
                        // List contents of subdirectories
                        if let Ok(sub_entries) = std::fs::read_dir(&path) {
                            for sub_entry in sub_entries.flatten().take(10) {
                                if let Some(sub_name) = sub_entry.file_name().to_str() {
                                    info!("    - {}", sub_name);
                                }
                            }
                        }
                    } else {
                        info!("  [FILE] {}", name);
                    }
                }
            }
        }

        match validate_embedding_artifacts(&temp_dir) {
            Ok(_) => {
                let _ = progress_tx.send(
                    status(
                        "embedding",
                        0.9,
                        "Validation successful, copying to production directory... (90%)".to_string(),
                        false,
                        None
                    )
                );

                info!("Validation successful. Copying models from temp to production...");

                // Find the model directory in temp
                let temp_entries = std::fs::read_dir(&temp_dir)?;
                for entry in temp_entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }

                    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                        continue;
                    };

                    if EMBEDDING_MODEL_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) {
                        let dest_path = production_dir.join(name);

                        // Remove existing model in production if it exists
                        if dest_path.exists() {
                            info!("Removing existing model directory: {:?}", dest_path);
                            let _ = std::fs::remove_dir_all(&dest_path);
                        }

                        info!("Copying {:?} to {:?}", path, dest_path);
                        copy_dir_recursive(&path, &dest_path)?;
                        info!("Successfully copied model to production directory");
                    }
                }

                // Clean up temp directory after successful copy
                info!("Cleaning up temp directory: {:?}", temp_dir);
                remove_embedding_cache_dirs(&temp_dir);

                let _ = progress_tx.send(
                    status(
                        "embedding",
                        1.0,
                        "Embedding model downloaded and validated successfully (100%)".to_string(),
                        true,
                        None
                    )
                );

                info!("Embedding model downloaded and installed successfully to production");
                return Ok(());
            }
            Err(e) => {
                let err_text = e.to_string();
                last_error = Some(err_text);
                remove_embedding_cache_dirs(&temp_dir);

                if attempt < max_attempts {
                    let _ = progress_tx.send(
                        status(
                            "embedding",
                            0.3,
                            format!("Validation failed on attempt {}, retrying clean download... (30%)", attempt),
                            false,
                            None
                        )
                    );
                    tokio::time::sleep(std::time::Duration::from_secs((attempt as u64) * 2)).await;
                    continue;
                }

                break;
            }
        }
    }

    let final_error = last_error.unwrap_or_else(|| "Unknown download failure".to_string());
    error!("Failed to download embedding model: {}", final_error);

    // Clean up temp directory on complete failure
    info!("Cleaning up temp directory after all attempts failed: {:?}", temp_dir);
    remove_embedding_cache_dirs(&temp_dir);

    let _ = progress_tx.send(
        status(
            "embedding",
            0.0,
            format!("Failed to download embedding model: {}", final_error),
            false,
            Some(final_error.clone())
        )
    );

    anyhow::bail!(final_error);
}
