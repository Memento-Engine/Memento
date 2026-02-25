use anyhow::Result;
use fastembed::{ TextEmbedding, EmbeddingModel as FastEmbedModel, InitOptions };

pub struct EmbeddingModel {
    model: TextEmbedding,
}

impl EmbeddingModel {
    pub fn new() -> Result<Self> {
        // Using optimized ONNX model internally
        let model = TextEmbedding::try_new(InitOptions::new(FastEmbedModel::AllMiniLML6V2))?;

        Ok(Self { model })
    }

    pub fn generate_embedding(&mut self, text: &str) -> Result<Vec<f32>> {
        // fastembed expects batch input
        let embeddings = self.model.embed(vec![text.to_string()], None)?;

        // Return first embedding
        Ok(embeddings[0].clone())
    }
}

use fastembed::{ TextRerank, RerankerModel, RerankInitOptions };

pub struct CrossEncoder {
    model: TextRerank,
}

impl CrossEncoder {
    pub fn new() -> Result<Self> {
        println!("Loading reranker V2M3");
        let model = TextRerank::try_new(RerankInitOptions::new(RerankerModel::JINARerankerV1TurboEn))?;

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
