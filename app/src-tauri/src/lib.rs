use std::{
    borrow::Cow,
    process::Command,
    thread,
    time::{Duration, Instant},
    path::PathBuf,
    sync::Once,
};
use tracing::{info, warn, error, debug};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub mod get_app_icon;
pub mod get_device_id;

/// Service name constant
const SERVICE_NAME: &str = "SearchEngineDaemon";

static LOGGING_INIT: Once = Once::new();

/// Get the base directory for logs
fn get_log_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".memento")
        .join("logs")
}

/// Set up file and console logging
pub fn setup_logging() {
    LOGGING_INIT.call_once(|| {
        let log_dir = get_log_dir();
        let _ = std::fs::create_dir_all(&log_dir);
        
        let file_appender = tracing_appender::rolling::daily(&log_dir, "tauri-app.log");
        
        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info"));
        
        // File layer for persistent logs
        let file_layer = fmt::layer()
            .with_writer(file_appender)
            .with_ansi(false)
            .with_thread_ids(true)
            .with_file(true)
            .with_line_number(true);
        
        // Console layer for debugging (only in debug builds)
        #[cfg(debug_assertions)]
        let console_layer = Some(fmt::layer().with_writer(std::io::stderr));
        
        #[cfg(not(debug_assertions))]
        let console_layer: Option<fmt::Layer<_>> = None;
        
        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .with(console_layer)
            .init();
        
        info!("Memento Tauri app logging initialized");
        info!("Log directory: {:?}", log_dir);
    });
}

fn is_production_runtime() -> bool {
    info!("Checking runtime environment {:?}...", std::env::var("MEMENTO_ENV"));
    match std::env::var("MEMENTO_ENV") {
        Ok(value) => value.eq_ignore_ascii_case("production"),
        Err(_) => !cfg!(debug_assertions),
    }
}

fn initialize_sentry() -> Option<sentry::ClientInitGuard> {
    if !is_production_runtime() {
        return None;
    }


    println!("Initializing Sentry for error reporting {:?}...", std::env::var("TAURI_SENTRY_DSN").or_else(|_| std::env::var("SENTRY_DSN")));

    let dsn = std::env::var("TAURI_SENTRY_DSN")
        .or_else(|_| std::env::var("SENTRY_DSN"))
        .ok()?;

    let release = std::env::var("SENTRY_RELEASE").unwrap_or_else(|_| "memento@0.1.0".to_string());

    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(Cow::Owned(release)),
            environment: Some("frontend".into()),
            ..Default::default()
        },
    ));

    sentry::configure_scope(|scope| {
        scope.set_tag("environment", "frontend");
        scope.set_tag("service", "ui");
        scope.set_tag("runtime", "tauri");
    });

    Some(guard)
}

#[tauri::command]
fn start_daemon(is_dev: bool) -> Result<String, String> {
    info!("start_daemon called, is_dev={}", is_dev);
    
    if daemon_is_running() {
        info!("Daemon already running, skipping start");
        return Ok("Daemon already running".into());
    }

    if is_dev {
        info!("Starting daemon in dev mode");
        Command::new("../../target/debug/memento-daemon.exe")
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to start daemon: {}", e);
                error!("{}", message);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "frontend");
                    scope.set_tag("service", "ui");
                    scope.set_tag("area", "tauri-start-daemon");
                    scope.set_extra("is_dev", is_dev.into());
                    scope.set_extra("error", message.clone().into());
                }, || {
                    sentry::capture_message("start_daemon command failed", sentry::Level::Error);
                });
                message
            })?;
    } else {
        info!("Starting daemon via Windows Service");
        Command::new("sc")
            .args(["start", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to start service: {}", e);
                error!("{}", message);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "frontend");
                    scope.set_tag("service", "ui");
                    scope.set_tag("area", "tauri-start-daemon");
                    scope.set_extra("is_dev", is_dev.into());
                    scope.set_extra("error", message.clone().into());
                }, || {
                    sentry::capture_message("start service command failed", sentry::Level::Error);
                });
                message
            })?;
    }

    info!("Waiting for daemon to become healthy...");
    wait_until_healthy()?;
    info!("Daemon started successfully");

    Ok("Daemon started successfully".into())
}

