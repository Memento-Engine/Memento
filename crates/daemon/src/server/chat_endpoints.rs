use axum::{extract::{Json, Path, State}, response::{IntoResponse, Response}};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tracing::{info, error};

use crate::server::app_state::AppState;

// ── Request/Response types ───────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SaveMessageRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub thinking_steps: Vec<Value>,
    #[serde(default)]
    pub followups: Vec<String>,
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
    pub thinking_steps: Vec<Value>,
    pub followups: Vec<String>,
    pub sources: Vec<MessageSourceRecord>,
}

#[derive(Debug, Serialize)]
pub struct MessageSourceRecord {
    pub chunk_id: i32,
    pub app_name: String,
    pub window_title: String,
    pub captured_at: String,
    pub browser_url: String,
    pub text_content: String,
    pub text_json: Option<String>,
    pub image_path: String,
    pub frame_id: i32,
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: i32,
    pub window_height: i32,
}

#[derive(Debug, Deserialize)]
pub struct ListChatsRequest {
    #[serde(default = "default_chat_limit")]
    pub limit: i32,
}

fn default_chat_limit() -> i32 { 100 }

#[derive(Debug, Serialize)]
pub struct ChatSessionRow {
    pub session_id: String,
    pub title: String,
    pub pinned: bool,
    pub last_message_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListChatsResponse {
    pub success: bool,
    pub chats: Vec<ChatSessionRow>,
}

#[derive(Debug, Deserialize)]
pub struct RenameChatRequest {
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct PinChatRequest {
    pub pinned: bool,
}

#[derive(Debug, Serialize)]
pub struct MutationResponse {
    pub success: bool,
}

fn build_default_chat_title(content: &str) -> String {
    let normalized = content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        return "New chat".to_string();
    }

    let trimmed = normalized
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '`' || c == '.' || c == ',' || c == '!' || c == '?')
        .trim()
        .to_string();

    if trimmed.is_empty() {
        return "New chat".to_string();
    }

    let max_len = 64;
    if trimmed.chars().count() <= max_len {
        return trimmed;
    }

    let mut cut = String::new();
    for ch in trimmed.chars().take(max_len) {
        cut.push(ch);
    }

    format!("{}...", cut.trim_end())
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

    // Ensure chat session exists with a readable title from the first user message.
    if payload.role == "user" {
        let default_title = build_default_chat_title(&payload.content);
        if let Err(e) = state.db.ensure_chat_session(&payload.session_id, &default_title).await {
            error!("Failed to ensure chat session: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to ensure chat session").into_response();
        }
    }

    let thinking_steps_json = if payload.thinking_steps.is_empty() {
        None
    } else {
        match serde_json::to_string(&payload.thinking_steps) {
            Ok(json) => Some(json),
            Err(e) => {
                error!("Failed to serialize thinking steps: {:?}", e);
                return (StatusCode::BAD_REQUEST, "Invalid thinking_steps payload").into_response();
            }
        }
    };

    let followups_json = if payload.followups.is_empty() {
        None
    } else {
        match serde_json::to_string(&payload.followups) {
            Ok(json) => Some(json),
            Err(e) => {
                error!("Failed to serialize followups: {:?}", e);
                return (StatusCode::BAD_REQUEST, "Invalid followups payload").into_response();
            }
        }
    };

    match state.db.save_message(
        &payload.session_id,
        &payload.role,
        &payload.content,
        thinking_steps_json.as_deref(),
        followups_json.as_deref(),
    ).await {
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

            info!(message_id, session_id = %payload.session_id, role = %payload.role, source_count = payload.sources.len(), thinking_step_count = payload.thinking_steps.len(), followup_count = payload.followups.len(), "Message saved");
            (StatusCode::OK, Json(SaveMessageResponse { success: true, message_id })).into_response()
        }
        Err(e) => {
            error!("Failed to save message: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save message").into_response()
        }
    }
}

