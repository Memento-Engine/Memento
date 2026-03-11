pub mod cache;
pub mod ocr_cache;
pub mod persistent_cache;

// Re-export commonly used types
pub use cache::FrameComparer;
pub use ocr_cache::{WindowOcrCache, CacheStats};
pub use persistent_cache::{PersistentOcrCache, WindowCacheKey, CacheEntry};