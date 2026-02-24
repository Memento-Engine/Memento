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
        llm::{
            call_llm_streaming,
            call_llm_streaming_for_conversational,
            modal_for_structured_query,
            query_rewriter_classifier_model,
        },
        types::{ CitationPolicy, ExecutionStrategy, KnowledgeSource },
    },
    server::{
        app_state::AppState,
        emitter::EventEmitter,
        types::{
            BBox,
            ChatMessage,
            ChatRequest,
            Citation,
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

        let plan = match query_rewriter_classifier_model(&user_query).await {
            Ok(p) => p,
            Err(e) => {
                let err_msg = format!("ERROR: {:?}", e);
                error!("Failed to write and classify Plan : {:#?}", err_msg);
                let _ = tx.send(err_msg).await;
                return;
            }
        };

        info!("Execution Plan : {:#?}", plan);

        // Consume BEFORE Arc
        let execution_strategy = plan.clone().into_strategy();

        // Now wrap into Arc if needed
        let plan = Arc::new(plan);

        let citation_plan = plan.clone();
        let emitter_clone = emitter.clone();

        match execution_strategy {
            ExecutionStrategy::DirectResponse => {
                let callback = move |token: String| {
                    let emitter = emitter_clone.clone();

                    async move {
                        emitter.send(EventTypes::Token, MessagePart {
                            text: token,
                            r#type: "text".to_string(),
                        }).await;
                    }
                };
                let _ = call_llm_streaming_for_conversational(&user_query, callback).await;
            }
            ExecutionStrategy::QuickLookup { sources, search_query } => {
                for knowledge_priority in sources {
                    match knowledge_priority {
                        KnowledgeSource::PersonalMemory => {
                            let structured_query = match
                                modal_for_structured_query(&search_query).await.map_err(|e|
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

                            info!("Strucutured_query : {:#?}", structured_query);

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
                                        embedding_model
                                            .lock()
                                            .unwrap()
                                            .generate_embedding(&text)
                                            .unwrap()
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

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching memories..."),
                                status: ThinkingStatus::Running,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;
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

                                let citation_results: Vec<Citation> = shallow_results
                                    .iter()
                                    .map(|f| Citation {
                                        app_name: f.app_name.clone(),
                                        captured_at: f.captured_at.to_string(),
                                        image_path: f.image_path.clone(),
                                        window_name: f.window_title.clone(),
                                        bbox: BBox {
                                            height: f.window_height as f64,
                                            width: f.window_width as f64,
                                            text_ends: 0,
                                            text_start: 0,
                                            x: f.window_x as f64,
                                            y: f.window_y as f64,
                                        },
                                        source_id: f.chunk_id as i64,
                                        url: f.browser_url.clone(),
                                    })
                                    .collect();

                                emitter_clone.send(EventTypes::Citations, citation_results).await;

                                emitter_clone.send(EventTypes::Thinking, Thinking {
                                    title: format!("Found {} results", shallow_results.len()),
                                    status: ThinkingStatus::Running,
                                    message: None,
                                    results: Some(founded_results),
                                    queries: None,
                                }).await;
                            }

                            let grouped_results: Vec<app_core::db::GroupedSearchResult> =
                                group_results(shallow_results);
                            info!("grouped_results  : {:#?}", grouped_results);

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: format!("Evaluating the sources"),
                                status: ThinkingStatus::Running,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: "Finished".to_string(),
                                status: ThinkingStatus::Completed,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;

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
                            let _ = call_llm_streaming(
                                &user_query,
                                grouped_results,
                                callback
                            ).await;
                        }

                        _ => {}
                    }

                    break; // TODO implemenet Web search as fallback
                }
            }
            ExecutionStrategy::DeepResearch { sources, search_query } => {
                for knowledge_priority in sources {
                    match knowledge_priority {
                        KnowledgeSource::PersonalMemory => {
                            let structured_query = match
                                modal_for_structured_query(&search_query).await.map_err(|e|
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

                            info!("Strucutured_query : {:#?}", structured_query);

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
                                        embedding_model
                                            .lock()
                                            .unwrap()
                                            .generate_embedding(&text)
                                            .unwrap()
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

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching memories..."),
                                status: ThinkingStatus::Running,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;
                            // FIX: Map the error to a String
                            let shallow_results = match
                                state.db
                                    .perform_deep_search(search_query).await
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

                                let citation_results: Vec<Citation> = shallow_results
                                    .iter()
                                    .map(|f| Citation {
                                        app_name: f.app_name.clone(),
                                        captured_at: f.captured_at.to_string(),
                                        image_path: f.image_path.clone(),
                                        window_name: f.window_title.clone(),
                                        bbox: BBox {
                                            height: f.window_height as f64,
                                            width: f.window_width as f64,
                                            text_ends: 0,
                                            text_start: 0,
                                            x: f.window_x as f64,
                                            y: f.window_y as f64,
                                        },
                                        source_id: f.chunk_id as i64,
                                        url: f.browser_url.clone(),
                                    })
                                    .collect();

                                emitter_clone.send(EventTypes::Citations, citation_results).await;

                                emitter_clone.send(EventTypes::Thinking, Thinking {
                                    title: format!("Found {} results", shallow_results.len()),
                                    status: ThinkingStatus::Running,
                                    message: None,
                                    results: Some(founded_results),
                                    queries: None,
                                }).await;
                            }

                            let grouped_results: Vec<app_core::db::GroupedSearchResult> =
                                group_results(shallow_results);
                            info!("grouped_results  : {:#?}", grouped_results);

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: format!("Evaluating the sources"),
                                status: ThinkingStatus::Running,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: "Finished".to_string(),
                                status: ThinkingStatus::Completed,
                                message: None,
                                results: None,
                                queries: None,
                            }).await;

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
                            let _ = call_llm_streaming(
                                &user_query,
                                grouped_results,
                                callback
                            ).await;
                        
                        }

                        _ => {}
                    }

                    break; // TODO implemenet Web search as fallback
                }
            }
        }
    });

    let stream = ReceiverStream::new(rx).map(|event_json| {
        let mut parsed: Value = serde_json::from_str(&event_json).unwrap();

        // SSE event name
        let event_name = parsed["event_type"].as_str().unwrap_or("message").to_string();

        // extract type
        let event_type = parsed["type"].as_str().unwrap_or("").to_string();

        // extract payload
        let mut payload = parsed["payload"].take();

        // merge: add "type" into payload
        if let Value::Object(ref mut obj) = payload {
            obj.insert("type".to_string(), Value::String(event_type));
        }

        Ok(Event::default().event(event_name).data(payload.to_string()))
    });
    return Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(1)));
}
