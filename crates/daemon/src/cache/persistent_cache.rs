use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use serde::{Deserialize, Serialize};

/// Persistent cache entry that can be serialized to disk
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CacheEntry {
    pub text: String,
    pub text_json: String,
    pub confidence: f64,
    /// Unix timestamp when cached
    pub cached_at_unix: u64,
}

impl CacheEntry {
    pub fn new(text: String, text_json: String, confidence: f64) -> Self {
        let cached_at_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        
        Self {
            text,
            text_json,
            confidence,
            cached_at_unix,
        }
    }
    
    /// Check if entry has expired
    pub fn is_expired(&self, max_age_secs: u64) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        
        now.saturating_sub(self.cached_at_unix) > max_age_secs
    }
}

/// Key for window OCR cache
#[derive(Hash, Eq, PartialEq, Clone, Debug, Serialize, Deserialize)]
pub struct WindowCacheKey {
    pub window_id: String,
    pub image_hash: u64,
}

/// Persistent OCR cache with LRU eviction and disk persistence
pub struct PersistentOcrCache {
    cache: Arc<RwLock<HashMap<WindowCacheKey, CacheEntry>>>,
    max_entries: usize,
    max_age_secs: u64,
    cache_path: PathBuf,
    // Stats
    hits: Arc<RwLock<u64>>,
    misses: Arc<RwLock<u64>>,
}

impl PersistentOcrCache {
    pub fn new(max_age_secs: u64, max_entries: usize) -> Self {
        let cache_path = app_core::config::cache_dir().join("ocr_cache.json");
        
        // Ensure cache directory exists
        if let Some(parent) = cache_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let mut cache = HashMap::new();
        
        // Try to load existing cache
        if cache_path.exists() {
            match std::fs::read_to_string(&cache_path) {
                Ok(content) => {
                    match serde_json::from_str::<HashMap<String, CacheEntry>>(&content) {
                        Ok(loaded) => {
                            // Convert keys back and filter expired entries
                            for (key_str, entry) in loaded {
                                if !entry.is_expired(max_age_secs) {
                                    // Parse the serialized key
                                    if let Some((window_id, hash_str)) = key_str.split_once("::") {
                                        if let Ok(image_hash) = hash_str.parse::<u64>() {
                                            let key = WindowCacheKey {
                                                window_id: window_id.to_string(),
                                                image_hash,
                                            };
                                            cache.insert(key, entry);
                                        }
                                    }
                                }
                            }
                            info!("Loaded {} entries from OCR cache", cache.len());
                        }
                        Err(e) => {
                            warn!("Failed to parse OCR cache: {}, starting fresh", e);
                        }
                    }
                }
                Err(e) => {
                    debug!("No existing OCR cache found: {}", e);
                }
            }
        }
        
        Self {
            cache: Arc::new(RwLock::new(cache)),
            max_entries,
            max_age_secs,
            cache_path,
            hits: Arc::new(RwLock::new(0)),
            misses: Arc::new(RwLock::new(0)),
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
    
    /// Try to get a cached OCR result
    pub async fn get(&self, key: &WindowCacheKey) -> Option<CacheEntry> {
        let cache = self.cache.read().await;
        
        if let Some(entry) = cache.get(key) {
            if !entry.is_expired(self.max_age_secs) {
                let mut hits = self.hits.write().await;
                *hits += 1;
                return Some(entry.clone());
            }
        }
        
        let mut misses = self.misses.write().await;
        *misses += 1;
        None
    }
    
    /// Store an OCR result in the cache
    pub async fn insert(&self, key: WindowCacheKey, text: String, text_json: String, confidence: f64) {
        let entry = CacheEntry::new(text, text_json, confidence);
        
        let mut cache = self.cache.write().await;
        
        // Evict if at capacity
        if cache.len() >= self.max_entries {
            self.evict_oldest_internal(&mut cache);
        }
        
        cache.insert(key, entry);
    }
    
    /// Evict oldest entries (called internally with write lock held)
    fn evict_oldest_internal(&self, cache: &mut HashMap<WindowCacheKey, CacheEntry>) {
        // Find the oldest entry and remove it
        let oldest_key = cache
            .iter()
            .min_by_key(|(_, v)| v.cached_at_unix)
            .map(|(k, _)| k.clone());
        
        if let Some(key) = oldest_key {
            cache.remove(&key);
        }
    }
    
    /// Remove stale entries
    pub async fn cleanup_stale(&self) {
        let mut cache = self.cache.write().await;
        let before = cache.len();
        
        cache.retain(|_, v| !v.is_expired(self.max_age_secs));
        
        let removed = before - cache.len();
        if removed > 0 {
            debug!("Cleaned up {} stale OCR cache entries", removed);
        }
    }
    
    /// Persist cache to disk
    pub async fn persist(&self) -> std::io::Result<()> {
        let cache = self.cache.read().await;
        
        // Convert to serializable format
        let serializable: HashMap<String, CacheEntry> = cache
            .iter()
            .map(|(k, v)| (format!("{}::{}", k.window_id, k.image_hash), v.clone()))
            .collect();
        
        // Ensure directory exists
        if let Some(parent) = self.cache_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let json = serde_json::to_string_pretty(&serializable)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        
        std::fs::write(&self.cache_path, json)?;
        
        debug!("Persisted {} OCR cache entries to disk", cache.len());
        
        Ok(())
    }
    
    /// Clear the cache
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
        
        let mut hits = self.hits.write().await;
        let mut misses = self.misses.write().await;
        *hits = 0;
        *misses = 0;
    }
    
    /// Get cache statistics
    pub async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let hits = *self.hits.read().await;
        let misses = *self.misses.read().await;
        
        CacheStats {
            entries: cache.len(),
            hits,
            misses,
            hit_rate: if hits + misses > 0 {
                hits as f64 / (hits + misses) as f64
            } else {
                0.0
            },
        }
    }
    
    /// Reduce cache size under memory pressure
    pub async fn reduce_size(&self, target_size: usize) {
        let mut cache = self.cache.write().await;
        
        while cache.len() > target_size {
            self.evict_oldest_internal(&mut cache);
        }
        
        info!("Reduced OCR cache size to {} entries", cache.len());
    }
}

impl Clone for PersistentOcrCache {
    fn clone(&self) -> Self {
        Self {
            cache: Arc::clone(&self.cache),
            max_entries: self.max_entries,
            max_age_secs: self.max_age_secs,
            cache_path: self.cache_path.clone(),
            hits: Arc::clone(&self.hits),
            misses: Arc::clone(&self.misses),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub entries: usize,
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
}

impl Default for PersistentOcrCache {
    fn default() -> Self {
        Self::new(300, 100)
    }
}
