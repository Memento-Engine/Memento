use anyhow::{Result, anyhow};
use fastembed::{ TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions };

/// Returns the models directory from the standardized config
/// Windows: C:\Users\<Username>\AppData\Local\Memento\data\models\
fn get_models_dir() -> std::path::PathBuf {
    app_core::config::models_dir()
}

pub struct EmbeddingModel {
    model: TextEmbedding,
}

impl EmbeddingModel {
    /// Load the embedding model from the local cache.
    /// Returns an error if the model hasn't been downloaded yet.
    /// Models should be downloaded during onboarding, not at runtime.
    pub fn new() -> Result<Self> {
        let cache_dir = get_models_dir();
        
        if !super::async_engine::embedding_model_exists() {
            return Err(anyhow!(
                "Embedding model not found at {:?}. Please complete onboarding to download models.",
                cache_dir
            ));
        }
        
        // Load model from cache (no download)
        let model = TextEmbedding::try_new(
            InitOptions::new(FastEmbedModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(false)
        )?;

        Ok(Self { model })
    }

    pub fn generate_embedding(&mut self, text: &str) -> Result<Vec<f32>> {
        // fastembed expects batch input
        let embeddings = self.model.embed(vec![text.to_string()], None)?;

        // Return first embedding
        Ok(embeddings[0].clone())
    }
    
    pub fn generate_batch_embeddings(&mut self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        self.model.embed(texts, None)
    }
}
