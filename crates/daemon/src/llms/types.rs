use chrono::{ DateTime, Utc };
use serde::{ Deserialize, Serialize };
use sqlx::prelude::FromRow;

#[derive(Debug, Serialize, Deserialize)]
pub enum KnowledgeSource {
    PersonalMemory,
    LocalIndex,
    WebSearch,
    LLMKnowledge,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum RetrievalDepth {
    none,
    shallow,
    deep,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum CitationPolicy {
    mandatory,
    preferred,
    none,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum FallbackPolicy {
    ask_user,
    auto_with_notice,
    silent,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ResponseStyle {
    conversational,
    explanation,
    comparison,
    ranked_list,
    summary,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub knowledge_priority: Vec<KnowledgeSource>,

    pub retrieval_depth: RetrievalDepth,

    pub requires_freshness: bool,

    pub requires_personal_context: bool,

    pub citation_policy: CitationPolicy,

    pub fallback_policy: FallbackPolicy,

    pub response_style: ResponseStyle,

    pub include_images: bool,

    pub rewritten_query: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InputForLLm {
    pub captured_at: DateTime<Utc>,

    pub app_name: String,
    pub window_title: String,
    pub text_content: Vec<String>,
    pub browser_url: String,

    pub chunk_id: i32,

    pub image_path: String,
}
