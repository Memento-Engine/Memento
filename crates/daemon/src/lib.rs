pub mod pipeline;
pub mod cache;
pub mod ocr;
pub mod embedding;
pub mod ui_events;
pub mod server;
pub mod browser_utils;
pub mod core;
pub mod throttle;
pub mod logging;

// Re-export commonly used types
pub use core::{DaemonConfig, DaemonLifecycle, ShutdownController};
pub use throttle::{AdaptiveScheduler, CpuMonitor};
pub use embedding::{AsyncEmbeddingModel, AsyncCrossEncoder};
pub use logging::{LogConfig, init_logging, init_default_logging, LatencyGuard};