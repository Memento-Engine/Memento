use anyhow::{Result, anyhow};
use fastembed::{TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// Get the models directory from config
fn get_models_dir() -> std::path::PathBuf {
    app_core::config::models_dir()
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

/// Return true if any subdirectory in `models_dir` starts with one of the provided prefixes.
fn has_model_dir_with_prefix(models_dir: &std::path::Path, prefixes: &[&str]) -> bool {
    let entries = match std::fs::read_dir(models_dir) {
        Ok(entries) => entries,
        Err(_) => return false,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if prefixes.iter().any(|prefix| name.starts_with(prefix)) {
            return true;
        }
    }

    false
}

fn find_model_dir_with_prefix(models_dir: &Path, prefixes: &[&str]) -> Option<PathBuf> {
    let entries = std::fs::read_dir(models_dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if prefixes.iter().any(|prefix| name.starts_with(prefix)) {
            return Some(path);
        }
    }

    None
}

fn validate_model_artifacts(model_dir: &Path, candidate_files: &[&str]) -> Result<()> {
    // First check Hugging Face Hub snapshots structure
    let snapshots_dir = model_dir.join("snapshots");
    if snapshots_dir.exists() && snapshots_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&snapshots_dir) {
            for entry in entries.flatten() {
                let snapshot_path = entry.path();
                if !snapshot_path.is_dir() {
                    continue;
                }
                
                // Check for candidate files in this snapshot
                for relative_file in candidate_files {
                    let candidate = snapshot_path.join(relative_file);
                    if candidate.exists() {
                        if let Ok(metadata) = std::fs::metadata(&candidate) {
                            if metadata.len() >= MIN_MODEL_FILE_BYTES {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: check direct file locations
    for relative_file in candidate_files {
        let candidate = model_dir.join(relative_file);
        if !candidate.exists() {
            continue;
        }

        let metadata = std::fs::metadata(&candidate)?;
        if metadata.len() < MIN_MODEL_FILE_BYTES {
            return Err(anyhow!(
                "Model artifact appears corrupted (too small): {:?}",
                candidate
            ));
        }

        return Ok(());
    }

    Err(anyhow!(
        "No valid model artifact found in {:?}. Expected one of: {:?}",
        model_dir,
        candidate_files
    ))
}

/// Check if embedding model files exist in the cache directory
pub fn embedding_model_exists() -> bool {
    let models_dir = get_models_dir();
    // Current cache naming (observed): models--Qdrant--all-MiniLM-L6-v2-onnx
    // Keep legacy prefix for backward compatibility.
    has_model_dir_with_prefix(&models_dir, EMBEDDING_MODEL_PREFIXES)
}

/// Check if all required models are downloaded
pub fn all_models_exist() -> bool {
    embedding_model_exists()
}

/// Thread-safe embedding model wrapper optimized for async contexts
/// Uses tokio::sync::Mutex to avoid blocking the async runtime
/// 
/// NOTE: Models must be pre-downloaded during onboarding. This will NOT download models.
pub struct AsyncEmbeddingModel {
    model: Arc<Mutex<TextEmbedding>>,
}

impl AsyncEmbeddingModel {
    /// Initialize the embedding model from the local cache.
    /// Returns an error if the model hasn't been downloaded yet.
    /// Models should be downloaded during onboarding, not at runtime.
    pub fn new() -> Result<Self> {
        let cache_dir = get_models_dir();
        
        if !embedding_model_exists() {
            return Err(anyhow!(
                "Embedding model not found at {:?}. Please complete onboarding to download models.",
                cache_dir
            ));
        }

        // Validate required artifacts before initialization to fail fast on partial cache contents.
        let model_dir = find_model_dir_with_prefix(&cache_dir, EMBEDDING_MODEL_PREFIXES)
            .ok_or_else(|| anyhow!("Embedding model directory missing in {:?}", cache_dir))?;
        validate_model_artifacts(&model_dir, EMBEDDING_CANDIDATE_FILES)?;
        
        info!("Loading embedding model (AllMiniLML6V2) from {:?}...", cache_dir);
        
        let model = TextEmbedding::try_new(
            InitOptions::new(FastEmbedModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(false)
        )?;
        
        info!("Embedding model loaded successfully");
        
        Ok(Self {
            model: Arc::new(Mutex::new(model)),
        })
    }
    
    /// Generate embedding for a single text
    /// Uses spawn_blocking internally to avoid blocking the async runtime
    pub async fn generate_embedding(&self, text: &str) -> Result<Vec<f32>> {
        let text = text.to_string();
        let model = Arc::clone(&self.model);
        
        tokio::task::spawn_blocking(move || {
            let mut model_guard = model.blocking_lock();
            let embeddings = model_guard.embed(vec![text], None)?;
            Ok(embeddings.into_iter().next().unwrap_or_default())
        })
        .await?
    }
    
    /// Generate embeddings for multiple texts in batch
    /// More efficient than calling generate_embedding multiple times
    pub async fn generate_batch_embeddings(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        
        let model = Arc::clone(&self.model);
        
        tokio::task::spawn_blocking(move || {
            let mut model_guard = model.blocking_lock();
            model_guard.embed(texts, None)
        })
        .await?
    }
}

impl Clone for AsyncEmbeddingModel {
    fn clone(&self) -> Self {
        Self {
            model: Arc::clone(&self.model),
        }
    }
}
