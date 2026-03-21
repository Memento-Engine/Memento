use std::{fs, path::PathBuf};

// =============================================================================
// Port Configuration
// =============================================================================

/// Preferred daemon port - daemon will try this first
pub const PREFERRED_DAEMON_PORT: u16 = 7070;

/// Port range for daemon if preferred port is unavailable
pub const DAEMON_PORT_RANGE_START: u16 = 7070;
pub const DAEMON_PORT_RANGE_END: u16 = 7077;

/// Logging mode - only one should be active at runtime
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogMode {
    Dev,
    Production,
}

impl LogMode {
    /// Get the current log mode based on build configuration
    pub fn current() -> Self {
        if cfg!(debug_assertions) {
            LogMode::Dev
        } else {
            LogMode::Production
        }
    }
    
    /// Get the folder name for this log mode
    pub fn folder_name(&self) -> &'static str {
        match self {
            LogMode::Dev => "dev",
            LogMode::Production => "production",
        }
    }
}

#[derive(Debug)]
pub enum SetupState {
    NotInstalled,
    Partial,
    Ready,
}

// =============================================================================
// Base Directory
// =============================================================================

/// Root directory for all memento user data
/// Windows: C:\Users\<Username>\AppData\Local\memento\
/// Linux/Mac: ~/.local/share/memento/
pub fn base_dir() -> PathBuf {
    dirs::data_local_dir()
        .expect("Cannot find local data directory")
        .join("memento")
}

/// Shared directory accessible by all users and services
/// Used for cross-process communication (ports, locks) AND shared data (models, db)
/// Windows: C:\ProgramData\memento\ (both dev and production)
/// Linux/Mac: /var/lib/memento/ (production) or ~/.local/share/memento/ (dev)
/// 
/// On Windows, always uses ProgramData so that:
/// - Windows Service (SYSTEM account) can access data
/// - User app can access the same data
/// - Models downloaded by user are available to service
pub fn shared_dir() -> PathBuf {
    #[cfg(windows)]
    {
        // Windows: Always use ProgramData for shared data (both dev and production)
        // This ensures Windows Service and user apps access the same data
        if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
            PathBuf::from(program_data).join("memento")
        } else {
            PathBuf::from(r"C:\ProgramData").join("memento")
        }
    }
    #[cfg(not(windows))]
    {
        if cfg!(debug_assertions) {
            // Dev mode on non-Windows: use user-local directory
            base_dir()
        } else {
            // Production mode on non-Windows: use system-wide directory
            PathBuf::from("/var/lib/memento")
        }
    }
}

// =============================================================================
// Data Directories
// =============================================================================

/// data/ - root for all data storage (in shared directory for service access)
pub fn data_dir() -> PathBuf {
    shared_dir().join("data")
}

/// data/db/ - structured database storage
pub fn database_dir() -> PathBuf {
    data_dir().join("db")
}

/// data/db/memento.db - main database file
pub fn database_path() -> PathBuf {
    database_dir().join("memento.db")
}

/// data/memories/ - user captured data
pub fn memories_dir() -> PathBuf {
    data_dir().join("memories")
}

/// data/memories/screenshots/ - captured screenshots
pub fn screenshots_dir() -> PathBuf {
    memories_dir().join("screenshots")
}

/// data/memories/metadata/ - JSON, embeddings, indexing info
pub fn metadata_dir() -> PathBuf {
    memories_dir().join("metadata")
}

/// data/models/ - ML/ONNX models
pub fn models_dir() -> PathBuf {
    data_dir().join("models")
}

/// data/cache/ - temporary data, safe to delete
pub fn cache_dir() -> PathBuf {
    data_dir().join("cache")
}

// =============================================================================
// Logging (in shared directory for service access)
// =============================================================================

/// logs/ - root for all logs (in shared directory)
pub fn logs_dir() -> PathBuf {
    shared_dir().join("logs")
}

/// logs/dev/ or logs/production/ - based on current mode
pub fn current_logs_dir() -> PathBuf {
    logs_dir().join(LogMode::current().folder_name())
}

/// Get log file path with mandatory memento- prefix
/// e.g., memento-daemon.log, memento-tauri.log
pub fn log_file_path(service_name: &str) -> PathBuf {
    current_logs_dir().join(format!("memento-{}.log", service_name))
}

// =============================================================================
// Ports (in shared directory for cross-process access)
// =============================================================================

/// ports/ - directory for port files (in shared directory)
pub fn ports_dir() -> PathBuf {
    shared_dir().join("ports")
}

/// Get port file path with mandatory memento- prefix
/// e.g., memento-daemon.port, memento-tauri.port
pub fn port_file_path(service_name: &str) -> PathBuf {
    ports_dir().join(format!("memento-{}.port", service_name))
}

// =============================================================================
// Runtime (in shared directory for cross-process access)
// =============================================================================

/// runtime/ - runtime state files (in shared directory)
pub fn runtime_dir() -> PathBuf {
    shared_dir().join("runtime")
}

/// Lock file for single instance enforcement
pub fn lock_file_path(service_name: &str) -> PathBuf {
    runtime_dir().join(format!("memento-{}.lock", service_name))
}

// =============================================================================
// Config (in shared directory for service access)
// =============================================================================

fn config_file() -> PathBuf {
    shared_dir().join("config.toml")
}

// =============================================================================
// Setup State
// =============================================================================

pub fn get_setup_state() -> SetupState {
    let config_exists = config_file().exists();
    let model_exists = models_dir().exists();
    let db_exists = database_path().exists();

    if !config_exists {
        return SetupState::NotInstalled;
    }
    if config_exists && model_exists && db_exists {
        return SetupState::Ready;
    }
    SetupState::Partial
}

/// Initialize all required directories
pub fn initialize_directories() -> std::io::Result<()> {
    // User data directories
    fs::create_dir_all(database_dir())?;
    fs::create_dir_all(screenshots_dir())?;
    fs::create_dir_all(metadata_dir())?;
    fs::create_dir_all(models_dir())?;
    fs::create_dir_all(cache_dir())?;
    fs::create_dir_all(current_logs_dir())?;
    // Shared directories (ports/runtime) - may fail in production if not pre-created by installer
    let _ = fs::create_dir_all(ports_dir());
    let _ = fs::create_dir_all(runtime_dir());
    Ok(())
}

/// Initialize shared directories (ports, runtime)
/// Should be called by installer with admin privileges in production
pub fn initialize_shared_directories() -> std::io::Result<()> {
    fs::create_dir_all(shared_dir())?;
    fs::create_dir_all(ports_dir())?;
    fs::create_dir_all(runtime_dir())?;
    Ok(())
}

pub fn mark_initialized() {
    let path = config_file();
    match path.parent() {
        Some(parent) => {
            fs::create_dir_all(parent).expect("Failed to create base directory");
        }
        None => {
            println!("{}", "Failed to Create the folder");
        }
    }
}

