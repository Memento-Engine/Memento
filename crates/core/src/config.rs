use std::{fs, path::PathBuf};


#[derive(Debug)]
pub enum SetupState {
    NotInstalled,
    Partial,
    Ready,
}

pub fn base_dir() -> PathBuf {
    // Example:
    // Windows: C:\Users\name\.personal-ai
    // Linux/Mac: ~/.personal-ai
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".personal-ai")
}


fn model_dir() -> PathBuf {
    base_dir().join("models")
}

pub fn database_dir() -> PathBuf {
    base_dir().join("search_engine.db")
}

fn config_file () -> PathBuf {
    base_dir().join("config.toml")
}


pub fn get_setup_state() -> SetupState {
    let config_exists = config_file().exists();
    let model_exists = model_dir().exists();
    let db_existes = database_dir().exists();

    if !config_exists {
        return SetupState::NotInstalled;
    }
    if config_exists && model_exists && db_existes {
        return SetupState::Ready;
    }
    return SetupState::Partial;
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

