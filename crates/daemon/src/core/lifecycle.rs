use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::info;

use super::config::DaemonConfig;
use super::shutdown::ShutdownController;

/// Runtime statistics for monitoring daemon health
#[derive(Debug, Clone, Default)]
pub struct DaemonStats {
    pub frames_captured: u64,
    pub frames_skipped: u64,
    pub ocr_cache_hits: u64,
    pub ocr_cache_misses: u64,
    pub embeddings_generated: u64,
    pub db_inserts: u64,
    pub errors: u64,
    pub uptime_secs: u64,
    pub current_cpu_usage: f64,
    pub current_memory_mb: f64,
    pub last_capture_at: Option<Instant>,
    pub captures_per_minute: f64,
}

/// Daemon lifecycle state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DaemonState {
    Starting,
    Running,
    Paused,     // Paused due to high CPU or user idle
    ShuttingDown,
    Stopped,
}

/// Manages the daemon lifecycle and runtime state
pub struct DaemonLifecycle {
    config: DaemonConfig,
    state: RwLock<DaemonState>,
    stats: RwLock<DaemonStats>,
    shutdown: Arc<ShutdownController>,
    started_at: Instant,
}

impl DaemonLifecycle {
    pub fn new(config: DaemonConfig, shutdown: Arc<ShutdownController>) -> Self {
        Self {
            config,
            state: RwLock::new(DaemonState::Starting),
            stats: RwLock::new(DaemonStats::default()),
            shutdown,
            started_at: Instant::now(),
        }
    }
    
    pub fn config(&self) -> &DaemonConfig {
        &self.config
    }
    
    pub fn shutdown(&self) -> &Arc<ShutdownController> {
        &self.shutdown
    }
    
    /// Get current daemon state
    pub async fn state(&self) -> DaemonState {
        *self.state.read().await
    }
    
    /// Set daemon state
    pub async fn set_state(&self, new_state: DaemonState) {
        let mut state = self.state.write().await;
        if *state != new_state {
            info!("Daemon state changed: {:?} -> {:?}", *state, new_state);
            *state = new_state;
        }
    }
    
    /// Get current stats
    pub async fn stats(&self) -> DaemonStats {
        let mut stats = self.stats.read().await.clone();
        stats.uptime_secs = self.started_at.elapsed().as_secs();
        stats
    }
    
    /// Update stats (returns mutable guard)
    pub async fn update_stats<F>(&self, updater: F)
    where
        F: FnOnce(&mut DaemonStats),
    {
        let mut stats = self.stats.write().await;
        updater(&mut stats);
    }
    
    /// Record a frame capture
    pub async fn record_capture(&self) {
        let mut stats = self.stats.write().await;
        stats.frames_captured += 1;
        stats.last_capture_at = Some(Instant::now());
    }
    
    /// Record a skipped frame
    pub async fn record_skip(&self) {
        let mut stats = self.stats.write().await;
        stats.frames_skipped += 1;
    }
    
    /// Record an OCR cache hit
    pub async fn record_ocr_cache_hit(&self) {
        let mut stats = self.stats.write().await;
        stats.ocr_cache_hits += 1;
    }
    
    /// Record an OCR cache miss
    pub async fn record_ocr_cache_miss(&self) {
        let mut stats = self.stats.write().await;
        stats.ocr_cache_misses += 1;
    }
    
    /// Record an error
    pub async fn record_error(&self) {
        let mut stats = self.stats.write().await;
        stats.errors += 1;
    }
    
    /// Check if daemon should be running
    pub fn should_run(&self) -> bool {
        !self.shutdown.is_shutdown_requested()
    }
    
    /// Get the adaptive capture interval based on current system state
    pub async fn get_adaptive_interval(&self, cpu_usage: f64) -> Duration {
        // Update stats with current CPU
        {
            let mut stats = self.stats.write().await;
            stats.current_cpu_usage = cpu_usage;
        }
        
        // Check if we should pause
        if cpu_usage >= self.config.cpu_pause_threshold {
            self.set_state(DaemonState::Paused).await;
            return self.config.max_capture_interval * 2;
        }
        
        // Resume if we were paused and CPU dropped
        let current_state = self.state().await;
        if current_state == DaemonState::Paused && cpu_usage < self.config.cpu_throttle_threshold {
            self.set_state(DaemonState::Running).await;
        }
        
        self.config.adaptive_interval(cpu_usage)
    }
    
    /// Start the daemon (call once during initialization)
    pub async fn start(&self) {
        self.set_state(DaemonState::Running).await;
        info!("Daemon lifecycle started");
    }
    
    /// Initiate graceful shutdown
    pub async fn stop(&self) {
        self.set_state(DaemonState::ShuttingDown).await;
        self.shutdown.request_shutdown();
    }
    
    /// Calculate captures per minute from recent history
    pub async fn update_capture_rate(&self) {
        let stats = self.stats.read().await;
        let uptime = self.started_at.elapsed().as_secs_f64();
        if uptime > 0.0 {
            let captures_per_minute = (stats.frames_captured as f64 / uptime) * 60.0;
            drop(stats);
            
            let mut stats = self.stats.write().await;
            stats.captures_per_minute = captures_per_minute;
        }
    }
}
