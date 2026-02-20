use app_core::db::DatabaseManager;
use tokio::sync::{ Mutex, mpsc::{ Receiver, Sender } };
use tracing::{ info, error };
use std::sync::Arc;

use crate::{
    cache::{ cache::ChunkCache, phash::simhash },
    embedding::engine::EmbeddingModel,
    ocr::{
        engine::OcrEngine,
        ocr_filter::process_ocr_pipeline,
        windows::{ OcrResultData, OcrWord, WindowsOcr },
    },
    pipeline::{ capture::CapturedWindow, memory_process::{ ScreenMemory, process_screen_memory } },
};

pub async fn process_ocr(
    mut capture_rx: Receiver<CapturedWindow>,
    worker_tx: Sender<ScreenMemory>,
    ocr_engine: Arc<WindowsOcr>
) {
    while let Some(capture) = capture_rx.recv().await {
        // process the OCR
        info!("got image from capture");
        let ocr_result: OcrResultData = ocr_engine.process(&capture.image).await;

        let words: Vec<OcrWord> = ocr_result.lines
            .iter()
            .flat_map(|line| line.words.clone())
            .collect();

        let paragraphs = process_ocr_pipeline(
            words,
            capture.image.width() as usize,
            capture.image.height() as usize
        );

        let memory: ScreenMemory = process_screen_memory(paragraphs, capture);

        info!("Memory : {:#?}", memory);
        if let Err(e) = worker_tx.try_send(memory) {
            error!("Error while sending the screen memory to worker : {:#?}", e);
            continue;
        }
    }
}

pub async fn process_chunks(
    mut chunks_rx: Receiver<ScreenMemory>,
    chunk_cache: Arc<Mutex<ChunkCache>>,
    embedding_engine: Arc<std::sync::Mutex<EmbeddingModel>>, // IMPORTANT CHANGE
    db: Arc<DatabaseManager>
) {
    while let Some(memory) = chunks_rx.recv().await {
        let frame_id = match
            db.insert_into_frames(
                &memory.app_name,
                &memory.window_title,
                memory.process_id,
                memory.is_focused,
                memory.browser_url.as_deref(),
                memory.window_x,
                memory.window_y,
                memory.window_width as i32,
                memory.window_height as i32,
                &memory.image_path,
                memory.p_hash
            ).await
        {
            Ok(id) => id,
            Err(e) => {
                error!("Failed to insert into Frames: {:#?}", e);
                continue;
            }
        };

        for chunk in memory.text_blocks {
            let text = chunk.text;
            let hash = simhash(&text);

            let bbox_json = serde_json::to_string(&chunk.bbox).unwrap_or_else(|e| {
                error!("BBox JSON error: {:?}", e);
                "{}".to_string()
            });

            // ✅ LOCK ONLY FOR CACHE READ
            let cached_id = {
                let cache = chunk_cache.lock().await;
                cache.get(hash).copied()
            };

            let chunk_id = if let Some(id) = cached_id {
                info!("Chunk Cache Hit for hash: {}", hash);
                id as i64
            } else {
                info!("Chunk Cache Miss. Checking DB...");

                match db.find_chunk_by_hash(hash).await {
                    Ok(Some(db_id)) => {
                        {
                            let mut cache = chunk_cache.lock().await;
                            cache.add(hash, db_id as u64);
                        }

                        db_id
                    }

                    Ok(None) => {
                        let new_id = match
                            db.insert_into_chunks(
                                frame_id,
                                &text,
                                chunk.role.as_str(),
                                &bbox_json,
                                hash as i64
                            ).await
                        {
                            Ok(id) => id,
                            Err(e) => {
                                error!("Failed to insert new chunk: {:?}", e);
                                continue;
                            }
                        };

                        // ✅ spawn_blocking with std mutex
                        let text_owned = text.clone();
                        let engine_clone = embedding_engine.clone();

                        let query_embedding = tokio::task
                            ::spawn_blocking(move || {
                                let mut engine = engine_clone.lock().unwrap();
                                engine.generate_embedding(&text_owned)
                            }).await
                            .expect("Blocking task failed")
                            .expect("Embedding generation failed");

                        db.insert_into_vec_chunks(new_id, query_embedding).await;

                        {
                            let mut cache = chunk_cache.lock().await;
                            cache.add(hash, new_id as u64);
                        }

                        new_id
                    }

                    Err(e) => {
                        error!("DB Lookup Error: {:?}", e);
                        continue;
                    }
                }
            };

            if let Err(e) = db.insert_into_occurances(frame_id, chunk_id, &bbox_json).await {
                error!("Failed to insert occurrences: {:#?}", e);
            }
        }
    }
}
