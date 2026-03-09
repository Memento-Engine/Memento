use std::{ fs, path::PathBuf, process::Command, time::{ Duration, Instant }, thread };
pub mod disk_usage;

#[tauri::command]
fn start_daemon(is_dev: bool) -> Result<String, String> {
    if daemon_is_running() {
        return Ok("Daemon already running".into());
    }

    if is_dev {
        Command::new("../../target/debug/daemon.exe")
            .spawn()
            .map_err(|e| format!("Failed to start daemon: {}", e))?;
    } else {
        Command::new("sc")
            .args(["start", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| format!("Failed to start service: {}", e))?;
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
            .map_err(|e| format!("Failed to stop daemon: {}", e))?;
    } else {
        // PROD MODE → stop Windows service
        Command::new("sc")
            .args(["stop", "SearchEngineDaemon"])
            .spawn()
            .map_err(|e| format!("Failed to stop service: {}", e))?;
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

    Err("Daemon failed to start".into())
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

    Err("Daemon failed to start".into())
}

fn read_port_file() -> Option<String> {
    let path = dirs::data_local_dir()?;

    let dir_path = path.join("memento");
    let file_path = dir_path.join("memento-daemon.port");

    std::fs
        ::read_to_string(file_path)
        .ok()
        .map(|p| p.trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init()) // add this
        .invoke_handler(tauri::generate_handler![start_daemon, stop_daemon])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
