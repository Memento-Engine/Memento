use app_core::db::{ GroupedSearchResult, StructuredQuery };
use reqwest::Client;
use serde_json::json;
use crate::llms::{
    prompts::{
        CONVERSATIONAL_PROMPT, PROMPT_FOR_GETTING_ANS, PROMPT_FOR_STRUCTURED_QUERY, QUERY_ANALYSIS_AND_EXECUTION_PROMPT
    },
    types::ExecutionPlan,
};
use once_cell::sync::Lazy;
use dotenv::dotenv;
use futures_util::StreamExt;
use tracing::{ info };

static OPENROUTER_API_KEY: Lazy<String> = Lazy::new(|| {
    dotenv().ok();
    std::env::var("OPENROUTER_API_KEY").expect("OPENROUTER_API_KEY must be set")
});

pub async fn query_rewriter_classifier_model(
    user_query: &str
) -> Result<ExecutionPlan, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();

    let body =
        json!({
        "model": "deepseek/deepseek-chat",
        "messages": [
            {
                "role": "system",
                "content":QUERY_ANALYSIS_AND_EXECUTION_PROMPT
            },
            {
                "role": "user",
                "content": user_query
            }
        ]
    });

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", *OPENROUTER_API_KEY))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await?;

    let json_response: serde_json::Value = response.json().await?;

    let raw_response = json_response["choices"][0]["message"]["content"]
        .as_str()
        .expect("Missing Content");

    let clean_json = if
        let (Some(start), Some(end)) = (raw_response.find('{'), raw_response.rfind('}'))
    {
        if start <= end {
            &raw_response[start..=end]
        } else {
            &raw_response // fallback just in case
        }
    } else {
        &raw_response // fallback if no brackets found
    };


    let plan: ExecutionPlan = serde_json::from_str(clean_json)?;

    Ok(plan)
}

pub async fn modal_for_structured_query(
    rewritten_query: &str
) -> Result<StructuredQuery, Box<dyn std::error::Error>> {
    let client = Client::new();

    let body =
        json!({
        "model": "deepseek/deepseek-chat",
        "temperature": 0.1,
        "messages": [
            { "role": "system", "content": PROMPT_FOR_STRUCTURED_QUERY },
            { "role": "user", "content": rewritten_query }
        ],
        "response_format": { "type": "json_object" }
    });

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", *OPENROUTER_API_KEY))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await?;

    let json_response: serde_json::Value = response.json().await?;

    let content = json_response["choices"][0]["message"]["content"]
        .as_str()
        .expect("Missing Content");

    let structured_query: StructuredQuery = serde_json::from_str(content)?;

    Ok(structured_query)
}

use std::future::Future;
pub async fn call_llm_streaming<F, Fut>(
    query: &str,
    results: Vec<GroupedSearchResult>,
    mut on_token: F
)
    -> Result<(), Box<dyn std::error::Error>>
    where F: FnMut(String) -> Fut + Send, Fut: Future<Output = ()> + Send
{
    let client = Client::new();

    let mut memories = String::new();

    for r in results {
        let text_joined = r.text_contents.join("\n - ");

        // Source_id means chunk_id
        memories.push_str(
            &format!(
                r#"
            Frame:
            - source_id: {}
            - app_name: {}
            - window_title: {}
            - browser_url: {}
            - text_contents:
            - {}
            "#,
                r.source_id,
                r.app_name,
                r.window_title,
                r.browser_url,
                text_joined
            )
        );
    }
    let body =
        json!({
        "model": "deepseek/deepseek-chat",
        "stream": true,
        "messages": [
            {
                "role": "system",
                "content": PROMPT_FOR_GETTING_ANS
            },
            {
                "role": "user",
                "content": format!(
                    "<memories>\n{}\n</memories>\n\nUser Question:\n{}",
                    memories, query
                )
            }
        ],
        "temperature": 0.2
    });

    let res = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", *OPENROUTER_API_KEY))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await?;

    let mut stream = res.bytes_stream();

    // -------------------------------------
    // Streaming Loop
    // -------------------------------------
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.split('\n') {
            // OpenRouter streaming uses SSE format
            if !line.starts_with("data: ") {
                continue;
            }

            let data = line.trim_start_matches("data: ");

            if data == "[DONE]" {
                return Ok(());
            }

            let json: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => {
                    continue;
                }
            };

            if let Some(token) = json["choices"][0]["delta"]["content"].as_str() {
                on_token(token.to_string()).await;
            }
        }
    }

    Ok(())
}

pub async fn call_llm_streaming_for_conversational<F, Fut>(
    query: &str,
    mut on_token: F
)
    -> Result<(), Box<dyn std::error::Error>>
    where F: FnMut(String) -> Fut + Send, Fut: Future<Output = ()> + Send
{
    let client = Client::new();

    let body =
        json!({
        "model": "deepseek/deepseek-chat",
        "stream": true,
        "messages": [
            {
                "role": "system",
                "content": CONVERSATIONAL_PROMPT
            },
            {
                "role": "user",
                "content": format!(
                    "User Question:\n{}",
                    query
                )
            }
        ],
        "temperature": 0.2
    });

    let res = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", *OPENROUTER_API_KEY))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await?;

    let mut stream = res.bytes_stream();

    // -------------------------------------
    // Streaming Loop
    // -------------------------------------
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.split('\n') {
            // OpenRouter streaming uses SSE format
            if !line.starts_with("data: ") {
                continue;
            }

            let data = line.trim_start_matches("data: ");

            if data == "[DONE]" {
                return Ok(());
            }

            let json: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => {
                    continue;
                }
            };

            if let Some(token) = json["choices"][0]["delta"]["content"].as_str() {
                on_token(token.to_string()).await;
            }
        }
    }

    Ok(())
}
