pub mod engine;
pub mod async_engine;

// Re-export async versions as primary API
pub use async_engine::{AsyncEmbeddingModel, AsyncCrossEncoder};