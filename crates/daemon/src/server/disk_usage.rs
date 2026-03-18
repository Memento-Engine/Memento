use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;
use tracing::{debug, error, info, warn};

/// Directory size calculation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectorySize {
    pub bytes: u64,
    pub formatted: String,
}

/// Disk usage for media files (captured screenshots)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaUsage {
    pub images_count: u64,
    pub images_size: DirectorySize,
}

/// Disk usage for database files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseUsage {
    pub main_db_size: DirectorySize,
    pub wal_size: DirectorySize,
    pub total_size: DirectorySize,
}

/// Disk usage for log files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogsUsage {
    pub files_count: u64,
    pub total_size: DirectorySize,
}

/// Disk usage for cache (OCR cache, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheUsage {
    pub total_size: DirectorySize,
}

/// Complete disk usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsage {
    pub media: MediaUsage,
    pub database: DatabaseUsage,
    pub logs: LogsUsage,
    pub cache: CacheUsage,
    pub total_size: DirectorySize,
    pub base_dir: String,
}

/// Result of a clear operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClearResult {
    pub success: bool,
    pub message: String,
    pub bytes_cleared: u64,
}

/// Format bytes into human-readable string
pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Calculate size of a directory recursively
pub fn directory_size(path: &PathBuf) -> io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }

    let mut size = 0u64;

    if path.is_file() {
        if let Ok(metadata) = fs::metadata(path) {
            return Ok(metadata.len());
        }
        return Ok(0);
    }

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            size += directory_size(&entry.path())?;
        } else {
            size += metadata.len();
        }
    }

    Ok(size)
}

/// Count files in a directory
pub fn count_files(path: &PathBuf) -> io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }

    let mut count = 0u64;

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            count += count_files(&entry.path())?;
        } else {
            count += 1;
        }
    }

    Ok(count)
}

/// Get the base directory for memento
pub fn get_base_dir() -> PathBuf {
    app_core::config::base_dir()
}

/// Get the memories (screenshots) directory
pub fn get_memories_dir() -> PathBuf {
    app_core::config::screenshots_dir()
}

/// Get the logs directory
pub fn get_logs_dir() -> PathBuf {
    app_core::config::logs_dir()
}

/// Get the cache directory
pub fn get_cache_dir() -> PathBuf {
    app_core::config::cache_dir()
}

