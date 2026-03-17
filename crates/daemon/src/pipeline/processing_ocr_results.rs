use chrono::Utc;
use tokio::sync::mpsc::Receiver;
use tracing::{debug, error, info, warn};
use crate::{
    embedding::engine::EmbeddingModel,
    logging::LatencyGuard,
    ocr::windows::OcrBbox,
    pipeline::capture::CaptureResult,
};
use app_core::{ config::memories_dir, db::{ ChunkBlock, DatabaseManager, ProcessedOcrResult } };
use std::sync::{ Arc, Mutex };

use image::codecs::jpeg::JpegEncoder;
use std::fs::{self, File};
use std::path::Path;

fn save_compressed_jpeg(img: &image::DynamicImage, path: &Path) -> Result<(), image::ImageError> {
    if let Some(parent_dir) = path.parent() {
        fs::create_dir_all(parent_dir).map_err(image::ImageError::IoError)?;
    }

    let file = File::create(path).map_err(image::ImageError::IoError)?;

    let mut encoder = JpegEncoder::new_with_quality(file, 75);
    encoder.encode_image(img)?;

    Ok(())
}

fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect()
}

pub async fn processing_ocr_results(
    mut rx: Receiver<CaptureResult>,
    bi_encoder: Arc<Mutex<EmbeddingModel>>,
    db: Arc<DatabaseManager>
) {
    const CHUNK_SIZE: usize = 300;

    while let Some(capture) = rx.recv().await {
        let _capture_guard = LatencyGuard::with_threshold("process_capture_batch", 1000);
        let mut final_results: Vec<ProcessedOcrResult> = Vec::new();
        let window_count = capture.window_ocr_results.len();
        debug!(windows = window_count, "Processing capture batch");

        for ocr_item in capture.window_ocr_results {
            // ----------------------------------------
            //  Parse OCR BBoxes
            // ----------------------------------------
            let ocr_bboxes: Vec<OcrBbox> = ocr_item.text_json
                .into_iter()
                .filter_map(|map| OcrBbox::try_from(map).ok())
                .collect();

            let words: Vec<&str> = ocr_item.text.split_whitespace().collect();

            if ocr_bboxes.len() != words.len() {
                warn!("OCR mismatch: words={} bboxes={}", words.len(), ocr_bboxes.len());
            }

            // ----------------------------------------
            //  Build chunk ranges + embedding inputs
            // ----------------------------------------
            let mut text_for_embeddings: Vec<String> = Vec::new();
            let mut chunk_ranges: Vec<(usize, usize)> = Vec::new();

            let mut index: usize = 0;

            while index < words.len() {
                let end = (index + CHUNK_SIZE).min(words.len());

                text_for_embeddings.push(words[index..end].join(" "));
                chunk_ranges.push((index, end));

                index = end;
            }

            if text_for_embeddings.is_empty() {
                continue;
            }

            // ----------------------------------------
            // Generate embeddings safely (non-blocking async)
            // ----------------------------------------
            let chunk_count = text_for_embeddings.len();
            let embeddings: Vec<Vec<f32>> = {
                let _emb_guard = LatencyGuard::with_threshold(
                    format!("generate_embeddings(chunks={})", chunk_count),
                    500,
                );
                let embedding_model: Arc<Mutex<EmbeddingModel>> = bi_encoder.clone();

                tokio::task
                    ::spawn_blocking(move || {
                        // std::sync::MutexGuard is !Send, but it's safe here
                        // because it is acquired and dropped entirely inside this sync closure.
                        embedding_model
                            .lock()
                            .unwrap()
                            .generate_batch_embeddings(text_for_embeddings)
                            .unwrap()
                    }).await
                    .unwrap()
            };
            debug!(chunks = chunk_count, "Generated embeddings");

            // ----------------------------------------
            //  Build ChunkBlocks with correct alignment
            // ----------------------------------------
            let mut text_blocks: Vec<ChunkBlock> = Vec::new();

            for ((start, end), embedding) in chunk_ranges.into_iter().zip(embeddings.into_iter()) {
                let chunk_text = words[start..end].join(" ");

                let bbox_slice = if end <= ocr_bboxes.len() {
                    &ocr_bboxes[start..end]
                } else {
                    &[]
                };

                let chunk_text_json = serde_json::to_string(bbox_slice).unwrap_or_default();

                text_blocks.push(ChunkBlock {
                    text: chunk_text,
                    text_json: chunk_text_json,
                    text_embeddings: embedding,
                });
            }

            // ----------------------------------------
            //  Push final processed result
            // ----------------------------------------
            final_results.push(ProcessedOcrResult {
                app_name: ocr_item.app_name,
                browser_url: ocr_item.browser_url,
                confidence: ocr_item.confidence,
                focused: ocr_item.focused,
                text_blocks,
                window_name: ocr_item.window_name,
                monitor_dimensions: ocr_item.monitor_dimensions,
                image: ocr_item.image,
            });
        }

        // ----------------------------------------
        // Process or store results
        // ----------------------------------------
        for record in final_results {
            let base_image_path = memories_dir();
            let current_timestamp = Utc::now().timestamp_millis();

            if let Err(e) = fs::create_dir_all(&base_image_path) {
                error!(
                    "Failed to ensure memories directory exists ({}): {:?}",
                    base_image_path.display(),
                    e
                );
            }

            let image_name = format!(
                "{}_{}_{}",
                record.app_name.to_lowercase().trim().replace(" ", "_"),
                sanitize(record.window_name.to_lowercase().trim().replace(" ", "_").as_str()),
                current_timestamp
            );

            let file_path = base_image_path.join(format!("{image_name}.jpg"));

            // Save image first
            if let Err(e) = save_compressed_jpeg(&record.image, &file_path) {
                error!("Failed to save image: {:?}", e);
                // continue; // Because even image save is failed, we've to insert the data.
            }

            //  Insert DB record with path
            let _db_guard = LatencyGuard::with_threshold("db_insert_frames", 200);
            match db.insert_frames_with_chunks(&record, &file_path.to_string_lossy()).await {
                Ok(()) => {
                    debug!(app = %record.app_name, "Inserted frame to DB");
                }
                Err(e) => {
                    error!(app = %record.app_name, error = ?e, "DB insert failed");

                    // rollback file
                    let _ = match std::fs::remove_file(&file_path) {
                        Ok(()) => {}
                        Err(e) => {
                            error!("Failed to remove the image: {:#?}", e);
                        }
                    };
                }
            }
        }
    }

    tracing::info!("Channel closed, stopping processor.");
}
