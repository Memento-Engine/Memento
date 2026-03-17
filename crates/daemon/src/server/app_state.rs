use std::sync::Arc;
use app_core::db::DatabaseManager;
use crate::embedding::{AsyncEmbeddingModel, AsyncCrossEncoder};
use crate::throttle::AdaptiveScheduler;
use crate::server::privacy::PrivacyManager;

/// Application state shared across HTTP handlers
pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub embedding_model: Arc<AsyncEmbeddingModel>,
    pub cross_encoder: Arc<AsyncCrossEncoder>,
    pub scheduler: AdaptiveScheduler,
    pub privacy_manager: Arc<PrivacyManager>,
}

impl AppState {
    pub fn new(
        db: Arc<DatabaseManager>,
        embedding_model: Arc<AsyncEmbeddingModel>,
        cross_encoder: Arc<AsyncCrossEncoder>,
        scheduler: AdaptiveScheduler,
        privacy_manager: Arc<PrivacyManager>,
    ) -> Self {
        Self {
            db,
            embedding_model,
            cross_encoder,
            scheduler,
            privacy_manager,
        }
    }
}