/// Get comprehensive disk usage statistics
pub fn get_disk_usage() -> DiskUsage {
    let base_dir = get_base_dir();
    let memories_dir = get_memories_dir();
    let logs_dir = get_logs_dir();
    let cache_dir = get_cache_dir();

    debug!("Calculating disk usage for base_dir: {:?}", base_dir);

    // Calculate media (screenshots) size
    let images_size = directory_size(&memories_dir).unwrap_or(0);
    let images_count = count_files(&memories_dir).unwrap_or(0);
    let media = MediaUsage {
        images_count,
        images_size: DirectorySize {
            bytes: images_size,
            formatted: format_bytes(images_size),
        },
    };
    debug!("Media: {} files, {} bytes", images_count, images_size);

    // Calculate database size
    let db_path = app_core::config::database_path();
    let main_db_size = if db_path.exists() {
        fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let wal_path = db_path.with_extension("db-wal");
    let wal_size = if wal_path.exists() {
        fs::metadata(&wal_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let shm_path = db_path.with_extension("db-shm");
    let shm_size = if shm_path.exists() {
        fs::metadata(&shm_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let total_db_size = main_db_size + wal_size + shm_size;
    let database = DatabaseUsage {
        main_db_size: DirectorySize {
            bytes: main_db_size,
            formatted: format_bytes(main_db_size),
        },
        wal_size: DirectorySize {
            bytes: wal_size + shm_size,
            formatted: format_bytes(wal_size + shm_size),
        },
        total_size: DirectorySize {
            bytes: total_db_size,
            formatted: format_bytes(total_db_size),
        },
    };
    debug!("Database: {} bytes", total_db_size);

    // Calculate logs size
    let logs_size = directory_size(&logs_dir).unwrap_or(0);
    let logs_count = count_files(&logs_dir).unwrap_or(0);
    let logs = LogsUsage {
        files_count: logs_count,
        total_size: DirectorySize {
            bytes: logs_size,
            formatted: format_bytes(logs_size),
        },
    };
    debug!("Logs: {} files, {} bytes", logs_count, logs_size);

    // Calculate cache size
    let cache_size = directory_size(&cache_dir).unwrap_or(0);
    let cache = CacheUsage {
        total_size: DirectorySize {
            bytes: cache_size,
            formatted: format_bytes(cache_size),
        },
    };
    debug!("Cache: {} bytes", cache_size);

    // Calculate total
    let total = images_size + total_db_size + logs_size + cache_size;

    DiskUsage {
        media,
        database,
        logs,
        cache,
        total_size: DirectorySize {
            bytes: total,
            formatted: format_bytes(total),
        },
        base_dir: base_dir.to_string_lossy().to_string(),
    }
}

/// Clear cache directory
pub fn clear_cache() -> ClearResult {
    let cache_dir = get_cache_dir();
    
    if !cache_dir.exists() {
        return ClearResult {
            success: true,
            message: "Cache directory does not exist".to_string(),
            bytes_cleared: 0,
        };
    }

    let size_before = directory_size(&cache_dir).unwrap_or(0);
    
    match fs::remove_dir_all(&cache_dir) {
        Ok(_) => {
            // Recreate the directory
            let _ = fs::create_dir_all(&cache_dir);
            info!("Cleared cache: {} bytes", size_before);
            ClearResult {
                success: true,
                message: format!("Cleared {} of cache", format_bytes(size_before)),
                bytes_cleared: size_before,
            }
        }
        Err(e) => {
            error!("Failed to clear cache: {}", e);
            ClearResult {
                success: false,
                message: format!("Failed to clear cache: {}", e),
                bytes_cleared: 0,
            }
        }
    }
}

/// Clear log files (keeps the directory structure)
pub fn clear_logs() -> ClearResult {
    let logs_dir = get_logs_dir();
    
    if !logs_dir.exists() {
        return ClearResult {
            success: true,
            message: "Logs directory does not exist".to_string(),
            bytes_cleared: 0,
        };
    }

    let mut cleared = 0u64;
    let mut errors = Vec::new();

    // Delete all files in logs directory
    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(metadata) = fs::metadata(&path) {
                    let file_size = metadata.len();
                    if let Err(e) = fs::remove_file(&path) {
                        errors.push(format!("{}: {}", path.display(), e));
                    } else {
                        cleared += file_size;
                    }
                }
            }
        }
    }

    if errors.is_empty() {
        info!("Cleared logs: {} bytes", cleared);
        ClearResult {
            success: true,
            message: format!("Cleared {} of logs", format_bytes(cleared)),
            bytes_cleared: cleared,
        }
    } else {
        warn!("Partially cleared logs: {} bytes, {} errors", cleared, errors.len());
        ClearResult {
            success: false,
            message: format!("Partially cleared {} of logs. Errors: {}", format_bytes(cleared), errors.join(", ")),
            bytes_cleared: cleared,
        }
    }
}

/// Clear media (screenshots) directory
pub fn clear_media() -> ClearResult {
    let memories_dir = get_memories_dir();
    
    if !memories_dir.exists() {
        return ClearResult {
            success: true,
            message: "Media directory does not exist".to_string(),
            bytes_cleared: 0,
        };
    }

    let size_before = directory_size(&memories_dir).unwrap_or(0);
    
    match fs::remove_dir_all(&memories_dir) {
        Ok(_) => {
            // Recreate the directory
            let _ = fs::create_dir_all(&memories_dir);
            info!("Cleared media: {} bytes", size_before);
            ClearResult {
                success: true,
                message: format!("Cleared {} of media", format_bytes(size_before)),
                bytes_cleared: size_before,
            }
        }
        Err(e) => {
            error!("Failed to clear media: {}", e);
            ClearResult {
                success: false,
                message: format!("Failed to clear media: {}", e),
                bytes_cleared: 0,
            }
        }
    }
}

/// Clear database files (should only be called when daemon is paused)
pub fn clear_database() -> ClearResult {
    let db_path = app_core::config::database_path();
    
    if !db_path.exists() {
        return ClearResult {
            success: true,
            message: "Database does not exist".to_string(),
            bytes_cleared: 0,
        };
    }

    let mut total_cleared = 0u64;
    let mut errors = Vec::new();

    // Delete main database and associated files
    for ext in ["", "-wal", "-shm", "-journal"] {
        let file_path = if ext.is_empty() {
            db_path.clone()
        } else {
            let mut path = db_path.clone();
            let new_name = format!("{}{}", db_path.file_name().unwrap().to_string_lossy(), ext);
            path.set_file_name(new_name);
            path
        };

        if file_path.exists() {
            if let Ok(metadata) = fs::metadata(&file_path) {
                let file_size = metadata.len();
                if let Err(e) = fs::remove_file(&file_path) {
                    errors.push(format!("{}: {}", file_path.display(), e));
                } else {
                    total_cleared += file_size;
                    debug!("Deleted database file: {:?} ({} bytes)", file_path, file_size);
                }
            }
        }
    }

    if errors.is_empty() {
        info!("Cleared database: {} bytes", total_cleared);
        ClearResult {
            success: true,
            message: format!("Cleared {} of database", format_bytes(total_cleared)),
            bytes_cleared: total_cleared,
        }
    } else {
        error!("Failed to fully clear database: {:?}", errors);
        ClearResult {
            success: false,
            message: format!("Failed to clear database: {}", errors.join(", ")),
            bytes_cleared: total_cleared,
        }
    }
}

/// Clear everything (cache, logs, media, database)
pub fn clear_all() -> ClearResult {
    let mut total_cleared = 0u64;
    let mut messages = Vec::new();
    let mut success = true;

    // Clear in order: cache, logs, media, database
    let cache_result = clear_cache();
    total_cleared += cache_result.bytes_cleared;
    if !cache_result.success {
        success = false;
    }
    messages.push(format!("Cache: {}", cache_result.message));

    let logs_result = clear_logs();
    total_cleared += logs_result.bytes_cleared;
    if !logs_result.success {
        success = false;
    }
    messages.push(format!("Logs: {}", logs_result.message));

    let media_result = clear_media();
    total_cleared += media_result.bytes_cleared;
    if !media_result.success {
        success = false;
    }
    messages.push(format!("Media: {}", media_result.message));

    let db_result = clear_database();
    total_cleared += db_result.bytes_cleared;
    if !db_result.success {
        success = false;
    }
    messages.push(format!("Database: {}", db_result.message));

    ClearResult {
        success,
        message: format!("Cleared {} total. {}", format_bytes(total_cleared), messages.join("; ")),
        bytes_cleared: total_cleared,
    }
}
