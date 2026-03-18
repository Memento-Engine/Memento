//! Model directory watcher for real-time model state updates
//!
//! Watches the models directory for file changes and broadcasts state updates
//! via SSE to connected frontends. Combines:
//! - File system watcher (real-time, ~milliseconds)
//! - Periodic validation (reliability, every 30s)
//! - Runtime validation on access (safety)

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::RwLock;
use serde::Serialize;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};

use super::{embedding_model_exists, cross_encoder_model_exists};

/// Model state that can be pushed to frontend
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelStateKind {
    /// Models not downloaded
    NotDownloaded,
    /// Partial download (some models missing)
    PartialDownload,
    /// All models downloaded and verified
    Ready,
    /// Models being downloaded
    Downloading,
    /// Model files appear corrupted or invalid
    Corrupted,
}

/// Full model state with details
#[derive(Debug, Clone, Serialize)]
pub struct ModelState {
    pub status: ModelStateKind,
    pub embedding_exists: bool,
    pub cross_encoder_exists: bool,
    pub message: String,
    /// Timestamp of last state change (Unix ms)
    pub updated_at: i64,
}

impl ModelState {
    /// Check current model state from filesystem
    pub fn check_current() -> Self {
        let embedding_exists = embedding_model_exists();
        let cross_encoder_exists = cross_encoder_model_exists();
        
        let (status, message) = if embedding_exists && cross_encoder_exists {
            (ModelStateKind::Ready, "All models are ready.".to_string())
        } else if embedding_exists || cross_encoder_exists {
            (
                ModelStateKind::PartialDownload,
                "Some models are missing. Please complete the download.".to_string(),
            )
        } else {
            (
                ModelStateKind::NotDownloaded,
                "AI models need to be downloaded.".to_string(),
            )
        };
        
        ModelState {
            status,
            embedding_exists,
            cross_encoder_exists,
            message,
            updated_at: chrono::Utc::now().timestamp_millis(),
        }
    }
    
    /// Mark as downloading
    pub fn downloading() -> Self {
        ModelState {
            status: ModelStateKind::Downloading,
            embedding_exists: embedding_model_exists(),
            cross_encoder_exists: cross_encoder_model_exists(),
            message: "Downloading models...".to_string(),
            updated_at: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// Shared model state manager with broadcast capability
pub struct ModelStateManager {
    /// Current state
    state: RwLock<ModelState>,
    /// Broadcast channel for state changes
    tx: broadcast::Sender<ModelState>,
}

impl ModelStateManager {
    /// Create a new state manager
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(16);
        let initial_state = ModelState::check_current();
        
        info!("Initial model state: {:?}", initial_state.status);
        
        Arc::new(Self {
            state: RwLock::new(initial_state),
            tx,
        })
    }
    
    /// Get current state
    pub fn get_state(&self) -> ModelState {
        self.state.read().clone()
    }
    
    /// Subscribe to state changes
    pub fn subscribe(&self) -> broadcast::Receiver<ModelState> {
        self.tx.subscribe()
    }
    
    /// Update state and broadcast if changed
    pub fn update_state(&self, new_state: ModelState) {
        let mut state = self.state.write();
        
        // Only broadcast if status actually changed
        if state.status != new_state.status 
            || state.embedding_exists != new_state.embedding_exists
            || state.cross_encoder_exists != new_state.cross_encoder_exists 
        {
            info!(
                "Model state changed: {:?} -> {:?}",
                state.status, new_state.status
            );
            *state = new_state.clone();
            
            // Broadcast to all subscribers (ignore errors if no subscribers)
            let _ = self.tx.send(new_state);
        }
    }
    
    /// Refresh state from filesystem
    pub fn refresh(&self) {
        let new_state = ModelState::check_current();
        self.update_state(new_state);
    }
    
    /// Mark as downloading
    pub fn set_downloading(&self) {
        self.update_state(ModelState::downloading());
    }
}

impl Default for ModelStateManager {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(16);
        Self {
            state: RwLock::new(ModelState::check_current()),
            tx,
        }
    }
}

/// Start watching the models directory for changes
/// Returns a handle that keeps the watcher alive
pub fn start_model_watcher(
    state_manager: Arc<ModelStateManager>,
) -> Option<RecommendedWatcher> {
    let models_dir = app_core::config::models_dir();
    
    // Ensure directory exists
    if let Err(e) = std::fs::create_dir_all(&models_dir) {
        error!("Failed to create models directory {:?}: {}", models_dir, e);
        return None;
    }
    
    info!("Starting model directory watcher at {:?}", models_dir);
    
    let state_manager_clone = Arc::clone(&state_manager);
    
    // Create watcher with custom config
    let config = Config::default()
        .with_poll_interval(Duration::from_secs(2))
        .with_compare_contents(false);
    
    let mut watcher = match RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            match result {
                Ok(event) => handle_fs_event(&state_manager_clone, event),
                Err(e) => warn!("File watcher error: {:?}", e),
            }
        },
        config,
    ) {
        Ok(w) => w,
        Err(e) => {
            error!("Failed to create file watcher: {:?}", e);
            return None;
        }
    };
    
    // Watch the models directory recursively
    if let Err(e) = watcher.watch(&models_dir, RecursiveMode::Recursive) {
        error!("Failed to watch models directory: {:?}", e);
        return None;
    }
    
    info!("Model directory watcher started successfully");
    Some(watcher)
}

/// Handle filesystem events
fn handle_fs_event(state_manager: &Arc<ModelStateManager>, event: Event) {
    // We care about create, modify, remove events
    let relevant = matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    );
    
    if !relevant {
        return;
    }
    
    debug!("Model directory event: {:?}", event.kind);
    
    // Debounce by checking state after a short delay
    // This prevents rapid-fire updates during downloads
    let manager = Arc::clone(state_manager);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        manager.refresh();
    });
}

/// Start periodic validation task (runs every 30 seconds)
/// This provides reliability in case file events are missed
pub async fn start_periodic_validation(
    state_manager: Arc<ModelStateManager>,
    mut shutdown_rx: broadcast::Receiver<()>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    
    loop {
        tokio::select! {
            _ = interval.tick() => {
                debug!("Running periodic model state validation");
                state_manager.refresh();
            }
            _ = shutdown_rx.recv() => {
                info!("Periodic model validation stopped");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_model_state_check() {
        let state = ModelState::check_current();
        assert!(matches!(
            state.status,
            ModelStateKind::Ready | ModelStateKind::PartialDownload | ModelStateKind::NotDownloaded
        ));
    }
    
    #[test]
    fn test_state_manager_subscribe() {
        let manager = ModelStateManager::new();
        let _rx = manager.subscribe();
        assert!(manager.get_state().updated_at > 0);
    }
}
