use axum::{extract::{Json, State}, response::{IntoResponse, Response}};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, error};

use crate::server::app_state::AppState;

// ── Request/Response types ───────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SaveMessageRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    /// Chunk references — (chunk_id, usage_type, step_id)
    #[serde(default)]
    pub sources: Vec<MessageSourceInput>,
}

#[derive(Debug, Deserialize)]
pub struct MessageSourceInput {
    pub chunk_id: i64,
    pub usage_type: String,
    pub step_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SaveMessageResponse {
    pub success: bool,
    pub message_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct GetMessagesRequest {
    pub session_id: String,
    #[serde(default = "default_limit")]
    pub limit: i32,
}

fn default_limit() -> i32 { 50 }

#[derive(Debug, Serialize)]
pub struct GetMessagesResponse {
    pub success: bool,
    pub messages: Vec<MessageRow>,
}

#[derive(Debug, Serialize)]
pub struct MessageRow {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

// ── Handlers ─────────────────────────────────────────────

/// Save a message + its chunk source references in one call.
pub async fn save_message(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SaveMessageRequest>,
) -> Response {
    // Validate role
    if payload.role != "user" && payload.role != "assistant" {
        return (StatusCode::BAD_REQUEST, "role must be 'user' or 'assistant'").into_response();
    }

    // Validate usage_type values
    for src in &payload.sources {
        if !["citation", "reviewed", "context"].contains(&src.usage_type.as_str()) {
            return (StatusCode::BAD_REQUEST, "usage_type must be 'citation', 'reviewed', or 'context'").into_response();
        }
    }

    match state.db.save_message(&payload.session_id, &payload.role, &payload.content).await {
        Ok(message_id) => {
            // Save sources if any
            if !payload.sources.is_empty() {
                let sources: Vec<(i64, &str, Option<&str>)> = payload.sources.iter()
                    .map(|s| (s.chunk_id, s.usage_type.as_str(), s.step_id.as_deref()))
                    .collect();

                if let Err(e) = state.db.save_message_sources(message_id, &sources).await {
                    error!("Failed to save message sources: {:?}", e);
                    // Message was saved — sources failed. Log but don't fail the whole request.
                }
            }

            info!(message_id, session_id = %payload.session_id, role = %payload.role, source_count = payload.sources.len(), "Message saved");
            (StatusCode::OK, Json(SaveMessageResponse { success: true, message_id })).into_response()
        }
        Err(e) => {
            error!("Failed to save message: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save message").into_response()
        }
    }
}

/// Get messages for a session.
pub async fn get_messages(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GetMessagesRequest>,
) -> Response {
    match state.db.get_session_messages(&payload.session_id, payload.limit).await {
        Ok(rows) => {
            let messages: Vec<MessageRow> = rows.into_iter().map(|(id, role, content, created_at)| {
                MessageRow { id, role, content, created_at }
            }).collect();

            (StatusCode::OK, Json(GetMessagesResponse { success: true, messages })).into_response()
        }
        Err(e) => {
            error!("Failed to get messages: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get messages").into_response()
        }
    }
}
