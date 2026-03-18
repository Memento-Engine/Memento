use anyhow::{Result, anyhow};
use fastembed::{TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// Get the models directory from config
fn get_models_dir() -> std::path::PathBuf {
    app_core::config::models_dir()
}

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

/// Check if embedding model files exist in the cache directory
pub fn embedding_model_exists() -> bool {
    let models_dir = get_models_dir();
    // Current cache naming (observed): models--Qdrant--all-MiniLM-L6-v2-onnx
    // Keep legacy prefix for backward compatibility.
    has_model_dir_with_prefix(
        &models_dir,
        &[
            "models--Qdrant--all-MiniLM-L6-v2-onnx",
            "fast-all-MiniLM-L6-v2",
        ],
    )
}

/// Check if cross-encoder model files exist in the cache directory
pub fn cross_encoder_model_exists() -> bool {
    let models_dir = get_models_dir();
    // Current cache naming (observed): models--jinaai--jina-reranker-v1-turbo-en
    // Keep legacy prefix for backward compatibility.
    has_model_dir_with_prefix(
        &models_dir,
        &[
            "models--jinaai--jina-reranker-v1-turbo-en",
            "fast-jina-reranker-v1-turbo-en",
        ],
    )
}

/// Check if all required models are downloaded
pub fn all_models_exist() -> bool {
    embedding_model_exists() && cross_encoder_model_exists()
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

/// Cross-encoder for reranking search results
/// 
/// NOTE: Models must be pre-downloaded during onboarding. This will NOT download models.
pub struct AsyncCrossEncoder {
    model: Arc<Mutex<fastembed::TextRerank>>,
}

impl AsyncCrossEncoder {
    /// Initialize the cross-encoder model from the local cache.
    /// Returns an error if the model hasn't been downloaded yet.
    /// Models should be downloaded during onboarding, not at runtime.
    pub fn new() -> Result<Self> {
        let cache_dir = get_models_dir();
        
        if !cross_encoder_model_exists() {
            return Err(anyhow!(
                "Cross-encoder model not found at {:?}. Please complete onboarding to download models.",
                cache_dir
            ));
        }
        
        info!("Loading cross-encoder (JINA Reranker V1 Turbo) from {:?}...", cache_dir);
        
        let model = fastembed::TextRerank::try_new(
            fastembed::RerankInitOptions::new(fastembed::RerankerModel::JINARerankerV1TurboEn)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(false)
        )?;
        
        info!("Cross-encoder loaded successfully");
        
        Ok(Self {
            model: Arc::new(Mutex::new(model)),
        })
    }
    
    /// Score query-document pairs for reranking
    pub async fn score_batch(&self, query: &str, documents: &[&str]) -> Result<Vec<f32>> {
        let query = query.to_string();
        // Clone documents to owned Strings that can be moved into spawn_blocking
        let documents: Vec<String> = documents.iter().map(|s| s.to_string()).collect();
        let model = Arc::clone(&self.model);
        
        tokio::task::spawn_blocking(move || {
            let mut model_guard = model.blocking_lock();
            // rerank expects: query: impl AsRef<str>, documents: impl AsRef<[S]> where S: AsRef<str>
            // Pass owned String for query and reference to Vec for documents slice
            let results: Vec<fastembed::RerankResult> = model_guard.rerank(query, documents.as_slice(), false, None)?;
            Ok(results.into_iter().map(|r| r.score).collect())
        })
        .await?
    }
}

impl Clone for AsyncCrossEncoder {
    fn clone(&self) -> Self {
        Self {
            model: Arc::clone(&self.model),
        }
    }
}
