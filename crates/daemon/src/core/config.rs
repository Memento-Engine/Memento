use std::time::Duration;
use serde::{Deserialize, Serialize};

/// Daemon configuration with sensible defaults for 24/7 background operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    /// Base capture interval (will be adjusted based on system load)
    pub base_capture_interval: Duration,
    
    /// Maximum capture interval during high CPU load
    pub max_capture_interval: Duration,
    
    /// Minimum capture interval during idle
    pub min_capture_interval: Duration,
    
    /// CPU usage threshold (0.0-1.0) to start throttling
    pub cpu_throttle_threshold: f64,
    
    /// CPU usage threshold to pause capture entirely
    pub cpu_pause_threshold: f64,
    
    /// Memory pressure threshold (0.0-1.0) to reduce cache sizes
    pub memory_pressure_threshold: f64,
    
    /// User idle time (seconds) before reducing capture frequency
    pub idle_detection_threshold_secs: u64,
    
    /// Whether to pause capture when system is on battery
    pub pause_on_battery: bool,
    
    /// OCR cache settings
    pub ocr_cache_max_entries: usize,
    pub ocr_cache_max_age_secs: u64,
    
    /// Frame comparison settings
    pub frame_cache_size: usize,
    pub frame_similarity_threshold: u32,
    
    /// Embedding batch size for processing
    pub embedding_batch_size: usize,
    
    /// JPEG compression quality for stored images (1-100)
    pub image_quality: u8,
    
    /// Maximum concurrent OCR operations
    pub max_concurrent_ocr: usize,
    
    /// Server port (0 = auto-assign)
    pub server_port: u16,
    
    /// Enable debug logging
    pub debug_logging: bool,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            base_capture_interval: Duration::from_secs(1),
            max_capture_interval: Duration::from_secs(5),
            min_capture_interval: Duration::from_millis(500),
            cpu_throttle_threshold: 0.70, // Start throttling at 70% CPU
            cpu_pause_threshold: 0.90,     // Pause at 90% CPU
            memory_pressure_threshold: 0.85,
            idle_detection_threshold_secs: 300, // 5 minutes
            pause_on_battery: false,
            ocr_cache_max_entries: 100,
            ocr_cache_max_age_secs: 300, // 5 minutes
            frame_cache_size: 100,
            frame_similarity_threshold: 10,
            embedding_batch_size: 32,
            image_quality: 75,
            max_concurrent_ocr: 4,
            server_port: 0,
            debug_logging: false,
        }
    }
}

impl DaemonConfig {
    /// Load config from file or return defaults
    pub fn load() -> Self {
        let config_path = app_core::config::base_dir().join("daemon.toml");
        
        if config_path.exists() {
            match std::fs::read_to_string(&config_path) {
                Ok(content) => {
                    match toml::from_str(&content) {
                        Ok(config) => return config,
                        Err(e) => {
                            tracing::warn!("Failed to parse daemon config: {}, using defaults", e);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to read daemon config: {}, using defaults", e);
                }
            }
        }
        
        Self::default()
    }
    
    /// Save current config to file
    pub fn save(&self) -> std::io::Result<()> {
        let config_path = app_core::config::base_dir().join("daemon.toml");
        
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let content = toml::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        
        std::fs::write(&config_path, content)
    }
    
    /// Calculate adaptive capture interval based on CPU usage
    pub fn adaptive_interval(&self, cpu_usage: f64) -> Duration {
        if cpu_usage >= self.cpu_pause_threshold {
            // Pause capture entirely at very high CPU
            self.max_capture_interval * 2
        } else if cpu_usage >= self.cpu_throttle_threshold {
            // Linear interpolation between base and max
            let throttle_factor = (cpu_usage - self.cpu_throttle_threshold) 
                / (self.cpu_pause_threshold - self.cpu_throttle_threshold);
            let base_ms = self.base_capture_interval.as_millis() as f64;
            let max_ms = self.max_capture_interval.as_millis() as f64;
            Duration::from_millis((base_ms + (max_ms - base_ms) * throttle_factor) as u64)
        } else if cpu_usage < 0.3 {
            // System is idle, can capture faster
            self.min_capture_interval
        } else {
            self.base_capture_interval
        }
    }
}
