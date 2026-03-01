use anyhow::{Context, Result};
use async_trait::async_trait;
use image::DynamicImage;
use windows::Media::Ocr::OcrEngine as WinRTOcrEngine;

// Assuming perform_ocr_windows is defined elsewhere
use crate::ocr::windows::perform_ocr_windows;

#[async_trait]
pub trait OcrEngine: Send + Sync {
    async fn process(&self, image: &DynamicImage) -> Result<(String, String, Option<f64>)>;
}

pub struct WindowsOcrEngine {
    engine: WinRTOcrEngine,
}

impl WindowsOcrEngine {
    pub fn new() -> Result<Self> {
        // Use .context() instead of ok_or_else for better readability and errors
        let engine = WinRTOcrEngine::TryCreateFromUserProfileLanguages()
            .context("Failed to create Windows OCR engine. Ensure language packs are installed.")?;

        Ok(Self { engine })
    }
}

#[async_trait]
impl OcrEngine for WindowsOcrEngine {
    async fn process(
        &self,
        image: &DynamicImage,
    ) -> Result<(String, String, Option<f64>)> {
        perform_ocr_windows(image).await
    }
}