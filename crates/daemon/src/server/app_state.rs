use std::sync::Arc;
use app_core::db::DatabaseManager;
use crate::embedding::{AsyncEmbeddingModel, ModelStateManager};
use crate::throttle::AdaptiveScheduler;
use crate::server::privacy::PrivacyManager;

/// Application state shared across HTTP handlers
/// 
/// Models are Optional - daemon runs even without them (empty state).
/// When models are None, search endpoints will return appropriate errors.
pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub embedding_model: Option<Arc<AsyncEmbeddingModel>>,
    pub scheduler: AdaptiveScheduler,
    pub privacy_manager: Arc<PrivacyManager>,
    /// Model state manager for real-time state updates
    pub model_state: Arc<ModelStateManager>,
}

impl AppState {
    pub fn new(
        db: Arc<DatabaseManager>,
        embedding_model: Option<Arc<AsyncEmbeddingModel>>,
        scheduler: AdaptiveScheduler,
        privacy_manager: Arc<PrivacyManager>,
        model_state: Arc<ModelStateManager>,
    ) -> Self {
        Self {
            db,
            embedding_model,
            scheduler,
            privacy_manager,
            model_state,
        }
    }
    
    /// Check if models are loaded and ready for use
    pub fn models_ready(&self) -> bool {
        self.embedding_model.is_some()
    }
}
