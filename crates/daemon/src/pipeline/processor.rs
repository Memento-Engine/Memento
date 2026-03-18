// OCR result processor - handles embedding generation and database storage
use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use image::codecs::jpeg::JpegEncoder;

use tokio::sync::mpsc::Receiver;
use tracing::{debug, error, info, warn};

use crate::core::ShutdownController;
use crate::embedding::AsyncEmbeddingModel;
use crate::ocr::windows::OcrBbox;
use crate::pipeline::capture::CaptureResult;

use app_core::{
    config::memories_dir,
    db::{ChunkBlock, DatabaseManager, ProcessedOcrResult},
};

/// Chunk size for text splitting (words per chunk)
const CHUNK_SIZE: usize = 300;

/// JPEG quality for stored images (1-100)
const IMAGE_QUALITY: u8 = 75;

/// Processes captured OCR results, generates embeddings, and stores in database.
/// Can operate without an embedding model (saves text only, no vector search).
pub struct OcrProcessor {
    embedding_model: Option<Arc<AsyncEmbeddingModel>>,
    db: Arc<DatabaseManager>,
}

impl OcrProcessor {
    pub fn new(embedding_model: Option<Arc<AsyncEmbeddingModel>>, db: Arc<DatabaseManager>) -> Self {
        if embedding_model.is_none() {
            warn!("OcrProcessor initialized without embedding model - vector search will be unavailable");
        }
        Self {
            embedding_model,
            db,
        }
    }
    
