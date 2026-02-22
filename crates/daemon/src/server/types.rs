use serde::{ Serialize, Deserialize };
use chrono::{ DateTime, Utc };

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub text_start: i64,
    pub text_ends: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingStatus {
    Running,
    Completed,
    Final,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    pub source_id: String,
    pub app_name: String,
    pub window_name: String,
    pub captured_at: String,
    pub url: String,
    pub bbox: BBox,
    pub image_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thinking {
    pub title: String,
    pub message: Option<String>,
    pub status: ThinkingStatus,
    pub results: Option<Vec<StepSearchResults>>,
    pub queries: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepSearchResults {
    pub app_name: String,
    pub window_name: String,
    pub image_path: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub message_id: String,
    pub chat_history: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub struct ChatMessage {
    pub id: String,
    pub role: Role,
    pub parts: Vec<MessagePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePart {
    pub r#type: String, // because "type" is a reserved keyword
    pub text: String,
}

// ----------- Events ----------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventTypes {
    Thinking,
    Citations,
    Token,
    Done
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEvent<T> {
    pub event_type: EventTypes,
    pub r#type: &'static str,
    pub payload: T,
}
