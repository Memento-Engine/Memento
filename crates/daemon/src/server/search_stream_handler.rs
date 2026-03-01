use app_core::db::{ SearchQuery, group_results };
use axum::{ extract::{ Json, State }, response::{ Sse, sse::{ Event, KeepAlive } } };
use chrono::{ DateTime, Utc };
use futures::stream::Stream;
use rdev::EventType;
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
        types::{ CitationPolicy, ExecutionStrategy, GatheredContext, KnowledgeSource, WebAction },
    },
    server::{
        app_state::AppState,
        emitter::{ self, EventEmitter },
        search_web::search_web,
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

        let original_user_query = &chat_history[chat_history.len() - 1].parts[0].text;

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

        let web_plan = plan.clone();
        let emitter_clone = emitter.clone();

        let mut context = GatheredContext::default();

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
                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: "Searching through your memories...".to_string(),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: "Understanding your request...".to_string(),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

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

                            let shallow_results = match
                                state.db
                                    .perform_search(search_query).await
                                    .map_err(|e| format!("ERROR: {:?}", e))
                            {
                                Ok(s) => s,
                                Err(err_msg) => {
                                    error!("Failed to shallow results. Root cause: {}", err_msg);
                                    let _ = tx.send(err_msg).await;
                                    return;
                                }
                            };

                            let emit_details = shallow_results
                                .iter()
                                .map(|f| StepSearchResults {
                                    app_name: f.app_name.clone(),
                                    captured_at: f.captured_at.clone(),
                                    image_path: f.image_path.clone(),
                                    window_name: f.window_title.clone(),
                                })
                                .collect();

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Found {} relevant memories", shallow_results.len()),
                                message: None,
                                queries: None,
                                results: Some(emit_details),
                                status: ThinkingStatus::Running,
                            }).await;

                            context.personal_results = shallow_results;

                            let action = if context.personal_results.is_empty() {
                                plan.web_policy.on_no_results.clone()
                            } else {
                                plan.web_policy.on_results_found.clone()
                            };

                            context.final_action = Some(action.clone());

                            match action {
                                WebAction::Return | WebAction::Offer => {
                                    emitter.send(EventTypes::Thinking, Thinking {
                                        title: "Finished".to_string(),
                                        message: None,
                                        queries: None,
                                        results: None,
                                        status: ThinkingStatus::Completed,
                                    }).await;
                                    // We are done gathering. Break the loop so we DON'T hit WebSearch.
                                    break;
                                }
                                WebAction::Auto => {
                                    // We need web context too. Let the loop continue to the next item!
                                    continue;
                                }
                            }
                        }

                        KnowledgeSource::WebSearch => {
                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching the Web"),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching for relevant information..."),
                                message: None,
                                queries: Some(plan.web_search_queries.clone()),
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            let web_results = match search_web(&web_plan.web_search_queries).await {
                                Ok(w) => w,
                                Err(e) => {
                                    error!("Failed to make web search: {:#?}", e);
                                    continue;
                                }
                            };

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Found {} relevant web results", web_results.len()),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: "Finished".to_string(),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Completed,
                            }).await;

                            context.web_results = web_results;
                        }

                        KnowledgeSource::LLMKnowledge => {}
                    }
                }
            }
            ExecutionStrategy::DeepResearch { sources, search_query } => {
                for knowledge_priority in sources {
                    match knowledge_priority {
                        KnowledgeSource::PersonalMemory => {
                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: "Searching through your memories...".to_string(),

                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: "Understanding your request...".to_string(),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

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

                            // FIX: Map the error to a String
                            let deep_results = match
                                state.db
                                    .perform_search(search_query).await
                                    .map_err(|e| format!("ERROR: {:?}", e))
                            {
                                Ok(s) => s,
                                Err(err_msg) => {
                                    error!("Failed to shallow results. Root cause: {}", err_msg);
                                    let _ = tx.send(err_msg).await;
                                    return;
                                }
                            };

                            info!(
                                "Deep search results before cross encoding : {:#?}",
                                deep_results
                            );

                            if !deep_results.is_empty() {
                                let emit_details = deep_results
                                    .iter()
                                    .map(|f| StepSearchResults {
                                        app_name: f.app_name.clone(),
                                        captured_at: f.captured_at.clone(),
                                        image_path: f.image_path.clone(),
                                        window_name: f.window_title.clone(),
                                    })
                                    .collect();

                                emitter_clone.send(EventTypes::Thinking, Thinking {
                                    title: format!(
                                        "Found {} relevant memories",
                                        deep_results.len()
                                    ),

                                    message: None,
                                    queries: None,
                                    results: Some(emit_details),
                                    status: ThinkingStatus::Running,
                                }).await;
                            }

                            // Step 1 — collect text content WITHOUT moving deep_results
                            let text_data: Vec<String> = deep_results
                                .iter()
                                .map(|f| f.text_content.clone())
                                .collect();

                            // Cross Encoding
                            info!("Running cross encode");
                            let cross_encoder = state.crossEncoder.clone();
                            let query_clone = original_user_query.clone();

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Evaluating Search Results"),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            let scores: Vec<f32> = tokio::task
                                ::spawn_blocking(move || {
                                    let mut encoder = cross_encoder.lock().unwrap();

                                    let text_refs: Vec<&str> = text_data
                                        .iter()
                                        .map(String::as_str)
                                        .collect();

                                    encoder.score_batch(&query_clone, &text_refs)
                                }).await
                                .unwrap()
                                .unwrap();

                            // Safety check
                            assert_eq!(deep_results.len(), scores.len());

                            // Step 2 — pair results with scores
                            let mut paired: Vec<_> = deep_results
                                .into_iter()
                                .zip(scores.into_iter())
                                .collect();

                            // Step 3 — sort by score DESC
                            paired.sort_by(|a, b| { b.1.partial_cmp(&a.1).unwrap() });

                            // Step 4 — take Top-K
                            let top_k = 5;

                            let filtered_results: Vec<_> = paired
                                .into_iter()
                                .take(top_k)
                                .map(|(res, _)| res)
                                .collect();

                            info!(
                                "Deep search results after cross encoding : {:#?}",
                                filtered_results
                            );

                            if !filtered_results.is_empty() {
                                let emit_details_filtered = filtered_results
                                    .iter()
                                    .map(|f| StepSearchResults {
                                        app_name: f.app_name.clone(),
                                        captured_at: f.captured_at.clone(),
                                        image_path: f.image_path.clone(),
                                        window_name: f.window_title.clone(),
                                    })
                                    .collect();

                                emitter_clone.send(EventTypes::Thinking, Thinking {
                                    title: format!(
                                        "Found {} Personal Search Results",
                                        filtered_results.len()
                                    ),
                                    message: None,
                                    queries: None,
                                    results: Some(emit_details_filtered),
                                    status: ThinkingStatus::Running,
                                }).await;
                            }

                            // Save
                            context.personal_results = filtered_results;

                            let action = if context.personal_results.is_empty() {
                                plan.web_policy.on_no_results.clone()
                            } else {
                                plan.web_policy.on_results_found.clone()
                            };

                            context.final_action = Some(action.clone());

                            match action {
                                WebAction::Return | WebAction::Offer => {
                                    emitter.send(EventTypes::Thinking, Thinking {
                                        title: "Finished".to_string(),
                                        message: None,
                                        queries: None,
                                        results: None,
                                        status: ThinkingStatus::Completed,
                                    }).await;
                                    // We are done gathering. Break the loop so we DON'T hit WebSearch.
                                    break;
                                }
                                WebAction::Auto => {
                                    // We need web context too. Let the loop continue to the next item!
                                    continue;
                                }
                            }
                        }

                        KnowledgeSource::WebSearch => {
                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching the Web"),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Searching"),
                                message: None,
                                queries: Some(plan.web_search_queries.clone()),
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;
                            let web_results: Vec<crate::server::search_web::TavilyResponse> = match
                                search_web(&web_plan.web_search_queries).await
                            {
                                Ok(w) => w,
                                Err(e) => {
                                    error!("Failed to make web search: {:#?}", e);
                                    continue;
                                }
                            };

                            emitter_clone.send(EventTypes::Thinking, Thinking {
                                title: format!("Found {} Web results", web_results.len()),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Running,
                            }).await;

                            emitter.send(EventTypes::Thinking, Thinking {
                                title: "Finished".to_string(),
                                message: None,
                                queries: None,
                                results: None,
                                status: ThinkingStatus::Completed,
                            }).await;

                            context.web_results = web_results;
                            context.final_action = Some(WebAction::Auto);
                        }

                        KnowledgeSource::LLMKnowledge => {}
                    }
                }
            }
        }

        info!("Final GatheredContext: {:#?}", context);

        let token_emitter_clone = emitter.clone();
        let callback = move |token: String| {
            let emitter = token_emitter_clone.clone();

            async move {
                emitter.send(EventTypes::Token, MessagePart {
                    text: token,
                    r#type: "text".to_string(),
                }).await;
            }
        };

        let _ = call_llm_streaming(&user_query, context, callback).await;

        emitter.send(EventTypes::Done, "").await;
    });

    let stream = ReceiverStream::new(rx).map(|event_json| {
        info!("Event JSon : {:#?}", event_json);

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
