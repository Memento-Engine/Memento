mod pipeline;
mod cache;
mod ocr;
mod embedding;
mod ui_events;
mod server;
mod llms;
mod browser_utils;
use std::sync::Arc;
use crate::{
    embedding::engine::{ CrossEncoder, EmbeddingModel },
    ocr::engine::WindowsOcrEngine,
    pipeline::{
        capture::continuous_capture,
        monitor::get_primary_monitor_id,
        processing_ocr_results::processing_ocr_results,
    },
    server::{ app_state::AppState, server::start_server },
    ui_events::start_listener,
};
use app_core::{ config::database_dir, db::{ DatabaseManager, SearchQuery } };
use chrono::{ DateTime, Utc };
use tracing_subscriber;
use tokio::sync::{ Mutex, mpsc };
use tracing::{ error, info, warn, debug };
use tokio::time::{ sleep, self, Instant, Duration };
use std::sync::atomic::{ AtomicBool, Ordering };

// #[tokio::main]
// async fn main() {
//     let file_appender = tracing_appender::rolling::daily("logs", "daemon.log");

//     tracing_subscriber::fmt().with_writer(file_appender).with_ansi(false).init();

//     tracing::info!("Daemon Started.");

//     let (capture_tx, mut capture_rx) = mpsc::channel::<CapturedWindow>(50);
//     let (worker_tx, mut worker_rx) = mpsc::channel::<ScreenMemory>(50);

//     // channel between listener and async worker
//     let (event_listener_tx, mut event_listener_rx) = tokio::sync::mpsc::channel::<()>(100);

//     let frame_cache = Arc::new(Mutex::new(FramesCache::new(50, 9)));
//     let chunk_cache = Arc::new(Mutex::new(ChunkCache::new(50, 9)));

//     let ocr_engine = Arc::new(WindowsOcr::new());

//     let embedding_engine: Arc<std::sync::Mutex<EmbeddingModel>> = Arc::new(
//         std::sync::Mutex::new(match EmbeddingModel::new() {
//             Ok(m) => m,
//             Err(e) => {
//                 error!("Failed to initialize the embedding Model : {:#?}", e);
//                 return;
//             }
//         })
//     );

//     let cross_encoder: Arc<std::sync::Mutex<CrossEncoder>> = Arc::new(
//         std::sync::Mutex::new(match CrossEncoder::new() {
//             Ok(m) => m,
//             Err(e) => {
//                 error!("Failed to initialize the embedding Model : {:#?}", e);
//                 return;
//             }
//         })
//     );

//     let db_path = database_dir();
//     let db_path_str = match db_path.to_str() {
//         Some(p) => p,
//         None => {
//             error!("Invalid database path (non-UTF8)");
//             return;
//         }
//     };
//     let db = Arc::new(
//         DatabaseManager::new(&db_path_str).await.unwrap_or_else(|e| {
//             error!("Failed to init database: {:#?}", e);
//             panic!("Database init failed");
//         })
//     );

//     let app_db_clone = db.clone();
//     let app_state = Arc::new(AppState {
//         db: app_db_clone,
//         embeddingModel: embedding_engine.clone(),
//         crossEncoder: cross_encoder.clone(),
//     });

//     let app_clone = app_state.clone();

//     let embedding_clone = embedding_engine.clone();

//     let query_db_clone = db.clone();
//     let worker_db_clone = db.clone();

//     println!("listening Keyboard events");

//     // // Listen Keyboard and mouse
//     // tokio::task::spawn_blocking(move || {
//     //     // use std channel inside blocking thread
//     //     let (std_tx, std_rx) = std::sync::mpsc::channel();

//     //     // forward events to tokio channel
//     //     std::thread::spawn(move || {
//     //         start_listener(std_tx);
//     //     });

//     //     // bridge std channel -> tokio channel
//     //     while std_rx.recv().is_ok() {
//     //         event_listener_tx.blocking_send(()).ok();
//     //     }
//     // });

//     // Shared flag: "Did something happen?"
//     // let activity_flag = Arc::new(AtomicBool::new(false));
//     // let activity_flag_clone = activity_flag.clone();

//     println!("Channel listener Events");
//     // 1. The Event Listener (Lightweight - Just sets a flag)
//     // tokio::spawn(async move {
//     //     while let Some(_) = event_listener_rx.recv().await {
//     //         // "Hey, the user did something!"
//     //         // This is extremely cheap (nanoseconds)
//     //         activity_flag_clone.store(true, Ordering::Relaxed);
//     //     }
//     // });

//     println!("continues_capture_windows tokio");
//     // 2. The Capture Loop (The "Silent Background Process")
//     // tokio::spawn(async move {
//     //     let mut interval = time::interval(Duration::from_secs(2)); // Tick every 2s

//     //     loop {
//     //         // Wait for the next tick (This puts the thread to sleep = Cool CPU)
//     //         interval.tick().await;

