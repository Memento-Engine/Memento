// Core daemon functionality - lifecycle, shutdown, configuration
pub mod lifecycle;
pub mod shutdown;
pub mod config;
pub mod priority;

pub use lifecycle::DaemonLifecycle;
pub use shutdown::ShutdownController;
pub use config::DaemonConfig;
pub use priority::set_process_priority;
