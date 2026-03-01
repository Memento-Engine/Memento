use std::collections::HashMap;

use anyhow::Result;
use image::{ DynamicImage, GenericImageView };
use tracing::{ info };


use serde::{Deserialize, Deserializer, Serialize};

fn deserialize_f32_from_string<'de, D>(deserializer: D) -> Result<f32, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    s.parse::<f32>().map_err(serde::de::Error::custom)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OcrBbox {
    pub text: String,
    
    #[serde(deserialize_with = "deserialize_f32_from_string")]
    pub left: f32,
    
    #[serde(deserialize_with = "deserialize_f32_from_string")]
    pub top: f32,
    
    #[serde(deserialize_with = "deserialize_f32_from_string")]
    pub width: f32,
    
    #[serde(deserialize_with = "deserialize_f32_from_string")]
    pub height: f32,
    
    #[serde(deserialize_with = "deserialize_f32_from_string")]
    pub conf: f32,
}

impl TryFrom<HashMap<String, String>> for OcrBbox {
    type Error = anyhow::Error;

    fn try_from(map: HashMap<String, String>) -> Result<Self, Self::Error> {
        Ok(OcrBbox {
            text: map.get("text").ok_or(anyhow::anyhow!("missing text"))?.clone(),
            left: map.get("left").ok_or(anyhow::anyhow!("missing left"))?.parse()?,
            top: map.get("top").ok_or(anyhow::anyhow!("missing top"))?.parse()?,
            width: map.get("width").ok_or(anyhow::anyhow!("missing width"))?.parse()?,
            height: map.get("height").ok_or(anyhow::anyhow!("missing height"))?.parse()?,
            conf: map.get("conf").ok_or(anyhow::anyhow!("missing conf"))?.parse()?,
        })
    }
}


#[cfg(target_os = "windows")]
pub async fn perform_ocr_windows(image: &DynamicImage) -> Result<(String, String, Option<f64>)> {
    use std::io::Cursor;
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine as WindowsOcrEngine,
        Storage::Streams::{ DataWriter, InMemoryRandomAccessStream },
    };

    // Validate dimensions
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Ok(("".to_string(), "[]".to_string(), None));
    }

    // Encode image as PNG into memory
    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| anyhow::anyhow!("Failed to encode image: {}", e))?;

    // Create WinRT memory stream
    let stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&stream)?;

    writer.WriteBytes(&buffer)?;

    // REPLACED .get() WITH .await
    writer.StoreAsync()?.await?;
    writer.FlushAsync()?.await?;

    stream.Seek(0)?;

    // Decode PNG into SoftwareBitmap
    let decoder = BitmapDecoder::CreateWithIdAsync(BitmapDecoder::PngDecoderId()?, &stream)?.await?;

    let bitmap = decoder.GetSoftwareBitmapAsync()?.await?;

    // Create OCR engine
    let engine = WindowsOcrEngine::TryCreateFromUserProfileLanguages()?;

    let result = engine.RecognizeAsync(&bitmap)?.await?;

    let mut full_text = String::new();
    let mut ocr_results: Vec<serde_json::Value> = Vec::new();

    let lines = result.Lines()?;
    for line in lines {
        let words = line.Words()?;
        for word in words {
            let text = word.Text()?;
            let text_str = text.to_string();

            if !text_str.is_empty() {
                if !full_text.is_empty() {
                    full_text.push(' ');
                }
                full_text.push_str(&text_str);

                let rect = word.BoundingRect()?;

                ocr_results.push(
                    serde_json::json!({
                    "text": text_str,
                    "left": rect.X.to_string(),
                    "top": rect.Y.to_string(),
                    "width": rect.Width.to_string(),
                    "height": rect.Height.to_string(),
                    "conf": "1.0"  // Windows OCR doesn't provide word-level confidence
                })
                );
            }
        }
    }

    if full_text.is_empty() {
        full_text = result.Text()?.to_string();
    }

    let json_output = serde_json::to_string(&ocr_results).unwrap_or_else(|_| "[]".to_string());

    info!("JSON OUTPUT directly from windows native Code : {:#?}", json_output);

    Ok((full_text, json_output, Some(1.0)))
}
