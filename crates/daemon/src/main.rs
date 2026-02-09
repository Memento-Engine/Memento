mod pipeline;
mod dedup;
mod ocr;
use crate::{
    dedup::{ cache::DedupCache, db_index::DbIndex },
    pipeline::{ capture::{ CaptureMetaData, capture }, gate, worker },
};
use app_core::{ config::database_dir, db::init_pool };

#[tokio::main]
async fn main() {
    println!("AI Daemon started.");

    let cache = DedupCache::new(50, 3);

    let (tx_capture, rx_gate) = tokio::sync::mpsc::channel(10);
    let (tx_process, rx_worker) = tokio::sync::mpsc::channel(10);

    let db_path = database_dir();

    let db_path_str = match db_path.to_str() {
        Some(p) => p,
        None => {
            eprintln!("Invalid database path (non-UTF8)");
            return;
        }
    };

    let db_pool = match app_core::db::init_pool(db_path_str) {
        Ok(pool) => pool,
        Err(e) => {
            eprintln!("Failed to initialize DB pool: {}", e);
            return;
        }
    };

    let db = DbIndex::new(db_pool);

    // Capture task
    tokio::spawn(async move {
        capture(tx_capture);
    });

    // Gate task
    tokio::spawn(async move {
        gate::run(rx_gate, tx_process, cache, db).await;
    });

    // Worker task
    tokio::spawn(async move {
        worker::run(rx_worker).await;
    });

    // Prevent program from exiting
    tokio::signal::ctrl_c().await.unwrap();
}
