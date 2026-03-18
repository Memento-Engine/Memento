pub mod engine;
pub mod async_engine;
pub mod model_downloader;
pub mod model_watcher;

// Re-export async versions as primary API
pub use async_engine::{AsyncEmbeddingModel, AsyncCrossEncoder, all_models_exist, embedding_model_exists, cross_encoder_model_exists};
pub use model_downloader::{download_all_models, models_already_downloaded, ModelDownloadStatus};
pub use model_watcher::{ModelState, ModelStateKind, ModelStateManager, start_model_watcher, start_periodic_validation};