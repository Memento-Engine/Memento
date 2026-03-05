use chrono;
use serde::{ Deserialize, Serialize };
use serde_json;
use std::fs;
use std::io;
use std::path::{ Path, PathBuf };
use sysinfo::{ DiskExt, System, SystemExt };
use tracing::{ info };

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsage {
    pub media: DiskUsedByMedia,
    pub other: DiskUsedByOther,
    pub total_data_size: String,
    pub total_cache_size: String,
    pub available_space: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsedByMedia {
    pub images_size: String,
    pub total_media_size: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsedByOther {
    pub database_size: String,
    pub logs_size: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedDiskUsage {
    pub timestamp: i64,
    pub usage: DiskUsage,
}

pub fn get_cache_dir() -> Result<Option<PathBuf>, String> {
    let proj_dirs = dirs::cache_dir().ok_or_else(|| "failed to get cache dir".to_string())?;
    Ok(Some(proj_dirs.join("memento")))
}

pub fn directory_size(path: &PathBuf) -> io::Result<Option<u64>> {
    if !path.exists() {
        return Ok(None);
    }
    let mut size = 0;

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            size += directory_size(&entry.path())?.unwrap_or(0);
        } else {
            size += metadata.len();
        }
    }

    Ok(Some(size))
}

pub fn get_disk_usage() {
    // Get the dir
    let memento_dir = dirs::home_dir().expect("Failed to get the home dir");
    memento_dir.join(".memento");

    // Calculate database size (db.sqlite and related files)
    info!("Calculating database size");
    let mut database_size: u64 = 0;
    for file_name in ["search_engine.sqlite", "search_engine.sqlite-wal", "search_engine.sqlite-shm"] {
        let db_path = memento_dir.join(file_name);
        if db_path.exists() {
            if let Ok(metadata) = fs::metadata(&db_path) {
                database_size += metadata.len();
            }
        }
    }
    info!("Database size: {} bytes", database_size);
}
