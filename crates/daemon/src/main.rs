// Memento Daemon - 24/7 background screen capture and OCR service
// Optimized for minimal CPU usage and user activity prioritization

mod pipeline;
mod cache;
mod ocr;
mod embedding;
mod ui_events;
mod server;
mod browser_utils;
mod core;
mod throttle;
mod logging;

use std::sync::Arc;
use std::time::Duration;
use std::borrow::Cow;

use crate::{
    core::{DaemonConfig, DaemonLifecycle, ShutdownController, set_process_priority},
    embedding::{AsyncEmbeddingModel, AsyncCrossEncoder},
    ocr::engine::WindowsOcrEngine,
    pipeline::{
        capture::continuous_capture_v2,
        monitor::get_primary_monitor_id,
        processor::OcrProcessor,
    },
    server::{app_state::AppState, server::start_server, privacy::PrivacyManager},
    throttle::AdaptiveScheduler,
    cache::PersistentOcrCache,
};

use app_core::{config::database_dir, db::DatabaseManager};
use tracing::{error, info, warn};
use tracing_subscriber::{self, EnvFilter, Layer, fmt, layer::SubscriberExt, util::SubscriberInitExt};
use tokio::sync::mpsc;

use fs2::FileExt;
use std::fs::OpenOptions;

fn ensure_single_instance() -> std::fs::File {
    let lock_path = app_core::config::base_dir().join("memento-daemon.lock");
    
    // Ensure the directory exists
    if let Some(parent) = lock_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    let lock_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&lock_path)
        .expect("Failed to open lock file");

    if lock_file.try_lock_exclusive().is_err() {
        eprintln!("Another memento-daemon instance is already running");
        std::process::exit(0);
    }
    
    lock_file
}

fn setup_logging(debug_mode: bool) {
    // Set up the file appender
    let log_dir = app_core::config::base_dir().join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    
    let file_appender = tracing_appender::rolling::daily(log_dir, "daemon.log");

    // Create an environment filter
    let filter = if debug_mode {
        EnvFilter::new("debug")
    } else {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
    };

    let fmt_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .with_filter(filter);

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(Some(sentry_tracing::layer()))
        .init();
}

fn is_production_runtime() -> bool {
    match std::env::var("MEMENTO_ENV") {
        Ok(value) => value.eq_ignore_ascii_case("production"),
        Err(_) => !cfg!(debug_assertions),
    }
}

fn initialize_sentry() -> Option<sentry::ClientInitGuard> {
    if !is_production_runtime() {
        return None;
    }

    let dsn = std::env::var("DAEMON_SENTRY_DSN")
        .or_else(|_| std::env::var("SENTRY_DSN"))
        .ok()?;

    let release = std::env::var("SENTRY_RELEASE").unwrap_or_else(|_| "memento@1.2.0".to_string());

    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(Cow::Owned(release)),
            environment: Some("daemon".into()),
            ..Default::default()
        },
    ));

    sentry::configure_scope(|scope| {
        scope.set_tag("environment", "daemon");
        scope.set_tag("service", "daemon");
    });

    Some(guard)
}

