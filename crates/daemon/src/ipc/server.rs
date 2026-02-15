use std::error::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{ServerOptions, NamedPipeServer};

const PIPE_NAME: &str = r"\\.\pipe\search_engine";

pub async fn run() -> Result<(), Box<dyn Error>> {
    println!("IPC Server started. Waiting for clients...");

    loop {
        // Create a new pipe instance
        let server = ServerOptions::new()
            .create(PIPE_NAME)?;

        // Wait for client connection
        server.connect().await?;

        // Spawn task to handle client
        tokio::spawn(async move {
            if let Err(e) = handle_client(server).await {
                eprintln!("Client error: {:?}", e);
            }
        });
    }
}

async fn handle_client(mut pipe: NamedPipeServer) -> Result<(), Box<dyn Error>> {
    let mut buffer = [0u8; 1024];

    loop {
        let n = pipe.read(&mut buffer).await?;

        // Client disconnected
        if n == 0 {
            println!("Client disconnected");
            break;
        }

        let query = std::str::from_utf8(&buffer[..n])?;

        println!("Received query: {}", query);

        
        //  

  


        pipe.write_all(b"Data processed successfully.").await?;
    }

    Ok(())
}
