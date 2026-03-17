use anyhow::Result;
use fastembed::{TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// Thread-safe embedding model wrapper optimized for async contexts
/// Uses tokio::sync::Mutex to avoid blocking the async runtime
pub struct AsyncEmbeddingModel {
    model: Arc<Mutex<TextEmbedding>>,
}

impl AsyncEmbeddingModel {
    /// Initialize the embedding model (does blocking I/O, call from spawn_blocking if needed)
    pub fn new() -> Result<Self> {
        info!("Initializing embedding model (AllMiniLML6V2)...");
        let model = TextEmbedding::try_new(InitOptions::new(FastEmbedModel::AllMiniLML6V2))?;
        info!("Embedding model initialized successfully");
        
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
pub struct AsyncCrossEncoder {
    model: Arc<Mutex<fastembed::TextRerank>>,
}

impl AsyncCrossEncoder {
    pub fn new() -> Result<Self> {
        info!("Initializing cross-encoder (JINA Reranker V1 Turbo)...");
        let model = fastembed::TextRerank::try_new(
            fastembed::RerankInitOptions::new(fastembed::RerankerModel::JINARerankerV1TurboEn)
        )?;
        info!("Cross-encoder initialized successfully");
        
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
