use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::time::{Duration, Instant};

/// Cached OCR result for a window
#[derive(Clone, Debug)]
pub struct CachedOcrResult {
    pub text: String,
    pub text_json: String,
    pub confidence: f64,
    pub cached_at: Instant,
}

/// Key for identifying a window's content
#[derive(Hash, Eq, PartialEq, Clone, Debug)]
pub struct WindowCacheKey {
    /// Window identifier (app_name + window_name combination)
    pub window_id: String,
    /// Hash of the window's image content
    pub image_hash: u64,
}

/// Cache for window OCR results to avoid re-processing unchanged windows
pub struct WindowOcrCache {
    cache: HashMap<WindowCacheKey, CachedOcrResult>,
    /// Maximum age before a cached result is considered stale
    max_age: Duration,
    /// Maximum number of entries to prevent unbounded memory growth
    max_entries: usize,
    /// Stats for monitoring cache effectiveness
    hits: u64,
    misses: u64,
}

impl WindowOcrCache {
    pub fn new(max_age: Duration, max_entries: usize) -> Self {
        Self {
            cache: HashMap::new(),
            max_age,
            max_entries,
            hits: 0,
            misses: 0,
        }
    }

    /// Calculate hash for an image's raw bytes
    pub fn calculate_image_hash(image_bytes: &[u8]) -> u64 {
        let mut hasher = DefaultHasher::new();
        image_bytes.hash(&mut hasher);
        hasher.finish()
    }

    /// Create a window ID from app name and window name
    pub fn make_window_id(app_name: &str, window_name: &str) -> String {
        format!("{}::{}", app_name, window_name)
    }

    /// Try to get a cached OCR result for a window
    /// Returns Some(result) if cache hit and not stale, None otherwise
    pub fn get(&mut self, key: &WindowCacheKey) -> Option<CachedOcrResult> {
        if let Some(cached) = self.cache.get(key) {
            // Check if cache entry is still fresh
            if cached.cached_at.elapsed() < self.max_age {
                self.hits += 1;
                return Some(cached.clone());
            }
            // Entry is stale, will be replaced on next insert
        }
        self.misses += 1;
        None
    }

    /// Store an OCR result in the cache
    pub fn insert(
        &mut self,
        key: WindowCacheKey,
        text: String,
        text_json: String,
        confidence: f64,
    ) {
        // Evict oldest entries if at capacity
        if self.cache.len() >= self.max_entries {
            self.evict_oldest();
        }

        self.cache.insert(
            key,
            CachedOcrResult {
                text,
                text_json,
                confidence,
                cached_at: Instant::now(),
            },
        );
    }

    /// Remove the oldest cache entry
    fn evict_oldest(&mut self) {
        if let Some(oldest_key) = self
            .cache
            .iter()
            .min_by_key(|(_, v)| v.cached_at)
            .map(|(k, _)| k.clone())
        {
            self.cache.remove(&oldest_key);
        }
    }

    /// Clear all cached entries
    pub fn clear(&mut self) {
        self.cache.clear();
        self.hits = 0;
        self.misses = 0;
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            entries: self.cache.len(),
            hits: self.hits,
            misses: self.misses,
            hit_rate: if self.hits + self.misses > 0 {
                self.hits as f64 / (self.hits + self.misses) as f64
            } else {
                0.0
            },
        }
    }

    /// Remove stale entries (older than max_age)
    pub fn cleanup_stale(&mut self) {
        let now = Instant::now();
        self.cache
            .retain(|_, v| now.duration_since(v.cached_at) < self.max_age);
    }
}

impl Default for WindowOcrCache {
    /// Create with default settings (5 minute max age, 100 entries)
    fn default() -> Self {
        Self::new(Duration::from_secs(300), 100)
    }
}

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub entries: usize,
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
}
