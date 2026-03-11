use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, warn};

use super::CpuMonitor;
use crate::core::{DaemonConfig, priority::is_on_battery};

/// Reason for the current scheduling decision
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleReason {
    Normal,
    HighCpu,
    VeryHighCpu,
    LowCpu,
    UserIdle,
    OnBattery,
    MemoryPressure,
}

/// Current scheduling parameters
#[derive(Debug, Clone)]
pub struct ScheduleParams {
    pub interval: Duration,
    pub reason: ScheduleReason,
    pub should_capture: bool,
    pub cpu_usage: f64,
    pub memory_usage: f64,
}

/// Adaptive scheduler that adjusts capture rate based on system conditions
pub struct AdaptiveScheduler {
    config: DaemonConfig,
    cpu_monitor: CpuMonitor,
    state: Arc<RwLock<SchedulerState>>,
}

struct SchedulerState {
    last_user_activity: Instant,
    current_interval: Duration,
    consecutive_high_cpu: u32,
    consecutive_low_cpu: u32,
}

impl AdaptiveScheduler {
    pub fn new(config: DaemonConfig) -> Self {
        let base_interval = config.base_capture_interval;
        
        Self {
            config,
            cpu_monitor: CpuMonitor::new(),
            state: Arc::new(RwLock::new(SchedulerState {
                last_user_activity: Instant::now(),
                current_interval: base_interval,
                consecutive_high_cpu: 0,
                consecutive_low_cpu: 0,
            })),
        }
    }
    
    /// Record user activity (mouse move, key press, etc.)
    pub async fn record_user_activity(&self) {
        let mut state = self.state.write().await;
        state.last_user_activity = Instant::now();
    }
    
    /// Get the next capture parameters based on current system state
    pub async fn get_schedule_params(&self) -> ScheduleParams {
        let cpu_usage = self.cpu_monitor.get_cpu_usage().await;
        let memory_usage = self.cpu_monitor.get_memory_usage().await;
        
        let mut state = self.state.write().await;
        let idle_time = state.last_user_activity.elapsed();
        
        // Determine scheduling reason and parameters
        let (interval, reason, should_capture) = self.calculate_schedule(
            cpu_usage,
            memory_usage,
            idle_time,
            &mut state,
        );
        
        state.current_interval = interval;
        
        ScheduleParams {
            interval,
            reason,
            should_capture,
            cpu_usage,
            memory_usage,
        }
    }
    
    fn calculate_schedule(
        &self,
        cpu_usage: f64,
        memory_usage: f64,
        idle_time: Duration,
        state: &mut SchedulerState,
    ) -> (Duration, ScheduleReason, bool) {
        // Check battery status
        if self.config.pause_on_battery && is_on_battery() {
            debug!("On battery - reducing capture frequency");
            return (
                self.config.max_capture_interval * 2,
                ScheduleReason::OnBattery,
                true, // Still capture, just slower
            );
        }
        
        // Check memory pressure
        if memory_usage > self.config.memory_pressure_threshold {
            warn!("Memory pressure detected ({:.1}%) - reducing activity", memory_usage * 100.0);
            return (
                self.config.max_capture_interval,
                ScheduleReason::MemoryPressure,
                true,
            );
        }
        
        // Check for very high CPU
        if cpu_usage >= self.config.cpu_pause_threshold {
            state.consecutive_high_cpu += 1;
            state.consecutive_low_cpu = 0;
            
            if state.consecutive_high_cpu >= 3 {
                // Sustained high CPU, pause capturing
                debug!("Very high CPU ({:.1}%) - pausing capture", cpu_usage * 100.0);
                return (
                    self.config.max_capture_interval * 3,
                    ScheduleReason::VeryHighCpu,
                    false, // Don't capture
                );
            }
        }
        
        // Check for high CPU
        if cpu_usage >= self.config.cpu_throttle_threshold {
            state.consecutive_high_cpu = state.consecutive_high_cpu.saturating_add(1);
            state.consecutive_low_cpu = 0;
            
            // Smoothly scale interval based on CPU usage
            let throttle_ratio = (cpu_usage - self.config.cpu_throttle_threshold) 
                / (self.config.cpu_pause_threshold - self.config.cpu_throttle_threshold);
            let base_ms = self.config.base_capture_interval.as_millis() as f64;
            let max_ms = self.config.max_capture_interval.as_millis() as f64;
            let scaled_ms = base_ms + (max_ms - base_ms) * throttle_ratio;
            
            debug!("High CPU ({:.1}%) - throttling to {}ms", cpu_usage * 100.0, scaled_ms);
            return (
                Duration::from_millis(scaled_ms as u64),
                ScheduleReason::HighCpu,
                true,
            );
        }
        
        // Reset high CPU counter when CPU drops
        if cpu_usage < self.config.cpu_throttle_threshold * 0.8 {
            state.consecutive_high_cpu = 0;
            state.consecutive_low_cpu = state.consecutive_low_cpu.saturating_add(1);
        }
        
        // Check for user idle
        let idle_threshold = Duration::from_secs(self.config.idle_detection_threshold_secs);
        if idle_time > idle_threshold {
            debug!("User idle for {:?} - reducing capture frequency", idle_time);
            return (
                self.config.max_capture_interval,
                ScheduleReason::UserIdle,
                true, // Still capture, screens might update from notifications
            );
        }
        
        // Low CPU - can capture faster
        if cpu_usage < 0.3 && state.consecutive_low_cpu >= 3 {
            return (
                self.config.min_capture_interval,
                ScheduleReason::LowCpu,
                true,
            );
        }
        
        // Normal operation
        (
            self.config.base_capture_interval,
            ScheduleReason::Normal,
            true,
        )
    }
    
    /// Get the current capture interval
    pub async fn current_interval(&self) -> Duration {
        let state = self.state.read().await;
        state.current_interval
    }
    
    /// Get access to the CPU monitor for stats
    pub fn cpu_monitor(&self) -> &CpuMonitor {
        &self.cpu_monitor
    }
}

impl Clone for AdaptiveScheduler {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            cpu_monitor: self.cpu_monitor.clone(),
            state: Arc::clone(&self.state),
        }
    }
}
