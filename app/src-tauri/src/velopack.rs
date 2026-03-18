// Velopack integration for Memento AI
// Handles auto-updates, installation hooks, and service lifecycle

use std::process::Command;
use std::path::PathBuf;
use std::time::Duration;
use std::thread;
use tracing::{info, warn, error, debug};

// Import build_info from the library crate
use tauri_app_lib::build_info;

/// Service helper executable name
const SERVICE_HELPER_NAME: &str = "service-helper.exe";

/// Daemon executable name
const DAEMON_NAME: &str = "memento-daemon.exe";

/// Service name for queries
const SERVICE_NAME: &str = "SearchEngineDaemon";

/// Initialize Velopack - MUST be called first in main()
/// Returns Ok(true) if app should continue, Ok(false) if Velopack handled things
pub fn init() -> Result<bool, velopack::Error> {
    velopack::VelopackApp::build()
        .on_after_install_fast_callback(|_| {
            // Called immediately after first install
            on_after_install();
        })
        .on_before_uninstall_fast_callback(|_| {
            // Called before uninstall starts
            on_before_uninstall();
        })
        .on_after_update_fast_callback(|_| {
            // Called after update is applied
            on_after_update();
        })
        .run();
    
    // If we get here, the app should continue normally
    Ok(true)
}

/// Get the path to the service helper executable
fn get_helper_path() -> PathBuf {
    let current_exe = std::env::current_exe().expect("Failed to get current exe path");
    current_exe.parent().unwrap().join(SERVICE_HELPER_NAME)
}

/// Get the path to the daemon executable
fn get_daemon_path() -> PathBuf {
    let current_exe = std::env::current_exe().expect("Failed to get current exe path");
    current_exe.parent().unwrap().join(DAEMON_NAME)
}

/// Called after first install - installs service with proper permissions
fn on_after_install() {
    info!("Velopack: Running post-install hook");
    
    let helper_path = get_helper_path();
    let daemon_path = get_daemon_path();
    
    if !helper_path.exists() {
        let msg = format!("service-helper.exe not found at {:?}", helper_path);
        warn!("{}", msg);
        sentry::capture_message(&msg, sentry::Level::Warning);
        return;
    }
    
    if !daemon_path.exists() {
        let msg = format!("memento-daemon.exe not found at {:?}", daemon_path);
        warn!("{}", msg);
        sentry::capture_message(&msg, sentry::Level::Warning);
        return;
    }
    
    debug!("Running service helper: {:?}", helper_path);
    
    // Run the helper with install command
    // This will trigger UAC prompt (once, at first install only)
    let result = Command::new(&helper_path)
        .args(["install", "--daemon-path", daemon_path.to_str().unwrap()])
        .status();
    
    match result {
        Ok(status) if status.success() => {
            info!("Service installed successfully");
            sentry::capture_message("Service installed successfully", sentry::Level::Info);
        }
        Ok(status) => {
            let msg = format!("Service installation returned exit code: {:?}", status.code());
            warn!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Warning);
        }
        Err(e) => {
            let msg = format!("Failed to run service helper: {}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
        }
    }
}

/// Called before uninstall - stops and removes service
fn on_before_uninstall() {
    info!("Velopack: Running pre-uninstall hook");
    
    let helper_path = get_helper_path();
    
    if !helper_path.exists() {
        let msg = format!("service-helper.exe not found at {:?}", helper_path);
        warn!("{}", msg);
        sentry::capture_message(&msg, sentry::Level::Warning);
        return;
    }
    
    debug!("Running service helper for uninstall: {:?}", helper_path);
    
    // Run the helper with uninstall command
    // This will trigger UAC prompt
    let result = Command::new(&helper_path)
        .args(["uninstall"])
        .status();
    
    match result {
        Ok(status) if status.success() => {
            info!("Service uninstalled successfully");
            sentry::capture_message("Service uninstalled successfully", sentry::Level::Info);
        }
        Ok(status) => {
            let msg = format!("Service uninstall returned exit code: {:?}", status.code());
            warn!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Warning);
        }
        Err(e) => {
            let msg = format!("Failed to run service helper: {}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
        }
    }
}

