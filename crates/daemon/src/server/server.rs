use tracing::{ error, info };
use std::sync::Arc;
use axum::{ routing::post, Router };
use crate::server::search_tool::search_tool;
use crate::server::{ app_state::AppState, search_stream_handler::search_stream_handler };
use tower_http::{ cors::CorsLayer };
use tower_http::{ cors::Any };

fn api_router() -> Router<Arc<AppState>> {
    Router::new()
    .route("/search_stream_handler", post(search_stream_handler))
    .route("/search_tool", post(search_tool))
}

pub async fn start_server(app_state: Arc<AppState>) {
    let prefix = "/api/v1";

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([axum::http::header::CONTENT_TYPE, axum::http::header::CACHE_CONTROL]);

    let app = Router::new().nest(prefix, api_router()).with_state(app_state.clone()).layer(cors);

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:9090").await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to start server : {:#?}", e);
            return;
        }
    };

    info!("Server running on http://localhost:9090");

    match axum::serve(listener, app).await {
        Ok(()) => {}
        Err(e) => {
            error!("Failed to listen server : {:#?}", e);
        }
    }
}
