use reqwest::StatusCode;
use tracing::{ error, info, warn };
use std::sync::Arc;
use std::time::Duration;
use axum::{ routing::post, routing::get, Router };
use crate::server::search_tool::search_tool;
use crate::server::{ app_state::AppState, search_stream_handler::search_stream_handler };
use tower_http::{ cors::CorsLayer };
use tower_http::{ cors::Any };

fn api_router() -> Router<Arc<AppState>> {
  Router::new()
    .route("/search_stream_handler", post(search_stream_handler))
    .route("/search_tool", post(search_tool))
    .route(
      "/healthz",
      get(|| async { "ok" })
    )
}

pub async fn start_server(app_state: Arc<AppState>) {
  let prefix = "/api/v1";

  let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any)
    .expose_headers([axum::http::header::CONTENT_TYPE, axum::http::header::CACHE_CONTROL]);

  let app = Router::new().nest(prefix, api_router()).with_state(app_state.clone()).layer(cors);

  let mut backoff = Duration::from_secs(1);
  let max_backoff = Duration::from_secs(64);

  let (listener, port) = loop {
    // Append ":0" to tell the OS to assign a random available port
    match tokio::net::TcpListener::bind("127.0.0.1:0").await {
      Ok(l) => {
        match l.local_addr() {
          Ok(addr) => {
            break (l, addr.port());
          }
          Err(e) => {
            error!("Failed to get the port from OS: {:#?}", e);
          }
        }
      }
      Err(e) => {
        error!("Failed to start server: {:#?}", e);
      }
    }

    warn!("Retrying bind in {:?}...", backoff);

    tokio::time::sleep(backoff).await;
    backoff = std::cmp::min(backoff * 2, max_backoff);
  };

  write_port_file(port);
  info!("Server running on http://localhost:{}", port);

  match axum::serve(listener, app).await {
    Ok(()) => {}
    Err(e) => {
      error!("Failed to listen server : {:#?}", e);
    }
  }
}

fn write_port_file(port: u16) {
  use std::fs::{ create_dir_all, write };
  use std::thread::sleep;

  let mut backoff = Duration::from_secs(1);
  let max_backoff = Duration::from_secs(64);
  let max_retries = 8; // Prevent infinite hangs on permanent file system errors
  let mut attempt = 0;

  loop {
    attempt += 1;

    // We use a closure to cleanly handle Results with the `?` operator,
    // avoiding deeply nested match statements (rightward drift).
    let result = (|| -> Result<(), String> {
      let p = dirs::data_local_dir().ok_or("Failed to determine user local data directory.")?;

      let dir_path = p.join("memento");
      let file_path = dir_path.join("memento-daemon.port");

      // Explicitly handle errors instead of hiding them with .ok()
      create_dir_all(&dir_path).map_err(|e|
        format!("Failed to create directory {:?}: {}", dir_path, e)
      )?;

      write(&file_path, port.to_string()).map_err(|e|
        format!("Failed to write to file {:?}: {}", file_path, e)
      )?;

      Ok(())
    })();

    match result {
      Ok(_) => {
        info!("Successfully wrote port {} to port file.", port);
        break;
      }
      Err(e) => {
        if attempt >= max_retries {
          error!("Max retries reached. Fatal error writing port file: {}", e);
          break; // Exit the loop. You might also choose to panic!() here if this is critical.
        }

        warn!("Attempt {} failed: {}. Retrying in {:?}...", attempt, e, backoff);

        // Pause the thread for the backoff duration
        sleep(backoff);

        // Double the backoff, capped at max_backoff
        backoff = std::cmp::min(backoff * 2, max_backoff);
      }
    }
  }
}
