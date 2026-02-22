use app_core::db::{ SearchQuery, group_results };
use axum::{ extract::{ Json, State }, response::{ Sse, sse::{ Event, KeepAlive } } };
use chrono::{ DateTime, Utc };
use futures::stream::Stream;
use windows::Win32::NetworkManagement::NetManagement::NELOG_NetLogonFailedToInitializeAuthzRm;
use std::{ convert::Infallible, sync::Arc, time::Duration };
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;
use serde_json::{ Value, json };

use tracing::{ info, error };
use crate::{
    llms::{
        llm::{ call_llm_streaming, modal_for_structured_query, query_rewriter_classifier_model },
        types::KnowledgeSource,
    },
    server::{
        app_state::AppState,
        emitter::EventEmitter,
        types::{
            ChatMessage,
            ChatRequest,
            CustomEvent,
            EventTypes,
            MessagePart,
            Role,
            StepSearchResults,
            Thinking,
            ThinkingStatus,
        },
    },
};
use tokio_stream::{ self as stream };

pub async fn search_stream_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // channel for streaming tokens
    let (tx, rx) = mpsc::channel::<String>(32);

    let emitter = EventEmitter::new(tx.clone());

    // spawn background async task
    tokio::spawn(async move {
        let chat_history = payload.chat_history;

        let user_query = {
            let mut formatted = String::from("### Conversation History\n\n");

            for msg in &chat_history {
                let role = match msg.role {
                    Role::User => "User",
                    Role::Assistant => "Assistant",
                };

                formatted.push_str(&format!("{}:\n", role));

                for part in &msg.parts {
                    formatted.push_str(&part.text);
                    formatted.push('\n');
                }

                formatted.push('\n');
            }

            formatted
        };

        info!("user Query : {}", user_query);

        // --------------------------
        // Query rewriter
        // --------------------------

        emitter.send(EventTypes::Thinking, Thinking {
            title: "Query Resolution and analyzing the intent...".to_string(),
            status: ThinkingStatus::Running,
            message: None,
            results: None,
            queries: None,
        }).await;

        let plan = match
            query_rewriter_classifier_model(&user_query).await.map_err(|e|
                format!("ERROR: {:?}", e)
            )
        {
            Ok(p) => p,
            Err(err_msg) => {
                error!("Failed to write and claffiy Plan : {:#?}", err_msg);

                let _ = tx.send(err_msg).await; // Safe! err_msg is a String (Send)
                return;
            }
        };

        emitter.send(EventTypes::Thinking, Thinking {
            title: "Searching".to_string(),
            status: ThinkingStatus::Running,
            message: None,
            results: None,
            queries: Some(vec![plan.rewritten_query.clone()]),
        }).await;

        info!("Execution Plan : {:#?}", plan);

        let emitter_clone = emitter.clone();

        for knowledge_priority in plan.knowledge_priority {
            match knowledge_priority {
                KnowledgeSource::PersonalMemory => {
                    emitter_clone.send(EventTypes::Thinking, Thinking {
                        title: "Targeting PersonalMemory Context".to_string(),
                        status: ThinkingStatus::Running,
                        message: None,
                        results: None,
                        queries: None,
                    }).await;

                    let structured_query = match
                        modal_for_structured_query(&plan.rewritten_query).await.map_err(|e|
                            format!("ERROR: {:?}", e)
                        )
                    {
                        Ok(s) => s,
                        Err(err_msg) => {
                            error!("Failed to structure the query : {:#?}", err_msg);
                            let _ = tx.send(err_msg).await;
                            return;
                        }
                    };

                    let embeddings: Vec<f32> = {
                        let embedding_model = state.embeddingModel.clone();

                        let Some(text) = structured_query.semantic_query.clone() else {
                            error!("ERROR: No semantic query. Root cause:");
                            let _ = tx.send("ERROR: No semantic query".into()).await;
                            return;
                        };

                        tokio::task
                            ::spawn_blocking(move || {
                                // std::sync::MutexGuard is !Send, but it's safe here
                                // because it is acquired and dropped entirely inside this sync closure.
                                embedding_model.lock().unwrap().generate_embedding(&text).unwrap()
                            }).await
                            .unwrap()
                    };

                    let search_query = SearchQuery {
                        app_name: structured_query.app_name,
                        browser_url: structured_query.browser_url,
                        embedding: Some(embeddings),
                        entities: structured_query.entities,
                        key_words: structured_query.key_words,
                        query: structured_query.query,
                        semantic_query: structured_query.semantic_query,
                        time_range: structured_query.time_range,
                        window_name: structured_query.window_name,
                    };

                    // FIX: Map the error to a String
                    let shallow_results = match
                        state.db
                            .perform_shallow_search(search_query).await
                            .map_err(|e| format!("ERROR: {:?}", e))
                    {
                        Ok(s) => s,
                        Err(err_msg) => {
                            error!("Failed to shallow results. Root cause: {}", err_msg);
                            let _ = tx.send(err_msg).await;
                            return;
                        }
                    };

                    {
                        let founded_results: Vec<StepSearchResults> = shallow_results
                            .iter()
                            .map(|f| StepSearchResults {
                                app_name: f.app_name.clone(),
                                captured_at: f.captured_at.clone(),
                                image_path: f.image_path.clone(),
                                window_name: f.window_title.clone(),
                            })
                            .collect();
                    
                        

                        emitter_clone.send(EventTypes::Thinking, Thinking {
                            title: format!("Found {} results", shallow_results.len()),
                            status: ThinkingStatus::Running,
                            message: None,
                            results: Some(founded_results),
                            queries: None,
                        }).await;
                    }

                    emitter_clone.send(EventTypes::Thinking, Thinking {
                        title: "".to_string(),
                        status: ThinkingStatus::Completed,
                        message: None,
                        results: None,
                        queries: None,
                    }).await;

                    let grouped_results = group_results(shallow_results);
                    info!("grouped_results  : {:#?}", grouped_results);

                    // --------------------------
                    // TOKEN STREAM CALLBACK
                    // --------------------------
                    let emitter_clone = emitter.clone();

                    let callback = move |token: String| {
                        let emitter = emitter_clone.clone();

                        async move {
                            emitter.send(EventTypes::Token, MessagePart {
                                text: token,
                                r#type: "text".to_string(),
                            }).await;
                        }
                    };
                    let _ = call_llm_streaming(&user_query, grouped_results, callback).await;
                }

                _ => {}
            }
        }
    });

    let stream = ReceiverStream::new(rx).map(|event_json| {
        let mut parsed: Value = serde_json::from_str(&event_json).unwrap();

        info!("Parsed value from event : {:#?}", parsed);

        // SSE event name
        let event_name = parsed["event_type"].as_str().unwrap_or("message").to_string();

        info!("event_name value from event : {}", event_name);

        // extract type
        let event_type = parsed["type"].as_str().unwrap_or("").to_string();

        // extract payload
        let mut payload = parsed["payload"].take();

        // merge: add "type" into payload
        if let Value::Object(ref mut obj) = payload {
            obj.insert("type".to_string(), Value::String(event_type));
        }

        info!("Payload before sending final event to UI : {:#?}", payload);

        Ok(Event::default().event(event_name).data(payload.to_string()))
    });
    return Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(1)));
}
