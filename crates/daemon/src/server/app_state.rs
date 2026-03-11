use std::sync::Arc;
use app_core::db::DatabaseManager;
use crate::embedding::{AsyncEmbeddingModel, AsyncCrossEncoder};

/// Application state shared across HTTP handlers
pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub embedding_model: Arc<AsyncEmbeddingModel>,
    pub cross_encoder: Arc<AsyncCrossEncoder>,
}

impl AppState {
    pub fn new(
        db: Arc<DatabaseManager>,
        embedding_model: Arc<AsyncEmbeddingModel>,
        cross_encoder: Arc<AsyncCrossEncoder>,
    ) -> Self {
        Self {
            db,
            embedding_model,
            cross_encoder,
        }
    }
}

// Keep old field names as aliases for backward compatibility
impl AppState {
    #[deprecated(note = "Use embedding_model instead")]
    pub fn embeddingModel(&self) -> &Arc<AsyncEmbeddingModel> {
        &self.embedding_model
    }
    
    #[deprecated(note = "Use cross_encoder instead")]
    pub fn crossEncoder(&self) -> &Arc<AsyncCrossEncoder> {
        &self.cross_encoder
    }
}
