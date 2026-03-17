//! Enhanced logging module with colors, timestamps, and latency tracking.
//!
//! Features:
//! - Colored console output (info=green, warn=yellow, error=red, debug=blue)
//! - Timestamps in both console and file output
//! - Latency tracking with `#[instrument]` and span timing
//! - Dual output: console (with colors) + file (without colors)
//! - Slow operation warnings

use std::time::Duration;
use tracing::Level;
use tracing_subscriber::{
    fmt::{self, format::FmtSpan, time::ChronoLocal},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer,
};

/// Configuration for the logging system
pub struct LogConfig {
    /// Log level for console output
    pub console_level: Level,
    /// Log level for file output  
    pub file_level: Level,
    /// Directory for log files
    pub log_dir: String,
    /// Log file prefix
    pub log_prefix: String,
    /// Enable colored console output
    pub colors: bool,
    /// Enable timestamps
    pub timestamps: bool,
    /// Threshold for "slow operation" warnings (in milliseconds)
    pub slow_threshold_ms: u64,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            console_level: Level::INFO,
            file_level: Level::DEBUG,
            log_dir: "logs".to_string(),
            log_prefix: "daemon.log".to_string(),
            colors: true,
            timestamps: true,
            slow_threshold_ms: 500,
        }
    }
}

/// Initialize the logging system with enhanced features
pub fn init_logging(config: LogConfig) -> anyhow::Result<()> {
    // File appender - daily rotation
    let file_appender = tracing_appender::rolling::daily(&config.log_dir, &config.log_prefix);

    // Environment filter for file (defaults to debug)
    let file_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(config.file_level.as_str()));

    // File layer - no colors, with timestamps and span events
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_timer(ChronoLocal::new("%Y-%m-%d %H:%M:%S%.3f".to_string()))
        .with_thread_ids(true)
        .with_target(true)
        .with_span_events(FmtSpan::CLOSE) // Log when spans close (shows duration)
        .with_filter(file_filter);

    // Console filter
    let console_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(config.console_level.as_str()));

    // Console layer - with colors and timestamps
    let console_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_ansi(config.colors)
        .with_timer(ChronoLocal::new("%H:%M:%S%.3f".to_string()))
        .with_target(false) // Cleaner console output
        .with_level(true)
        .with_filter(console_filter);

    // Build the subscriber with both layers
    tracing_subscriber::registry()
        .with(file_layer)
        .with(console_layer)
        .init();

    Ok(())
}

/// Initialize logging with default configuration
pub fn init_default_logging() -> anyhow::Result<()> {
    init_logging(LogConfig::default())
}

/// A guard that logs the elapsed time when dropped
pub struct LatencyGuard {
    operation: String,
    start: std::time::Instant,
    threshold: Duration,
}

impl LatencyGuard {
    /// Create a new latency guard for an operation
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            operation: operation.into(),
            start: std::time::Instant::now(),
            threshold: Duration::from_millis(500),
        }
    }

    /// Create a latency guard with a custom slow threshold
    pub fn with_threshold(operation: impl Into<String>, threshold_ms: u64) -> Self {
        Self {
            operation: operation.into(),
            start: std::time::Instant::now(),
            threshold: Duration::from_millis(threshold_ms),
        }
    }

    /// Get the elapsed time so far
    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }
}

impl Drop for LatencyGuard {
    fn drop(&mut self) {
        let elapsed = self.start.elapsed();
        if elapsed >= self.threshold {
            tracing::warn!(
                operation = %self.operation,
                latency_ms = elapsed.as_millis(),
                "⚠️  SLOW operation completed"
            );
        } else {
            tracing::debug!(
                operation = %self.operation,
                latency_ms = elapsed.as_millis(),
                "✓ Operation completed"
            );
        }
    }
}

/// Macro for timing a block of code
#[macro_export]
macro_rules! timed {
    ($name:expr, $block:expr) => {{
        let _guard = $crate::logging::LatencyGuard::new($name);
        $block
    }};
}

/// Macro for timing with custom threshold
#[macro_export]
macro_rules! timed_threshold {
    ($name:expr, $threshold_ms:expr, $block:expr) => {{
        let _guard = $crate::logging::LatencyGuard::with_threshold($name, $threshold_ms);
        $block
    }};
}

// Re-export tracing macros with our enhanced style
pub use tracing::{debug, error, info, trace, warn};

/// Log a separator line for visual clarity
pub fn log_separator(label: &str) {
    tracing::info!("━━━━━━━━━━━━━━━━━━━━━━━━ {} ━━━━━━━━━━━━━━━━━━━━━━━━", label);
}

/// Log daemon startup banner
pub fn log_startup_banner(version: &str) {
    tracing::info!("╔══════════════════════════════════════════════════════╗");
    tracing::info!("║           MEMENTO DAEMON v{}                     ║", version);
    tracing::info!("║        Screen Capture & OCR Background Service       ║");
    tracing::info!("╚══════════════════════════════════════════════════════╝");
}

/// Log a phase transition
pub fn log_phase(phase: &str) {
    tracing::info!("▶ Phase: {}", phase);
}

/// Log statistics in a structured way
pub fn log_stats(category: &str, items: &[(&str, impl std::fmt::Display)]) {
    tracing::info!("📊 {} Statistics:", category);
    for (name, value) in items {
        tracing::info!("   • {}: {}", name, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_latency_guard() {
        let guard = LatencyGuard::new("test_operation");
        std::thread::sleep(Duration::from_millis(10));
        assert!(guard.elapsed() >= Duration::from_millis(10));
    }
}
