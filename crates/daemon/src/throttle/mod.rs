// CPU-aware throttling system for background daemon operation
pub mod cpu_monitor;
pub mod adaptive_scheduler;

pub use cpu_monitor::CpuMonitor;
pub use adaptive_scheduler::{AdaptiveScheduler, ScheduleReason, ScheduleParams};
