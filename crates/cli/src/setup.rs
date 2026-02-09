use app_core::config::{ database_dir, mark_initialized };
use std::{ fs, process::Command };

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::ui;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn install_ollama() -> Result<(), String> {
    let spinner = ui::create_spinner("Download engine for Brain... ");

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("powershell");
        c.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "iwr https://ollama.com/install.ps1 -UseBasicParsing | iex",
        ]);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-c", "curl -fsSL https://ollama.com/install.sh | sh"]);
        c
    };

    let status = cmd.status().map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("Installation failed".into());
    }

    spinner.finish_with_message("Brain model ready.");
    Ok(())
}

fn download_model() -> Result<(), String> {
    let spinner = ui::create_spinner("Download brain (AI model)... ");

    let status = Command::new("ollama")
        .args(["pull", "phi3"])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("Model download failed".into());
    }

    spinner.finish_with_message("Brain model ready.");
    Ok(())
}

fn setup_database() -> Result<(), String> {
    let spinner = ui::create_spinner("Setting up the database");

    let db = database_dir();

    if db.exists() {
        println!("Database already exists");
        return Ok(());
    }

    app_core::db::init_pool(db.to_str().unwrap()).map_err(|e| e.to_string())?;
    
    fs::File::create(db).map_err(|e| e.to_string())?;

    println!("Database Created");
    spinner.finish_with_message("Brain model ready.");
    Ok(())
}

pub fn run_setup() {
    let spinner = ui::create_spinner("Starting the setup");
    install_ollama().expect("Failed to install Ollama");

    download_model().expect("Failed to download model");

    setup_database().expect("Failed to setup database");

    mark_initialized();

    spinner.finish_with_message("Setup Complete.");
}
