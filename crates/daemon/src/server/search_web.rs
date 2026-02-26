use reqwest::Client;
use serde::{ Deserialize, Serialize };
use tracing::{ info };

use once_cell::sync::Lazy;
use dotenv::dotenv;

// static SEARCH_API_KEY: Lazy<String> = Lazy::new(|| {
//     dotenv().ok();
//     std::env::var("SEARCH_API").expect("SEARCH_API must be set")
// });

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TavilyRequest {
    pub api_key: String,
    pub query: String,
    pub search_depth: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TavilyResponse {
    pub query: String,
    pub results: Vec<WebSearchResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub score: f64,
}

use anyhow::Result;
use futures::future::join_all;

// Static HTTP client (BEST practice)
static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| Client::new());

pub async fn search_web(queries: &[String]) -> Result<Vec<TavilyResponse>> {

    let client = &*HTTP_CLIENT;

    let tasks = queries.iter().map(|query| {

        let client = client.clone();
        let api_key = "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".to_string();
        let query = query.clone();

        async move {

            let request_body = TavilyRequest {
                api_key,
                query,
                search_depth: "basic".to_string(),
            };

            let response = client
                .post("https://api.tavily.com/search")
                .json(&request_body)
                .send()
                .await?;

            let result: TavilyResponse = response.json().await?;

            Ok(result)
        }
    });

    // Run all requests concurrently
    let results = join_all(tasks).await;

    // Convert Vec<Result<T>> -> Result<Vec<T>>
    let collected: Result<Vec<_>> = results.into_iter().collect();

    collected
}