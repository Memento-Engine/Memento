use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::broadcast;
use tracing::{info, warn};

/// Controls graceful shutdown of the daemon
#[derive(Clone)]
pub struct ShutdownController {
    /// Whether shutdown has been requested
    shutdown_requested: Arc<AtomicBool>,
    /// Broadcast channel for shutdown notification
    shutdown_tx: broadcast::Sender<()>,
}

impl ShutdownController {
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            shutdown_requested: Arc::new(AtomicBool::new(false)),
            shutdown_tx,
        }
    }
    
    /// Check if shutdown has been requested
    pub fn is_shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }
    
    /// Request shutdown
    pub fn request_shutdown(&self) {
        if !self.shutdown_requested.swap(true, Ordering::SeqCst) {
            info!("Shutdown requested, notifying all tasks...");
            let _ = self.shutdown_tx.send(());
        }
    }
    
    /// Get the shutdown sender (for tray and other components that need to trigger shutdown)
    pub fn shutdown_sender(&self) -> broadcast::Sender<()> {
        self.shutdown_tx.clone()
    }
    
    /// Get a receiver for shutdown notification
    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }
    
    /// Wait for shutdown signal
    pub async fn wait_for_shutdown(&self) {
        let mut rx = self.subscribe();
        // Ignore recv errors (sender dropped means shutdown is happening anyway)
        let _ = rx.recv().await;
    }
    
    /// Setup signal handlers for graceful shutdown
    pub fn setup_signal_handlers(self: Arc<Self>) {
        let controller = self.clone();
        
        // Handle Ctrl+C
        tokio::spawn(async move {
            match tokio::signal::ctrl_c().await {
                Ok(()) => {
                    info!("Received Ctrl+C, initiating graceful shutdown...");
                    controller.request_shutdown();
                }
                Err(e) => {
                    warn!("Failed to listen for Ctrl+C: {}", e);
                }
            }
        });
        
        // On Windows, also handle Console close events
        #[cfg(windows)]
        {
            let controller = self.clone();
            tokio::spawn(async move {
                use tokio::signal::windows;
                let mut ctrl_break = windows::ctrl_break()
                    .expect("Failed to register ctrl-break handler");
                ctrl_break.recv().await;
                info!("Received Ctrl+Break, initiating graceful shutdown...");
                controller.request_shutdown();
            });
        }
        
        // On Unix, handle SIGTERM
        #[cfg(unix)]
        {
            use tokio::signal::unix::{signal, SignalKind};
            let controller = self.clone();
            tokio::spawn(async move {
                let mut sigterm = signal(SignalKind::terminate())
                    .expect("Failed to register SIGTERM handler");
                sigterm.recv().await;
                info!("Received SIGTERM, initiating graceful shutdown...");
                controller.request_shutdown();
            });
        }
    }
}

impl Default for ShutdownController {
    fn default() -> Self {
        Self::new()
    }
}
