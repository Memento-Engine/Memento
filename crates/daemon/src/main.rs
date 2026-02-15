mod pipeline;
mod dedup;
mod ocr;
mod ipc;
mod text;
mod embedding;
mod algorithms;
mod query;

use std::{ sync::Mutex, thread };
use std::sync::Arc;

use crate::llms::phi3::{ load_llama_model, test_prompt };
use crate::{
    dedup::{ cache::{ ChunkCache, DedupCache }, phash::{ compute_hash, simhash } },
    embedding::engine::{ EmbeddingModel },
    pipeline::{ capture::capture, memory_process::{ ScreenMemory, TextBlock } },
};
use app_core::{ config::database_dir, db::{ DatabaseManager } };
use tracing_subscriber;
use tokio::sync::mpsc;
use tracing::{ error, info, warn, debug };
mod llms;
use candle_transformers::models::quantized_phi3 as model; // Use the quantized module
use std::io::Read;
use model::ModelWeights;
use candle_core::{ DType, Device, Tensor, quantized::gguf_file };

#[tokio::main]
async fn main() {
    let file_appender = tracing_appender::rolling::daily("logs", "daemon.log");

    tracing_subscriber::fmt().with_writer(file_appender).with_ansi(false).init();

    tracing::info!("Daemon Started.");

    let embedding_engine = match EmbeddingModel::new() {
        // WRAP IN MUTEX HERE: Arc<Mutex<EmbeddingModel>>
        Ok(m) => Arc::new(Mutex::new(m)),
        Err(e) => {
            error!("Failed to create embedding model: {:?}", e);
            return;
        }
    };

    let cache = DedupCache::new(100, 3);
    let mut chunk_cache = ChunkCache::new(100, 3);

    // Queue
    let (tx, mut rx) = mpsc::channel::<ScreenMemory>(100);

    let db_path = database_dir();
    let db_path_str = match db_path.to_str() {
        Some(p) => p,
        None => {
            eprintln!("Invalid database path (non-UTF8)");
            return;
        }
    };

    let db = DatabaseManager::new(&db_path_str).await.unwrap_or_else(|e| {
        error!("Failed to init database: {:#?}", e);
        panic!("Database init failed");
    });

    let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

    let (mut model, tokenizer) = load_llama_model(&device);

    // // query::query_processing::search_query(embedding_engine, db).await;
    // let _ = test_prompt(model, tokenizer, device).await;

    // // ------------------------------

    // return;

    let capture_db_pool = db.pool.clone();

    // std::thread::spawn(move || {
    //     let rt = tokio::runtime::Runtime::new().unwrap();

    //     rt.block_on(async {
    //         capture(cache, capture_db_pool, tx).await;
    //     });
    // });

    // tokio::spawn(async move {
    //     while let Some(memory) = rx.recv().await {
    //         let text_chunks = memory.text_blocks;

    //         // 1. Setup variables (Assuming these are derived from memory)
    //         let captured_at = memory.timestamp;
    //         let p_hash = memory.p_hash;

    //         // 2. Insert Frame
    //         // CRITICAL FIX: Changed panic! to continue.
    //         // We don't want to crash the listener if one frame fails to write.
    //         let frame_id = match
    //             db.insert_into_frames(
    //                 &memory.app_name,
    //                 &memory.window_title,
    //                 p_hash,
    //                 captured_at
    //             ).await
    //         {
    //             Ok(id) => id,
    //             Err(e) => {
    //                 error!("Failed to insert into Frames: {:#?}", e);
    //                 continue; // Skip to next memory item
    //             }
    //         };

    //         for chunk in text_chunks {
    //             let text = chunk.text;
    //             let hash = simhash(&text);

    //             let bbox_json = serde_json::to_string(&chunk.bbox).unwrap_or_else(|e| {
    //                 error!("BBox JSON error: {:?}", e);
    //                 "{}".to_string()
    //             });

    //             let cached_id = chunk_cache.get(hash).copied(); // Assuming cache stores Copy types (u64/i64)

    //             let chunk_id = if let Some(id) = cached_id {
    //                 debug!("Cache Hit for hash: {}", hash);
    //                 id as i64 // Ensure type matches DB type
    //             } else {
    //                 debug!("Cache Miss. Checking DB...");
    //                 // Check DB
    //                 match db.find_chunk_by_hash(hash).await {
    //                     Ok(Some(db_id)) => {
    //                         debug!("Found in DB, updating cache.");
    //                         chunk_cache.add(hash, db_id as u64);
    //                         db_id
    //                     }
    //                     Ok(None) => {
    //                         debug!("Unique record. Inserting new chunk.");
    //                         // Insert new chunk
    //                         match
    //                             db.insert_into_chunks(
    //                                 frame_id,
    //                                 &text,
    //                                 chunk.role.as_str(),
    //                                 &bbox_json,
    //                                 hash as i64
    //                             ).await
    //                         {
    //                             Ok(new_id) => {
    //                                 // Generate Embedding
    //                                 // 1. Clone the Arc (cheap reference count bump)
    //                                 let embedding_engine_clone = embedding_engine.clone();

    //                                 // 2. Clone the text to an owned String (Fixes "borrowed value does not live long enough")
    //                                 let text_owned = text.to_string();

    //                                 let query_embedding = tokio::task
    //                                     ::spawn_blocking(move || {
    //                                         // 3. Lock the Mutex
    //                                         // 'engine' is now a MutexGuard, allowing mutable access
    //                                         let mut engine = embedding_engine_clone.lock().unwrap();

    //                                         // 4. Generate (pass reference to the OWNED string inside the thread)
    //                                         engine.generate_embedding(&text_owned)
    //                                     }).await
    //                                     .expect("Blocking task failed to join") // Handle thread panic
    //                                     .expect("Failed to generate embedding"); // Handle model error

    //                                 // Insert Vector
    //                                 db.insert_into_vec_chunks(new_id, query_embedding).await;

    //                                 // Update Cache
    //                                 chunk_cache.add(hash, new_id as u64);
    //                                 new_id
    //                             }
    //                             Err(e) => {
    //                                 error!("Failed to insert new chunk: {:?}", e);
    //                                 continue; // Skip this chunk, process next
    //                             }
    //                         }
    //                     }
    //                     Err(e) => {
    //                         error!("DB Lookup Error: {:?}", e);
    //                         continue; // Skip this chunk
    //                     }
    //                 }
    //             };

    //             // 4. Insert Occurrence
    //             // Logic Consolidation: We only write this logic ONCE after resolving the ID.
    //             if let Err(e) = db.insert_into_occurances(frame_id, chunk_id, &bbox_json).await {
    //                 error!("Failed to insert occurrences for chunk {}: {:#?}", chunk_id, e);
    //             } else {
    //                 debug!("Inserted Occurrence for chunk {}", chunk_id);
    //             }
    //         }
    //     }
    // });

    tokio::spawn(async {
        if let Err(e) = ipc::server::run().await {
            eprintln!("IPC server failed: {:?}", e);
        }
    });
    // Prevent program from exiting
    tokio::signal::ctrl_c().await.unwrap();
}
