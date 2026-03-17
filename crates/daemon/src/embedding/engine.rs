use anyhow::Result;
use fastembed::{ TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions };
use std::path::PathBuf;

/// Returns the models directory: %APPDATA%\Memento\models\
/// This location persists across Velopack updates.
fn get_models_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Memento")
        .join("models")
}

pub struct EmbeddingModel {
    model: TextEmbedding,
}

impl EmbeddingModel {
    pub fn new() -> Result<Self> {
        let cache_dir = get_models_dir();
        std::fs::create_dir_all(&cache_dir)?;
        
        // Downloads model on first run if not present
        let model = TextEmbedding::try_new(
            InitOptions::new(FastEmbedModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(true)
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

use fastembed::{ TextRerank, RerankerModel, RerankInitOptions };

pub struct CrossEncoder {
    model: TextRerank,
}

impl CrossEncoder {
    pub fn new() -> Result<Self> {
        let cache_dir = get_models_dir();
        std::fs::create_dir_all(&cache_dir)?;
        
        tracing::info!("Loading reranker JINARerankerV1TurboEn");
        let model = TextRerank::try_new(
            RerankInitOptions::new(RerankerModel::JINARerankerV1TurboEn)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(true)
        )?;

        Ok(Self { model })
    }

    pub fn score_batch(&mut self, query: &str, documents: &[&str]) -> Result<Vec<f32>> {
        let results = self.model.rerank(query, documents, false, None)?;

        Ok(
            results
                .into_iter()
                .map(|r| r.score)
                .collect()
        )
    }
}