/// Called after update is applied - start service (no UAC needed)
fn on_after_update() {
    info!("Velopack: Running post-update hook");
    
    // Start the service using sc.exe directly
    // This works without elevation because we set permissions at install time
    let result = Command::new("sc")
        .args(["start", SERVICE_NAME])
        .status();
    
    match result {
        Ok(status) if status.success() => {
            info!("Service started after update");
            sentry::capture_message("Service started after update", sentry::Level::Info);
        }
        Ok(_) => {
            warn!("Service may already be running or failed to start");
        }
        Err(e) => {
            let msg = format!("Failed to start service after update: {}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
        }
    }
}

/// Stop the service and wait for it to fully stop
/// Returns true if service is stopped, false if timeout
pub fn stop_service_and_wait() -> bool {
    info!("Stopping service for update...");
    
    // Send stop command
    let _ = Command::new("sc")
        .args(["stop", SERVICE_NAME])
        .status();
    
    // Poll until stopped or timeout
    for i in 0..20 {
        thread::sleep(Duration::from_millis(500));
        
        let output = Command::new("sc")
            .args(["query", SERVICE_NAME])
            .output();
        
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("STOPPED") {
                    info!("Service stopped after {}ms", (i + 1) * 500);
                    return true;
                }
            }
            Err(_) => {
                // Service might not exist, which is fine
                debug!("Service query failed, assuming stopped");
                return true;
            }
        }
    }
    
    // Timeout - try to force kill the process
    warn!("Service stop timeout, attempting force kill...");
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", DAEMON_NAME])
        .status();
    
    // Wait a bit more after force kill
    thread::sleep(Duration::from_millis(1000));
    
    true
}

/// Check for updates and apply them
/// Note: Currently unused but preserved for future auto-update feature
#[allow(dead_code)]
pub fn check_and_apply_update() -> Result<bool, String> {
    info!("Checking for updates (current: {})", build_info::VERSION);
    
    debug!("Update URL: {}", build_info::UPDATE_URL);
    
    // Create update manager
    let source = velopack::sources::HttpSource::new(build_info::UPDATE_URL);
    let um = velopack::UpdateManager::new(source, None, None)
        .map_err(|e| {
            let msg = format!("Failed to create update manager: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    // Check for updates
    let update_check = um.check_for_updates()
        .map_err(|e| {
            let msg = format!("Failed to check for updates: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    let update_info = match update_check {
        velopack::UpdateCheck::UpdateAvailable(info) => info,
        _ => {
            info!("No update available");
            return Ok(false);
        }
    };
    
    info!("Update available: {}", update_info.TargetFullRelease.Version);
    sentry::capture_message(
        &format!("Update available: {}", update_info.TargetFullRelease.Version),
        sentry::Level::Info
    );
    
    // Download the update (no progress channel)
    info!("Downloading update...");
    um.download_updates(&update_info, None)
        .map_err(|e| {
            let msg = format!("Failed to download update: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    info!("Update downloaded successfully");
    
    // CRITICAL: Stop the service before applying update
    info!("Stopping service before applying update...");
    if !stop_service_and_wait() {
        let msg = "Failed to stop service before update";
        error!("{}", msg);
        sentry::capture_message(msg, sentry::Level::Error);
        return Err(msg.to_string());
    }
    
    // Apply update and restart
    info!("Applying update and restarting...");
    um.apply_updates_and_restart(&update_info)
        .map_err(|e| {
            let msg = format!("Failed to apply update: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    // This line should never be reached as app restarts
    info!("Update applied, restarting...");
    Ok(true)
}

/// Rollback to a specific version
#[allow(dead_code)]
pub fn rollback_to_version(version: &str) -> Result<(), String> {
    info!("Rolling back to version: {} (current: {})", version, build_info::VERSION);
    
    // Create update manager with downgrade enabled
    let options = velopack::UpdateOptions {
        AllowVersionDowngrade: true,
        ..Default::default()
    };
    
    let source = velopack::sources::HttpSource::new(build_info::UPDATE_URL);
    let um = velopack::UpdateManager::new(source, Some(options), None)
        .map_err(|e| {
            let msg = format!("Failed to create update manager: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    // Check for the specific version
    let update_check = um.check_for_updates()
        .map_err(|e| {
            let msg = format!("Failed to check for rollback target: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    let update_info = match update_check {
        velopack::UpdateCheck::UpdateAvailable(info) => info,
        _ => {
            let msg = "Rollback target not found";
            error!("{}", msg);
            return Err(msg.to_string());
        }
    };
    
    // Download
    info!("Downloading rollback version...");
    um.download_updates(&update_info, None)
        .map_err(|e| {
            let msg = format!("Failed to download rollback: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    // CRITICAL: Stop the service before applying
    info!("Stopping service before rollback...");
    if !stop_service_and_wait() {
        let msg = "Failed to stop service before rollback";
        error!("{}", msg);
        sentry::capture_message(msg, sentry::Level::Error);
        return Err(msg.to_string());
    }
    
    // IMPORTANT: For rollbacks, we must explicitly call apply_updates_and_restart
    // Velopack does NOT auto-apply downgrades
    info!("Applying rollback...");
    um.apply_updates_and_restart(&update_info)
        .map_err(|e| {
            let msg = format!("Failed to apply rollback: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    info!("Rollback applied, restarting...");
    Ok(())
}
