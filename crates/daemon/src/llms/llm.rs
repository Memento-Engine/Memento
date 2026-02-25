use app_core::db::{ GroupedSearchResult, StructuredQuery, group_results };
use reqwest::Client;
use serde_json::json;
use crate::llms::{
    prompts::{
        CONVERSATIONAL_PROMPT,
        SYSTEM_PROMPT_FOR_ANS,
        PROMPT_FOR_STRUCTURED_QUERY,
        QUERY_ANALYSIS_AND_EXECUTION_PROMPT,
    },
    types::{ ExecutionPlan, GatheredContext, WebAction },
};
use once_cell::sync::Lazy;
use dotenv::dotenv;
use futures_util::StreamExt;
use tracing::{ info };
use std::future::Future;

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

pub fn build_content(query_history: &str, context: &GatheredContext) -> String {
    let mut content = String::new();

    // =========================
    // QUERY HISTORY
    // =========================
    if !query_history.is_empty() {
        content.push_str("=== CONVERSATION HISTORY ===\n\n");
        content.push_str(query_history);
        content.push_str("\n\n");
    }

    // =========================
    // PERSONAL MEMORY
    // =========================
    if !context.personal_results.is_empty() {
        let grouped_results = group_results(&context.personal_results);
        content.push_str("=== PERSONAL MEMORY ===\n\n");

        for (i, r) in grouped_results.iter().enumerate() {
            content.push_str(
                &format!(
                    "[Memory {}]\n\
                 Source Id: {}\n\
                 App: {}\n\
                 Window: {}\n\
                 URL: {}\n\
                 Captured At: {}\n",
                    i + 1,
                    r.source_id,
                    r.app_name,
                    r.window_title,
                    r.browser_url,
                    r.captured_at
                )
            );

            content.push_str("Content:\n");

            for text in &r.text_contents {
                content.push_str(&format!("- {}\n", text));
            }

            content.push('\n');
        }
    }

    // =========================
    // WEB RESULTS
    // =========================
    if !context.web_results.is_empty() {
        content.push_str("=== WEB RESULTS ===\n\n");

        for tavily in &context.web_results {
            content.push_str(&format!("Search Query: {}\n\n", tavily.query));

            for (i, result) in tavily.results.iter().enumerate() {
                content.push_str(
                    &format!(
                        "[Result {}]\n\
                     Title: {}\n\
                     URL: {}\n\
                     Score: {}\n\
                     Content:\n{}\n\n",
                        i + 1,
                        result.title,
                        result.url,
                        result.score,
                        result.content
                    )
                );
            }
        }
    }

    content
}

fn build_system_prompt(context: &GatheredContext) -> String {
    let mut system_prompt = String::from(SYSTEM_PROMPT_FOR_ANS);

    if let Some(action) = context.final_action.as_ref() {
        match action {
            WebAction::Offer => {
                if context.personal_results.is_empty() {
                    system_prompt.push_str(
                        "\nINSTRUCTION: No personal memories found. Inform the user and offer web search."
                    );
                } else {
                    system_prompt.push_str(
                        "\nINSTRUCTION: Answer using personal memories. Then offer web search for additional info."
                    );
                }
            }

            WebAction::Return => {
                if context.personal_results.is_empty() {
                    system_prompt.push_str(
                        "\nINSTRUCTION: Inform user no personal records were found."
                    );
                }
            }

            WebAction::Auto => {
                system_prompt.push_str(
                    "\nINSTRUCTION: Combine personal memories and web results. Distinguish citations clearly."
                );
            }
        }
    }

    system_prompt
}

pub async fn call_llm_streaming<F, Fut>(
    query: &str,
    context: GatheredContext,
    mut on_token: F
)
    -> Result<(), Box<dyn std::error::Error>>
    where F: FnMut(String) -> Fut + Send, Fut: Future<Output = ()> + Send
{
    let client = Client::new();

    let system_prompt = build_system_prompt(&context);
    let query_content = build_content(query, &context);

    let body =
        json!({
    "model": "deepseek/deepseek-chat",
    "stream": true,
    "messages": [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": query_content
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