#[tokio::main]
async fn main() {
    let _sentry_guard = initialize_sentry();

    // 1. Ensure single instance (keep lock file open for daemon lifetime)
    let _lock_file = ensure_single_instance();
    
    // 2. Load configuration
    let config = DaemonConfig::load();
    
    // 3. Setup logging
    setup_logging(config.debug_logging);
    
    info!("Memento Daemon starting...");
    info!("Configuration: {:?}", config);
    
    // 4. Set process priority to below normal for background operation
    if set_process_priority() {
        info!("Process priority set to background mode");
    } else {
        warn!("Failed to set process priority - daemon may compete with user apps");
    }
    
    // 5. Setup graceful shutdown
    let shutdown = Arc::new(ShutdownController::new());
    Arc::clone(&shutdown).setup_signal_handlers();
    
    // 6. Initialize lifecycle manager
    let lifecycle = Arc::new(DaemonLifecycle::new(config.clone(), Arc::clone(&shutdown)));
    
    // 7. Initialize adaptive scheduler for CPU-aware throttling
    let scheduler = AdaptiveScheduler::new(config.clone());
    
    // 8. Initialize OCR engine
    let ocr_engine = match WindowsOcrEngine::new() {
        Ok(engine) => {
            info!("Windows OCR engine initialized");
            Arc::new(engine)
        }
        Err(e) => {
            error!("Failed to initialize OCR engine: {:?}", e);
            return;
        }
    };
    
    // 9. Initialize embedding models (async-safe versions)
    let embedding_model = match AsyncEmbeddingModel::new() {
        Ok(model) => {
            info!("Embedding model initialized");
            Arc::new(model)
        }
        Err(e) => {
            error!("Failed to initialize embedding model: {:?}", e);
            return;
        }
    };
    
    let cross_encoder = match AsyncCrossEncoder::new() {
        Ok(model) => {
            info!("Cross-encoder initialized");
            Arc::new(model)
        }
        Err(e) => {
            error!("Failed to initialize cross-encoder: {:?}", e);
            return;
        }
    };
    
    // 10. Initialize database
    let db_path = database_dir();
    let db_path_str = match db_path.to_str() {
        Some(p) => p,
        None => {
            error!("Invalid database path (non-UTF8)");
            return;
        }
    };
    
    let db = match DatabaseManager::new(db_path_str).await {
        Ok(db) => {
            info!("Database initialized at: {}", db_path_str);
            Arc::new(db)
        }
        Err(e) => {
            error!("Failed to initialize database: {:?}", e);
            return;
        }
    };
    
    // 11a. Initialize privacy manager
    let privacy_manager = match PrivacyManager::new(db.pool.clone()).await {
        Ok(pm) => {
            info!("Privacy manager initialized");
            Arc::new(pm)
        }
        Err(e) => {
            error!("Failed to initialize privacy manager: {:?}", e);
            return;
        }
    };
    
    // 11. Initialize persistent OCR cache
    let ocr_cache = Arc::new(PersistentOcrCache::new(
        config.ocr_cache_max_age_secs,
        config.ocr_cache_max_entries,
    ));
    
    // 12. Get primary monitor
    let monitor_id = match get_primary_monitor_id().await {
        Ok(id) => {
            info!("Primary monitor ID: {}", id);
            id
        }
        Err(e) => {
            error!("Failed to get primary monitor: {:?}", e);
            return;
        }
    };
    
    // 13. Create capture result channel
    let (capture_tx, capture_rx) = mpsc::channel(256);
    
    // 14. Create app state for HTTP server
    let app_state = Arc::new(AppState::new(
        Arc::clone(&db),
        Arc::clone(&embedding_model),
        Arc::clone(&cross_encoder),
        scheduler.clone(),
        Arc::clone(&privacy_manager),
    ));
    
    // 15. Mark lifecycle as running
    lifecycle.start().await;
    
    // 16. Spawn the continuous capture task
    let capture_lifecycle = Arc::clone(&lifecycle);
    let capture_scheduler = scheduler.clone();
    let capture_ocr_engine = Arc::clone(&ocr_engine);
    let capture_ocr_cache = Arc::clone(&ocr_cache);
    let capture_privacy_cache = privacy_manager.cache();
    let capture_shutdown = Arc::clone(&shutdown);
    
    let _capture_handle = tokio::spawn(async move {
        continuous_capture_v2(
            capture_tx,
            capture_scheduler,
            capture_ocr_engine,
            capture_ocr_cache,
            capture_privacy_cache,
            monitor_id,
            capture_shutdown,
            capture_lifecycle,
        ).await
    });
    
    // 17. Spawn the OCR result processor
    let processor_embedding = Arc::clone(&embedding_model);
    let processor_db = Arc::clone(&db);
    let processor_shutdown = Arc::clone(&shutdown);
    
    let _processor_handle = tokio::spawn(async move {
        let processor = OcrProcessor::new(processor_embedding, processor_db);
        processor.process_stream(capture_rx, processor_shutdown).await;
    });
    
    // 18. Spawn the HTTP server
    let server_state = Arc::clone(&app_state);
    let server_shutdown = Arc::clone(&shutdown);
    
    let server_handle = tokio::spawn(async move {
        start_server(server_state, server_shutdown).await;
    });
    
    // 19. Spawn cache persistence task (saves every 5 minutes)
    let cache_persist = Arc::clone(&ocr_cache);
    let cache_shutdown = shutdown.subscribe();
    
    tokio::spawn(async move {
        let mut rx = cache_shutdown;
        let mut interval = tokio::time::interval(Duration::from_secs(300));
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Cleanup stale entries
                    cache_persist.cleanup_stale().await;
                    
                    // Persist to disk
                    if let Err(e) = cache_persist.persist().await {
                        warn!("Failed to persist OCR cache: {}", e);
                    }
                }
                _ = rx.recv() => {
                    // Final persist on shutdown
                    info!("Persisting OCR cache before shutdown...");
                    let _ = cache_persist.persist().await;
                    break;
                }
            }
        }
    });
    
    // 20. Spawn stats logging task
    let stats_lifecycle = Arc::clone(&lifecycle);
    let stats_shutdown = shutdown.subscribe();
    
    tokio::spawn(async move {
        let mut rx = stats_shutdown;
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let stats = stats_lifecycle.stats().await;
                    info!(
                        "Daemon stats: {} captures, {} skipped, {} errors, uptime: {}s, CPU: {:.1}%",
                        stats.frames_captured,
                        stats.frames_skipped,
                        stats.errors,
                        stats.uptime_secs,
                        stats.current_cpu_usage * 100.0
                    );
                }
                _ = rx.recv() => {
                    break;
                }
            }
        }
    });
    
    info!("Daemon fully initialized and running");
    
    // 21. Wait for shutdown signal
    shutdown.wait_for_shutdown().await;
    
    info!("Shutdown signal received, stopping tasks...");
    
    // 22. Wait for tasks to complete (with timeout)
    let shutdown_timeout = Duration::from_secs(10);
    
    tokio::select! {
        _ = async {
            // let _ = capture_handle.await;
            // let _ = processor_handle.await;
            let _ = server_handle.await;
        } => {
            info!("All tasks completed gracefully");
        }
        _ = tokio::time::sleep(shutdown_timeout) => {
            warn!("Shutdown timeout reached, forcing exit");
        }
    }
    
    // 23. Final cleanup
    lifecycle.set_state(core::lifecycle::DaemonState::Stopped).await;
    
    info!("Memento Daemon stopped");
}