/// List available chat sessions for sidebar/history.
pub async fn list_chats(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ListChatsRequest>,
) -> Response {
    match state.db.list_chat_sessions(payload.limit).await {
        Ok(rows) => {
            let chats = rows.into_iter().map(|(session_id, title, pinned, last_message_at)| ChatSessionRow {
                session_id,
                title,
                pinned,
                last_message_at,
            }).collect();

            (StatusCode::OK, Json(ListChatsResponse { success: true, chats })).into_response()
        }
        Err(e) => {
            error!("Failed to list chats: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to list chats").into_response()
        }
    }
}

/// Rename a chat session.
pub async fn rename_chat(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(payload): Json<RenameChatRequest>,
) -> Response {
    let title = payload.title.trim();
    if title.is_empty() {
        return (StatusCode::BAD_REQUEST, "title cannot be empty").into_response();
    }

    match state.db.rename_chat_session(&session_id, title).await {
        Ok(true) => (StatusCode::OK, Json(MutationResponse { success: true })).into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, "Chat not found").into_response(),
        Err(e) => {
            error!("Failed to rename chat: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to rename chat").into_response()
        }
    }
}

/// Pin/unpin a chat session.
pub async fn pin_chat(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(payload): Json<PinChatRequest>,
) -> Response {
    match state.db.set_chat_session_pinned(&session_id, payload.pinned).await {
        Ok(true) => (StatusCode::OK, Json(MutationResponse { success: true })).into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, "Chat not found").into_response(),
        Err(e) => {
            error!("Failed to set chat pin: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to update chat pin").into_response()
        }
    }
}

/// Delete a chat session and all associated messages.
pub async fn delete_chat(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Response {
    match state.db.delete_chat_session(&session_id).await {
        Ok(true) => (StatusCode::OK, Json(MutationResponse { success: true })).into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, "Chat not found").into_response(),
        Err(e) => {
            error!("Failed to delete chat: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete chat").into_response()
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
            let mut messages = Vec::with_capacity(rows.len());

            for (id, role, content, created_at, thinking_steps_json, followups_json) in rows {
                let thinking_steps = thinking_steps_json
                    .as_deref()
                    .map(|json| serde_json::from_str::<Vec<Value>>(json))
                    .transpose()
                    .unwrap_or_else(|e| {
                        error!("Failed to parse thinking steps for message {}: {:?}", id, e);
                        Some(Vec::new())
                    })
                    .unwrap_or_default();

                let followups = followups_json
                    .as_deref()
                    .map(|json| serde_json::from_str::<Vec<String>>(json))
                    .transpose()
                    .unwrap_or_else(|e| {
                        error!("Failed to parse followups for message {}: {:?}", id, e);
                        Some(Vec::new())
                    })
                    .unwrap_or_default();

                let sources = match state.db.get_message_source_chunk_ids(id).await {
                    Ok(chunk_ids) if !chunk_ids.is_empty() => {
                        match state.db.get_results_by_chunk_ids(chunk_ids, false).await {
                            Ok(results) => results.into_iter().map(|source| MessageSourceRecord {
                                chunk_id: source.chunk_id,
                                app_name: source.app_name,
                                window_title: source.window_title,
                                captured_at: source.captured_at.to_rfc3339(),
                                browser_url: source.browser_url,
                                text_content: source.text_content,
                                text_json: if source.text_json.is_empty() { None } else { Some(source.text_json) },
                                image_path: source.image_path,
                                frame_id: source.frame_id,
                                window_x: source.window_x,
                                window_y: source.window_y,
                                window_width: source.window_width,
                                window_height: source.window_height,
                            }).collect(),
                            Err(e) => {
                                error!("Failed to load message sources for message {}: {:?}", id, e);
                                Vec::new()
                            }
                        }
                    }
                    Ok(_) => Vec::new(),
                    Err(e) => {
                        error!("Failed to load source chunk IDs for message {}: {:?}", id, e);
                        Vec::new()
                    }
                };

                messages.push(MessageRow { id, role, content, created_at, thinking_steps, followups, sources });
            }

            (StatusCode::OK, Json(GetMessagesResponse { success: true, messages })).into_response()
        }
        Err(e) => {
            error!("Failed to get messages: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get messages").into_response()
        }
    }
}
