use serde::{ Serialize, Deserialize };
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::io::{ AsyncReadExt, AsyncWriteExt };
use std::fmt::Debug;
use tauri::Emitter;
use tauri_plugin_fs::init as fs_plugin;

#[derive(Serialize, Deserialize, Debug)]
pub struct IpcRequest {
    command: String,
    data: String,
}
const PIPE_NAME: &str = r"\\.\pipe\search_engine";

#[tauri::command]
async fn ask_gemini(query: String, window: tauri::Window) {

    println!("query: {}", query);

    let mut client = match ClientOptions::new().open(PIPE_NAME) {
        Ok(c) => c,
        Err(e) => {
            println!("Connection failed: {}", e);
            return;
        }
    };

    let ipc_request = IpcRequest {
        command: "send_user_query".to_string(),
        data: query,
    };

    let ipc_request_str = match serde_json::to_string(&ipc_request) {
        Ok(m) => m,
        Err(e) => {
            println!("Serialization error: {:?}", e);
            return;
        }
    };

    if let Err(e) = client.write_all(ipc_request_str.as_bytes()).await {
        println!("Write failed: {}", e);
        return;
    }

    // ======================
    // STREAMING LOOP
    // ======================

    let mut buffer = [0u8; 1024];
    let mut pending = String::new();

    loop {

        let n = match client.read(&mut buffer).await {
            Ok(n) => n,
            Err(e) => {
                println!("Read error: {:?}", e);
                break;
            }
        };

        let chunk = match std::str::from_utf8(&buffer[..n]) {
            Ok(s) => s,
            Err(_) => continue,
        };

        pending.push_str(chunk);

        while let Some(pos) = pending.find('\n') {

            let line = pending[..pos].to_string();
            pending = pending[pos+1..].to_string();

            let event: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match event["type"].as_str() {

                Some("token") => {

                    if let Some(text) = event["data"].as_str() {

                        // ⭐ STREAM TO FRONTEND IMMEDIATELY
                        let _ = window.emit("model-token", text);
                    }
                }

                Some("done") => {
                    println!("Stream finished");
                    // let _ = window.emit("model-done", true);

                    return;
                }

                _ => {}
            }
        }
    
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(fs_plugin())   // ✅ ADD THIS LINE
        .invoke_handler(tauri::generate_handler![ask_gemini])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

