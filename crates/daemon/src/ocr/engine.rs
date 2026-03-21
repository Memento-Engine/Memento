use anyhow::{Context, Result};
use async_trait::async_trait;
use image::DynamicImage;
use windows::Media::Ocr::OcrEngine as WinRTOcrEngine;
use windows::Globalization::Language;
use tracing::{info, warn};

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
        // Try user profile languages first (works for normal user processes)
        if let Ok(engine) = WinRTOcrEngine::TryCreateFromUserProfileLanguages() {
            info!("Windows OCR engine initialized from user profile languages");
            return Ok(Self { engine });
        }
        
        warn!("User profile languages not available (likely running as SYSTEM service), trying fallback...");
        
        // Fallback: Try explicit English language (common default)
        if let Ok(lang) = Language::CreateLanguage(&windows::core::HSTRING::from("en-US")) {
            if let Ok(engine) = WinRTOcrEngine::TryCreateFromLanguage(&lang) {
                info!("Windows OCR engine initialized with en-US fallback");
                return Ok(Self { engine });
            }
        }
        
        // Fallback: Try any available OCR language on the system
        if let Ok(languages) = WinRTOcrEngine::AvailableRecognizerLanguages() {
            if languages.Size()? > 0 {
                let first_lang = languages.GetAt(0)?;
                let lang_tag = first_lang.LanguageTag()?;
                info!("Trying OCR with system language: {}", lang_tag);
                if let Ok(engine) = WinRTOcrEngine::TryCreateFromLanguage(&first_lang) {
                    info!("Windows OCR engine initialized with system language: {}", lang_tag);
                    return Ok(Self { engine });
                }
            }
        }
        
        Err(anyhow::anyhow!(
            "Failed to create Windows OCR engine. No OCR languages available. \
             Install a language pack with OCR support (e.g., English) via Windows Settings."
        ))
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