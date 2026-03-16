use std::{
    borrow::Cow,
    process::Command,
    thread,
    time::{Duration, Instant},
};
pub mod get_app_icon;
pub mod get_device_id;

fn is_production_runtime() -> bool {
    match std::env::var("MEMENTO_ENV") {
        Ok(value) => value.eq_ignore_ascii_case("production"),
        Err(_) => !cfg!(debug_assertions),
    }
}

fn initialize_sentry() -> Option<sentry::ClientInitGuard> {
    if !is_production_runtime() {
        return None;
    }

    let dsn = std::env::var("TAURI_SENTRY_DSN")
        .or_else(|_| std::env::var("SENTRY_DSN"))
        .ok()?;

    let release = std::env::var("SENTRY_RELEASE").unwrap_or_else(|_| "memento@1.2.0".to_string());

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
    if daemon_is_running() {
        return Ok("Daemon already running".into());
    }

    if is_dev {
        Command::new("../../target/debug/daemon.exe")
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to start daemon: {}", e);
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
        Command::new("sc")
            .args(["start", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to start service: {}", e);
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

    wait_until_healthy()?;

    Ok("Daemon started successfully".into())
}

#[tauri::command]
fn stop_daemon(is_dev: bool) -> Result<String, String> {
    if is_dev {
        // DEV MODE → kill daemon process
        Command::new("taskkill")
            .args(["/IM", "daemon.exe", "/F"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to stop daemon: {}", e);
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
        Command::new("sc")
            .args(["stop", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| {
                let message = format!("Failed to stop service: {}", e);
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

    wait_until_unhealthy()?;
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
    let path = dirs::data_local_dir()?;

    let dir_path = path.join("memento");
    let file_path = dir_path.join("memento-daemon.port");

    std::fs::read_to_string(file_path)
        .ok()
        .map(|p| p.trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _sentry_guard = initialize_sentry();

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            start_daemon,
            stop_daemon,
            get_app_icon::get_app_icon_ipc,
            get_device_id::generate_auth_headers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
