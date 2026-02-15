use std::time::{ Duration, SystemTime, UNIX_EPOCH };

use serde::Serialize;
use sqlx::Sqlite;
use tokio::sync::{ mpsc::{ Receiver, Sender } };
use active_win_pos_rs::get_active_window;
use image::DynamicImage;
use windows::Media::Ocr::OcrEngine;
use xcap::Monitor;
use std::sync::Arc;
use tracing::{ info, warn, debug, error };
use crate::{
    dedup::{ cache::DedupCache, phash::compute_hash },
    ocr::{
        self,
        loader::load_engine,
        ocr_filter::process_ocr_pipeline,
        windows::{ OcrResultData, OcrWord },
    },
    pipeline::{
        cloud_ocr::unstructured_chunking,
        framer::process_image,
        memory_process::{ ScreenMemory, process_screen_memory },
    },
};
use sqlx::Pool;
use chrono::{ DateTime, Utc };

#[derive(Debug, Serialize)]
pub struct WindowMetadata {
    app_name: String,
    window_title: String,
    captured_at: DateTime<Utc>,
}

impl WindowMetadata {
    pub fn new(app_name: String, window_title: String) -> Self {
        Self { app_name, window_title, captured_at: Utc::now() }
    }

    pub fn app_name(&self) -> &str {
        &self.app_name
    }

    pub fn window_title(&self) -> &str {
        &self.window_title
    }
}

#[derive(Debug, Serialize)]
pub struct MetaData {
    window_meta: WindowMetadata,
    file_name: String,
}

impl MetaData {
    pub fn new(window_meta: WindowMetadata, file_name: String) -> Self {
        Self { window_meta, file_name }
    }

    pub fn window_meta(&self) -> &WindowMetadata {
        &self.window_meta
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }
}

#[derive(Debug)]
pub struct CaptureMetaData {
    image: DynamicImage,
    image_meta_data: MetaData,
}

impl CaptureMetaData {
    pub fn new(image: DynamicImage, image_meta_data: MetaData) -> Self {
        Self { image, image_meta_data }
    }

    // Getter for image (read-only)
    pub fn image(&self) -> &DynamicImage {
        &self.image
    }

    // Getter for metadata
    pub fn metadata(&self) -> &MetaData {
        &self.image_meta_data
    }
}

fn get_window_meta_data() -> WindowMetadata {
    match get_active_window() {
        Ok(window) =>
            WindowMetadata {
                app_name: window.app_name,
                window_title: window.title,
                captured_at: Utc::now(),
            },
        Err(()) =>
            WindowMetadata {
                app_name: "Unknown".to_string(),
                window_title: "Unknown".to_string(),
                captured_at: Utc::now(),
            },
    }
}

fn get_primary_monitor() -> Monitor {
    Monitor::all().expect("Failed to get monitors").into_iter().next().expect("No monitor found!")
}

fn build_capture_metadata(image_buffer: impl Into<DynamicImage>) -> CaptureMetaData {
    let timestamp = current_timestamp();

    let dynamic: DynamicImage = image_buffer.into();

    let window_meta = get_window_meta_data();

    let meta_data = MetaData {
        file_name: format!("watcher/{}.png", timestamp),
        window_meta,
    };

    CaptureMetaData {
        image: dynamic,
        image_meta_data: meta_data,
    }
}

fn current_timestamp() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).expect("Time went backwards").as_millis()
}

pub async fn capture(mut cache: DedupCache, db_index: Pool<Sqlite>, tx: Sender<ScreenMemory>) {
    let primary_monitor = get_primary_monitor();
    let ocr_engine = load_engine();

    info!("Capturing screen: {}", primary_monitor.name().unwrap_or("Unknown Display".into()));

    loop {
        if let Ok(image_buffer) = primary_monitor.capture_image() {
            let capture_meta = build_capture_metadata(image_buffer);

            let hash: u64 = compute_hash(&capture_meta.image);

            let mut should_skip = cache.should_skip(hash);

            if should_skip {
                info!("Cache hit...");
                continue;
            }

            // if !should_skip {
            //     info!("Cache missed. Looking in the DB");
            //     // Probably we should remove this. // TODO
               
            // }

            // process the OCR
            let ocr_result: OcrResultData = ocr_engine.process(&capture_meta.image).await;

            let words: Vec<OcrWord> = ocr_result.lines
                .iter()
                .flat_map(|line| line.words.clone())
                .collect();

            let paragraphs = process_ocr_pipeline(
                words,
                capture_meta.image.width() as usize,
                capture_meta.image.height() as usize
            );

            let memory = process_screen_memory(
                paragraphs,
                capture_meta.image_meta_data.window_meta.app_name,
                capture_meta.image_meta_data.window_meta.window_title,
                hash
            );


            info!("Memory : {:#?}", memory);

            match tx.send(memory).await {
                Ok(()) => info!("Result was sent."),
                Err(e) => {
                    eprint!("error : {:#?}", e);
                }
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
}