//     //         // Check: Did we see activity since the last tick?
//     //         if activity_flag.load(Ordering::Relaxed) {
//     //             // Reset flag
//     //             activity_flag.store(false, Ordering::Relaxed);

//     //             // Run Heavy Logic
//     //             if
//     //                 let Err(e) = continues_capture_windows(
//     //                     frame_cache.clone(),
//     //                     capture_tx.clone()
//     //                 ).await
//     //             {
//     //                 error!("Capture error {:?}", e);
//     //             }

//     //             info!("Capture cycle complete. Sleeping...");
//     //         } else {
//     //             // No activity? Do nothing. Go back to sleep.
//     //             info!("Idle tick. No user activity.");
//     //         }
//     //     }
//     // });

//     // println!("Processing the OCR Thread");
//     // // Processing OCR
//     // tokio::spawn(async move {
//     //     process_ocr(capture_rx, worker_tx, ocr_engine.clone()).await;
//     // });

//     // println!("Chunks the OCR Thread");
//     // // Chunks Processing
//     // tokio::spawn(async move {
//     //     process_chunks(
//     //         worker_rx,
//     //         chunk_cache.clone(),
//     //         embedding_engine.clone(),
//     //         worker_db_clone
//     //     ).await;
//     // });

//     // Ipc Server Listening

//     // Prevent program from exiting

//     start_server(app_clone).await;

//     tokio::signal::ctrl_c().await.unwrap();
// }

#[tokio::main]
async fn main() {
    use tracing_subscriber::EnvFilter;
    // 1. Initialize tracing in debug mode

    // 1. Set up the file appender
    let file_appender = tracing_appender::rolling::daily("logs", "daemon.log");

    // 2. Create an environment filter defaulting to "debug"
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));

    // 3. Initialize the subscriber with the filter
    tracing_subscriber
        ::fmt()
        .with_env_filter(filter) // <-- This enables debug mode
        .with_writer(file_appender)
        .with_ansi(false) // Keep false for files so you don't get messy color codes
        .init();

    tracing::debug!("Debug mode is active!"); // This will now show up in your file
    tracing::info!("Daemon Started.");

    debug!("Tracing initialized in debug mode");

    use tokio::sync::mpsc::channel;

    let interval = Duration::from_secs(1);

    // 2. Initialize the engine before spawning the task.
    // If this fails, the program returns an error and exits cleanly.
    let ocr_engine = match WindowsOcrEngine::new() {
        Ok(e) => {
            debug!("Successfully initialized WindowsOcrEngine");
            e
        }
        Err(e) => {
            error!("Failed to initialize WindowsOcrEngine: {:#?}", e);
            return;
        }
    };

    let embedding_engine: Arc<std::sync::Mutex<EmbeddingModel>> = Arc::new(
        std::sync::Mutex::new(match EmbeddingModel::new() {
            Ok(m) => m,
            Err(e) => {
                error!("Failed to initialize the embedding Model : {:#?}", e);
                return;
            }
        })
    );

    let db_path = database_dir();
    let db_path_str = match db_path.to_str() {
        Some(p) => p,
        None => {
            error!("Invalid database path (non-UTF8)");
            return;
        }
    };
    let db = Arc::new(
        DatabaseManager::new(&db_path_str).await.unwrap_or_else(|e| {
            error!("Failed to init database: {:#?}", e);
            panic!("Database init failed");
        })
    );

    let cross_encoder: Arc<std::sync::Mutex<CrossEncoder>> = Arc::new(
        std::sync::Mutex::new(match CrossEncoder::new() {
            Ok(m) => m,
            Err(e) => {
                error!("Failed to initialize the embedding Model : {:#?}", e);
                return;
            }
        })
    );

    // App State
    let app_db_clone = db.clone();
    let app_state = Arc::new(AppState {
        db: app_db_clone,
        embeddingModel: embedding_engine.clone(),
        crossEncoder: cross_encoder.clone(),
    });

    let app_clone = app_state.clone();

    let windows_ocr_engine = Arc::new(ocr_engine);
    let (result_sender, mut result_receiver) = channel(512);

    let monitor_id = match get_primary_monitor_id().await {
        Ok(m) => {
            debug!("Primary monitor ID found: {:?}", m);
            m
        }
        Err(e) => {
            error!("Failed to get primary monitor ID: {:#?}", e);
            return;
        }
    };

    info!("Starting continuous capture task...");

    // 3. Spawn the task using an async block.
    // The `move` keyword transfers ownership of `ocr_engine` into the task.
    tokio::spawn(async move {
        let _ = continuous_capture(
            result_sender,
            interval,
            windows_ocr_engine.clone(),
            monitor_id
        ).await;
    });

    // processing ocr results
    tokio::spawn(async move {
        processing_ocr_results(result_receiver, embedding_engine, db).await;
    });

    // Starting the server
    start_server(app_clone).await;

    info!("Watching Screen");
    loop {
        // Just makes daemon run continuesly
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