#[tauri::command]
fn stop_daemon(is_dev: bool) -> Result<String, String> {
    info!("stop_daemon called, is_dev={}", is_dev);
    
    if is_dev {
        // DEV MODE → kill daemon process
        info!("Stopping daemon in dev mode via taskkill");
        Command::new("taskkill")
            .args(["/IM", "memento-daemon.exe", "/F"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to stop daemon: {}", e);
                error!("{}", message);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "frontend");
                    scope.set_tag("service", "ui");
                    scope.set_tag("area", "tauri-stop-daemon");
                    scope.set_extra("is_dev", is_dev.into());
                    scope.set_extra("error", message.clone().into());
                }, || {
                    sentry::capture_message("stop_daemon command failed", sentry::Level::Error);
                });
                message
            })?;
    } else {
        // PROD MODE → stop Windows service
        info!("Stopping daemon via Windows Service");
        Command::new("sc")
            .args(["stop", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to stop service: {}", e);
                error!("{}", message);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "frontend");
                    scope.set_tag("service", "ui");
                    scope.set_tag("area", "tauri-stop-daemon");
                    scope.set_extra("is_dev", is_dev.into());
                    scope.set_extra("error", message.clone().into());
                }, || {
                    sentry::capture_message("stop service command failed", sentry::Level::Error);
                });
                message
            })?;
    }

    info!("Waiting for daemon to stop...");
    wait_until_unhealthy()?;
    info!("Daemon stopped successfully");
    Ok("Daemon Stopped successfully".into())
}

fn daemon_is_running() -> bool {
    if let Some(port) = read_port_file() {
        let url = format!("http://127.0.0.1:{}/healthz", port);
        return reqwest::blocking::get(url).is_ok();
    }
    false
}

fn wait_until_unhealthy() -> Result<(), String> {
    let start = Instant::now();
    let timeout = Duration::from_secs(60);

    while start.elapsed() < timeout {
        if daemon_is_running() {
            return Ok(());
        }

        thread::sleep(Duration::from_millis(400));
    }

    sentry::with_scope(|scope| {
        scope.set_tag("environment", "frontend");
        scope.set_tag("service", "ui");
        scope.set_tag("area", "tauri-stop-daemon");
    }, || {
        sentry::capture_message("Timed out waiting for daemon to stop", sentry::Level::Error);
    });
    Err("Daemon failed to stop".into())
}

fn wait_until_healthy() -> Result<(), String> {
    let start = Instant::now();
    let timeout = Duration::from_secs(60);

    while start.elapsed() < timeout {
        if !daemon_is_running() {
            return Ok(());
        }

        thread::sleep(Duration::from_millis(400));
    }

    sentry::with_scope(|scope| {
        scope.set_tag("environment", "frontend");
        scope.set_tag("service", "ui");
        scope.set_tag("area", "tauri-start-daemon");
    }, || {
        sentry::capture_message("Timed out waiting for daemon to become healthy", sentry::Level::Error);
    });
    Err("Daemon failed to start".into())
}

fn read_port_file() -> Option<String> {
    // On Windows, read from ProgramData (shared location for service running as SYSTEM)
    // ProgramData is accessible by both SYSTEM and normal users
    #[cfg(windows)]
    let dir_path = std::env::var("ProgramData")
        .or_else(|_| std::env::var("ALLUSERSPROFILE"))
        .map(|p| PathBuf::from(p).join("Memento"))
        .ok()?;
    
    #[cfg(not(windows))]
    let dir_path = dirs::data_local_dir()?.join("memento");
    
    let file_path = dir_path.join("memento-daemon.port");

    std::fs::read_to_string(file_path)
        .ok()
        .map(|p| p.trim().to_string())
}

/// Get the daemon API base URL - used by frontend
#[tauri::command]
fn get_daemon_url() -> Result<String, String> {
    if let Some(port) = read_port_file() {
        Ok(format!("http://localhost:{}/api/v1", port))
    } else {
        // Fallback to default port
        Ok("http://localhost:9090/api/v1".to_string())
    }
}

