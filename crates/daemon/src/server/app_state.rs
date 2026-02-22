use app_core::db::DatabaseManager;
use std::sync::Arc;

use crate::embedding::engine::EmbeddingModel;

pub struct AppState {
    pub db : Arc<DatabaseManager>,
    pub embeddingModel : Arc<std::sync::Mutex<EmbeddingModel>>
}