    /// Process a stream of capture results until shutdown
    pub async fn process_stream(
        &self,
        mut rx: Receiver<CaptureResult>,
        shutdown: Arc<ShutdownController>,
    ) {
        let mut shutdown_rx = shutdown.subscribe();
        
        loop {
            tokio::select! {
                Some(capture) = rx.recv() => {
                    if let Err(e) = self.process_capture(capture).await {
                        error!("Failed to process capture: {:?}", e);
                        sentry::capture_message(
                            &format!("process_capture failed: {}", e),
                            sentry::Level::Error,
                        );
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("OCR processor received shutdown signal");
                    break;
                }
            }
        }
        
        // Drain remaining items in channel
        while let Ok(capture) = rx.try_recv() {
            if let Err(e) = self.process_capture(capture).await {
                error!("Failed to process capture during shutdown: {:?}", e);
                sentry::capture_message(
                    &format!("process_capture during shutdown failed: {}", e),
                    sentry::Level::Error,
                );
            }
        }
        
        info!("OCR processor stopped");
    }
    
    /// Process a single capture result
    async fn process_capture(&self, capture: CaptureResult) -> anyhow::Result<()> {
        let start = Instant::now();
        let window_count = capture.window_ocr_results.len();
        
        if window_count == 0 {
            return Ok(());
        }
        
        let mut final_results: Vec<ProcessedOcrResult> = Vec::with_capacity(window_count);
        
        for ocr_item in capture.window_ocr_results {
            // Parse OCR bounding boxes
            let ocr_bboxes: Vec<OcrBbox> = ocr_item.text_json
                .into_iter()
                .filter_map(|map| OcrBbox::try_from(map).ok())
                .collect();
            
            let words: Vec<&str> = ocr_item.text.split_whitespace().collect();
            
            if words.is_empty() {
                continue;
            }
            
            if ocr_bboxes.len() != words.len() {
                debug!(
                    "OCR mismatch: words={} bboxes={}", 
                    words.len(), 
                    ocr_bboxes.len()
                );
            }
            
            // Build text chunks for embedding
            let (texts_for_embedding, chunk_ranges) = self.build_chunks(&words);
            
            if texts_for_embedding.is_empty() {
                continue;
            }
            
            // Generate embeddings if model is available, otherwise use empty vectors
            let embeddings = if let Some(ref model) = self.embedding_model {
                model
                    .generate_batch_embeddings(texts_for_embedding.clone())
                    .await?
            } else {
                // No embedding model - use empty vectors (full-text search still works)
                vec![Vec::new(); texts_for_embedding.len()]
            };
            
            // Build chunk blocks with aligned bounding boxes
            let text_blocks = self.build_chunk_blocks(
                &words,
                &ocr_bboxes,
                chunk_ranges,
                embeddings,
            );
            
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
        
        // Store results in database
        self.store_results(final_results).await?;
        
        debug!(
            "Processed {} windows in {:?}",
            window_count,
            start.elapsed()
        );
        
        Ok(())
    }
    
    /// Build text chunks from words
    fn build_chunks<'a>(&self, words: &'a [&str]) -> (Vec<String>, Vec<(usize, usize)>) {
        let mut texts: Vec<String> = Vec::new();
        let mut ranges: Vec<(usize, usize)> = Vec::new();
        
        let mut index = 0;
        while index < words.len() {
            let end = (index + CHUNK_SIZE).min(words.len());
            texts.push(words[index..end].join(" "));
            ranges.push((index, end));
            index = end;
        }
        
        (texts, ranges)
    }
    
    /// Build chunk blocks with embeddings and aligned bounding boxes
    fn build_chunk_blocks(
        &self,
        words: &[&str],
        ocr_bboxes: &[OcrBbox],
        chunk_ranges: Vec<(usize, usize)>,
        embeddings: Vec<Vec<f32>>,
    ) -> Vec<ChunkBlock> {
        let mut blocks = Vec::with_capacity(chunk_ranges.len());
        
        for ((start, end), embedding) in chunk_ranges.into_iter().zip(embeddings.into_iter()) {
            let chunk_text = words[start..end].join(" ");
            
            let bbox_slice = if end <= ocr_bboxes.len() {
                &ocr_bboxes[start..end]
            } else {
                &[]
            };
            
            let chunk_text_json = serde_json::to_string(bbox_slice).unwrap_or_default();
            
            blocks.push(ChunkBlock {
                text: chunk_text,
                text_json: chunk_text_json,
                text_embeddings: embedding,
            });
        }
        
        blocks
    }
    
    /// Store processed results in database
    async fn store_results(&self, results: Vec<ProcessedOcrResult>) -> anyhow::Result<()> {
        let base_image_path = memories_dir();
        
        // Ensure directory exists
        if let Err(e) = std::fs::create_dir_all(&base_image_path) {
            error!("Failed to create memories directory: {:?}", e);
        }
        
        for record in results {
            let timestamp = Utc::now().timestamp_millis();
            
            let image_name = format!(
                "{}_{}_{}",
                sanitize_filename(&record.app_name),
                sanitize_filename(&record.window_name),
                timestamp
            );
            
            let file_path = base_image_path.join(format!("{}.jpg", image_name));
            
            // Save image (don't fail the whole operation if image save fails)
            if let Err(e) = save_jpeg(&record.image, &file_path, IMAGE_QUALITY) {
                error!("Failed to save image {}: {:?}", file_path.display(), e);
            }
            
            // Insert into database
            match self.db.insert_frames_with_chunks(&record, &file_path.to_string_lossy()).await {
                Ok(()) => {
                    debug!("Stored frame: {} - {}", record.app_name, record.window_name);
                }
                Err(e) => {
                    error!("DB insert failed: {:?}", e);
                    sentry::with_scope(|scope| {
                        scope.set_tag("environment", "daemon");
                        scope.set_tag("service", "daemon");
                        scope.set_tag("area", "db-insert");
                        scope.set_extra("app_name", record.app_name.clone().into());
                        scope.set_extra("window_name", record.window_name.clone().into());
                        scope.set_extra("chunk_count", (record.text_blocks.len() as u64).into());
                        scope.set_extra("image_path", file_path.to_string_lossy().to_string().into());
                    }, || {
                        sentry::capture_message("DB insert failed for OCR record", sentry::Level::Error);
                    });
                    
                    // Rollback: remove the saved image
                    if file_path.exists() {
                        let _ = std::fs::remove_file(&file_path);
                    }
                }
            }
        }
        
        Ok(())
    }
}

/// Sanitize a string for use in filenames
fn sanitize_filename(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(50) // Limit length
        .collect::<String>()
        .to_lowercase()
        .trim()
        .replace(' ', "_")
}

/// Save image as compressed JPEG
fn save_jpeg(
    img: &image::DynamicImage,
    path: &std::path::Path,
    quality: u8,
) -> Result<(), image::ImageError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(image::ImageError::IoError)?;
    }
    
    let file = std::fs::File::create(path).map_err(image::ImageError::IoError)?;
    let mut encoder = JpegEncoder::new_with_quality(file, quality);
    encoder.encode_image(img)?;
    
    Ok(())
}
