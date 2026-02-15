use tokio::net::windows::named_pipe::ClientOptions;
use tokio::io::{ AsyncReadExt, AsyncWriteExt };

#[tauri::command]
pub async fn handle_query(query: String) -> String {
    let pipe_path = r"\\.\pipe\search_engine";

    // 1. Connect to the server
    // (This will fail if the server isn't running)
    let mut client = match ClientOptions::new().open(pipe_path) {
        Ok(c) => c,
        Err(e) => {
            println!("Connection failed: {}", e);
            return format!("Connection failed: {}", e);
        }
    };

    // 2. Send the Query
    if let Err(e) = client.write_all(query.as_bytes()).await {
        println!("Failed to send query: {}", e);
        return format!("Failed to send query: {}", e);
    }

    // 3. Read the Response
    let mut buffer = [0u8; 1024];

    let n = match client.read(&mut buffer).await {
        Ok(e) => e,
        Err(e) => {
            println!("{:#?}", e);
            return String::from("");
        }
    };

    let res = match std::str::from_utf8(&buffer[..n]) {
        Ok(e) => e,
        Err(e) => {
            println!("{:#?}", e);
            return String::from("");
        }
    };
    println!("Server response: {:#?}", res);
    return res.to_string();
}