/// Check for available updates
#[tauri::command]
fn check_for_updates() -> Result<Option<String>, String> {
    info!("Checking for updates...");
    
    let update_url = std::env::var("MEMENTO_UPDATE_URL")
           .unwrap_or_else(|_| "https://github.com/Memento-Engine/Memento/releases/latest/download".to_string());
    
    debug!("Update URL: {}", update_url);
    
    let source = velopack::sources::HttpSource::new(&update_url);
    let um = velopack::UpdateManager::new(source, None, None)
        .map_err(|e| {
            let msg = format!("Failed to create update manager: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    let update_check = um.check_for_updates()
        .map_err(|e| {
            let msg = format!("Failed to check for updates: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    match update_check {
        velopack::UpdateCheck::UpdateAvailable(info) => {
            let version = info.TargetFullRelease.Version.to_string();
            info!("Update available: {}", version);
            Ok(Some(version))
        }
        velopack::UpdateCheck::NoUpdateAvailable => {
            info!("No update available");
            Ok(None)
        }
        velopack::UpdateCheck::RemoteIsEmpty => {
            warn!("Remote update source is empty");
            Ok(None)
        }
    }
}

/// Stop service and wait for it to fully stop
fn stop_service_and_wait_internal() -> bool {
    // Send stop command
    let _ = Command::new("sc")
        .args(["stop", SERVICE_NAME])
        .status();
    
    // Poll until stopped or timeout
    for _ in 0..20 {
        thread::sleep(Duration::from_millis(500));
        
        let output = Command::new("sc")
            .args(["query", SERVICE_NAME])
            .output();
        
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("STOPPED") {
                    return true;
                }
            }
            Err(_) => return true,
        }
    }
    
    // Timeout - force kill
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "memento-daemon.exe"])
        .status();
    
    thread::sleep(Duration::from_millis(1000));
    true
}

/// Download and apply an update (will restart the app)
#[tauri::command]
fn apply_update() -> Result<(), String> {
    info!("Starting update application...");
    
    let update_url = std::env::var("MEMENTO_UPDATE_URL")
           .unwrap_or_else(|_| "https://github.com/Memento-Engine/Memento/releases/latest/download".to_string());
    
    debug!("Update URL: {}", update_url);
    
    let source = velopack::sources::HttpSource::new(&update_url);
    let um = velopack::UpdateManager::new(source, None, None)
        .map_err(|e| {
            let msg = format!("Failed to create update manager: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    info!("Checking for updates before applying...");
    let update_check = um.check_for_updates()
        .map_err(|e| {
            let msg = format!("Failed to check for updates: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    let update_info = match update_check {
        velopack::UpdateCheck::UpdateAvailable(info) => {
            info!("Update found: {}", info.TargetFullRelease.Version);
            info
        }
        _ => {
            warn!("apply_update called but no update available");
            return Err("No update available".to_string());
        }
    };
    
    // Download the update (no progress callback)
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
    if !stop_service_and_wait_internal() {
        let msg = "Failed to stop service before update";
        error!("{}", msg);
        sentry::capture_message(msg, sentry::Level::Error);
        return Err(msg.to_string());
    }
    info!("Service stopped, applying update...");
    
    // Apply update and restart
    um.apply_updates_and_restart(&update_info)
        .map_err(|e| {
            let msg = format!("Failed to apply update: {:?}", e);
            error!("{}", msg);
            sentry::capture_message(&msg, sentry::Level::Error);
            msg
        })?;
    
    info!("Update applied, restarting...");
    Ok(())
}

/// Get the service status
#[tauri::command]
fn get_service_status() -> Result<String, String> {
    let output = Command::new("sc")
        .args(["query", SERVICE_NAME])
        .output()
        .map_err(|e| format!("Failed to query service: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    if stdout.contains("RUNNING") {
        Ok("running".to_string())
    } else if stdout.contains("STOPPED") {
        Ok("stopped".to_string())
    } else if stdout.contains("START_PENDING") {
        Ok("starting".to_string())
    } else if stdout.contains("STOP_PENDING") {
        Ok("stopping".to_string())
    } else {
        Ok("unknown".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging FIRST
    setup_logging();
    
    info!("Memento AI starting...");
    info!("Production mode: {}", is_production_runtime());
    
    let _sentry_guard = initialize_sentry();
    if _sentry_guard.is_some() {
        info!("Sentry initialized for error reporting");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            start_daemon,
            stop_daemon,
            check_for_updates,
            apply_update,
            get_service_status,
            get_daemon_url,
            get_app_icon::get_app_icon_ipc,
            get_device_id::generate_auth_headers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
