use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{CpuRefreshKind, RefreshKind, System};
use tokio::sync::RwLock;
use tracing::trace;

/// Number of samples to keep for smoothing CPU readings
const CPU_SAMPLE_WINDOW: usize = 10;

/// Minimum interval between CPU refreshes (sysinfo recommends 200ms+)
const MIN_REFRESH_INTERVAL: Duration = Duration::from_millis(500);

/// Monitors system CPU usage for adaptive throttling
pub struct CpuMonitor {
    inner: Arc<RwLock<CpuMonitorInner>>,
}

struct CpuMonitorInner {
    system: System,
    samples: VecDeque<f64>,
    last_refresh: Instant,
    cached_usage: f64,
}

impl CpuMonitor {
    pub fn new() -> Self {
        let system = System::new_with_specifics(
            RefreshKind::nothing().with_cpu(CpuRefreshKind::everything())
        );
        
        Self {
            inner: Arc::new(RwLock::new(CpuMonitorInner {
                system,
                samples: VecDeque::with_capacity(CPU_SAMPLE_WINDOW),
                last_refresh: Instant::now() - MIN_REFRESH_INTERVAL * 2,
                cached_usage: 0.0,
            })),
        }
    }
    
    /// Get the current smoothed CPU usage (0.0 - 1.0)
    /// Uses exponential moving average for stability
    pub async fn get_cpu_usage(&self) -> f64 {
        let mut inner = self.inner.write().await;
        
        // Respect minimum refresh interval to avoid sysinfo issues
        if inner.last_refresh.elapsed() < MIN_REFRESH_INTERVAL {
            return inner.cached_usage;
        }
        
        // Refresh CPU info
        inner.system.refresh_cpu_usage();
        inner.last_refresh = Instant::now();
        
        // Calculate average across all CPU cores
        let total_usage: f32 = inner.system.cpus().iter().map(|cpu| cpu.cpu_usage()).sum();
        let cpu_count = inner.system.cpus().len() as f32;
        let current_usage = (total_usage / cpu_count / 100.0) as f64;
        
        // Add to rolling window
        inner.samples.push_back(current_usage);
        if inner.samples.len() > CPU_SAMPLE_WINDOW {
            inner.samples.pop_front();
        }
        
        // Calculate smoothed average
        let smoothed = if inner.samples.is_empty() {
            current_usage
        } else {
            inner.samples.iter().sum::<f64>() / inner.samples.len() as f64
        };
        
        inner.cached_usage = smoothed;
        
        trace!("CPU usage: current={:.1}%, smoothed={:.1}%", 
               current_usage * 100.0, smoothed * 100.0);
        
        smoothed
    }
    
    /// Get memory usage as a fraction (0.0 - 1.0)
    pub async fn get_memory_usage(&self) -> f64 {
        let inner = self.inner.read().await;
        let used = inner.system.used_memory() as f64;
        let total = inner.system.total_memory() as f64;
        
        if total > 0.0 {
            used / total
        } else {
            0.0
        }
    }
    
    /// Check if system is under high load (CPU > threshold)
    pub async fn is_high_load(&self, threshold: f64) -> bool {
        self.get_cpu_usage().await > threshold
    }
    
    /// Check if there's memory pressure
    pub async fn is_memory_pressure(&self, threshold: f64) -> bool {
        self.get_memory_usage().await > threshold
    }
    
    /// Get daemon's own CPU usage (approximate)
    pub async fn get_self_cpu_usage(&self) -> f64 {
        let inner = self.inner.read().await;
        
        // Get current process
        let _pid = sysinfo::get_current_pid().ok();
        
        // Note: For accurate per-process CPU, would need to refresh processes
        // which is expensive. For now, return overall CPU as approximation
        // A more accurate implementation would track this process specifically
        inner.cached_usage * 0.1  // Assume daemon uses ~10% of total CPU as baseline
    }
}

impl Default for CpuMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for CpuMonitor {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_cpu_monitor_basic() {
        let monitor = CpuMonitor::new();
        
        // Allow system to initialize
        tokio::time::sleep(Duration::from_millis(600)).await;
        
        let usage = monitor.get_cpu_usage().await;
        assert!(usage >= 0.0 && usage <= 1.0, "CPU usage should be between 0 and 1");
    }
    
    #[tokio::test]
    async fn test_memory_usage() {
        let monitor = CpuMonitor::new();
        let usage = monitor.get_memory_usage().await;
        assert!(usage > 0.0 && usage <= 1.0, "Memory usage should be > 0 and <= 1");
    }
}
