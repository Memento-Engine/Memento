use app_core::db::{ DatabaseManager, SearchResult };
use chrono::{ DateTime, Duration, Utc };
use regex::Regex;
use serde::Serialize;
use std::sync::{ Arc, Mutex };
use app_core::db::SearchQuery;
use tracing::{ info };
use crate::embedding::engine::{ EmbeddingModel };
use std::collections::HashMap;

#[derive(Debug, Serialize)] // Add Serialize for sending to frontend
pub struct GroupedResult {
    pub captured_at: DateTime<Utc>,
    pub app_name: String,
    pub window_title: String,
    pub matches: Vec<String>, // List of text snippets for this page
}
//
// STEP 1 — Normalize text and split into words
//
fn normalize_to_words(s: &str) -> Vec<String> {
    s.to_lowercase()
        .chars()
        .filter(|c| (c.is_alphanumeric() || c.is_whitespace()))
        .collect::<String>()
        .split_whitespace()
        .map(|s| s.to_string())
        .collect()
}

//
// STEP 2 — Extract time from normalized tokens
//
fn extract_time(words: &[String]) -> Option<DateTime<Utc>> {
    let now = Utc::now();

    // -------- Pattern A: Single keywords --------

    for word in words {
        match word.as_str() {
            "today" => {
                return Some(now);
            }
            "yesterday" => {
                return Some(now - Duration::days(1));
            }
            "now" => {
                return Some(now);
            }
            _ => {}
        }
    }

    // -------- Pattern B: number + unit + ago --------
    // Example: ["5","minutes","ago"]

    for window in words.windows(3) {
        if let [num, unit, ago] = window {
            if ago == "ago" {
                if let Ok(n) = num.parse::<i64>() {
                    return match unit.as_str() {
                        "minute" | "minutes" | "min" => { Some(now - Duration::minutes(n)) }
                        "hour" | "hours" | "h" => { Some(now - Duration::hours(n)) }
                        "day" | "days" | "d" => { Some(now - Duration::days(n)) }
                        _ => None,
                    };
                }
            }
        }
    }

    // -------- Pattern C: compact form (5min, 2h, 3d) --------

    let re = Regex::new(r"^(\d+)(min|mins|m|h|hr|hrs|d|day|days)$").unwrap();

    for (i, word) in words.iter().enumerate() {
        if let Some(caps) = re.captures(word) {
            let n: i64 = caps[1].parse().ok()?;
            let unit = &caps[2];

            // Check if next token is "ago"
            let is_ago = words
                .get(i + 1)
                .map(|w| w == "ago")
                .unwrap_or(false);

            if is_ago {
                return match unit {
                    "min" | "mins" | "m" => Some(now - Duration::minutes(n)),
                    "h" | "hr" | "hrs" => Some(now - Duration::hours(n)),
                    "d" | "day" | "days" => Some(now - Duration::days(n)),
                    _ => None,
                };
            }
        }
    }

    None
}

pub fn group_results(raw_results: Vec<SearchResult>) -> Vec<GroupedResult> {
    // We use a HashMap to group by (App Name + Window Title) to handle duplicates
    // Using a tuple key: (app_name, window_title)
    let mut groups: HashMap<(String, String), GroupedResult> = HashMap::new();

    for res in raw_results {
        let key = (res.app_name.clone(), res.window_title.clone());

        groups
            .entry(key)
            .and_modify(|g| {
                // If group exists, just add the new text snippet
                g.matches.push(res.text_content.clone());
            })
            .or_insert(GroupedResult {
                captured_at: res.captured_at, // Keep the timestamp of the first match
                app_name: res.app_name,
                window_title: res.window_title,
                matches: vec![res.text_content.clone()],
            });
    }

    // Convert HashMap back to a sorted Vector
    let mut final_results: Vec<GroupedResult> = groups.into_values().collect();

    // Sort by time (newest first)
    final_results.sort_by(|a, b| b.captured_at.cmp(&a.captured_at));

    final_results
}

// STEP 3 — Example usage
//
pub async fn search_query(embedding_engine_clone: Arc<Mutex<EmbeddingModel>>, db: DatabaseManager) {
    // let query = "show files from 5min ago";

    // let words = normalize_to_words(query);

    // println!("Normalized words: {:?}", words);

    // match extract_time(&words) {
    //     Some(ts) => println!("Extracted timestamp: {}", ts),
    //     None => println!("No time detected"),
    // }

    let search = SearchQuery {
        app_name: Some("chrome".to_string()),
        window_name: None,
        browser_url: None,
        focused: false,
        query: "where i was reading microservice architecture".to_string(),
        // Extracting the core nouns/concepts
        key_words: Some(vec!["microservice".to_string(), "architecture".to_string()]),
        // Setting a lookback period (e.g., last 30 days)
        time_range: Some((Utc::now() - Duration::days(30), Utc::now())),
        // time_range: None,
        entities: Some(vec!["microservices".to_string()]),
    };

    let search_text = search.query.clone();

    let query_embedding = tokio::task
        ::spawn_blocking(move || {
            // 1. LOCK THE MUTEX
            // This gives you 'guard', which acts like a mutable reference (&mut EmbeddingModel)
            let mut engine = embedding_engine_clone.lock().unwrap();

            // 2. CALL THE MUTABLE METHOD
            engine.generate_embedding(&search_text)
        }).await
        .unwrap() // Unwrap the JoinHandle (panic if thread crashed)
        .unwrap();

    let search_results = match db.perform_search(search, query_embedding).await {
        Ok(r) => { r }
        Err(e) => {
            info!("Error while performing search in database : {:#?}", e);
            return;
        }
    };

    let grouped_result = group_results(search_results);
    info!("Grouped Result : {:#?}", grouped_result);
}
