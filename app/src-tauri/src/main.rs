// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod velopack;

fn main() { 
    // CRITICAL: Velopack must be the FIRST thing called in main()
    // Before Tauri init, before logging, before ANYTHING else
    // If this is not first, install/update hooks will NOT fire
    match velopack::init() {
        Ok(true) => {
            // Normal startup - continue to Tauri
            tauri_app_lib::run()
        }
        Ok(false) => {
            // Velopack handled things (like running hooks during install)
            // Exit cleanly without starting Tauri
        }
        Err(e) => {
            eprintln!("Velopack initialization failed: {:?}", e);
            // Continue anyway - app might still work for development
            tauri_app_lib::run()
        }
    }
}
