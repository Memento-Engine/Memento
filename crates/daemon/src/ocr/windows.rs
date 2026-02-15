use super::engine::OcrEngine; // YOUR trait

use serde::Serialize;
use windows::Media::Ocr::OcrEngine as WindowsOcrEngine; // Windows API
use windows::Graphics::Imaging::{ BitmapDecoder };
use windows::Storage::Streams::{ DataWriter, InMemoryRandomAccessStream };
use async_trait::async_trait;

use tracing::{ info };

use image::DynamicImage;
use std::io::Cursor;

pub struct WindowsOcr {
    engine: WindowsOcrEngine,
}

#[derive(Debug, Serialize, Clone)]
pub struct OcrWord {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl OcrWord {
   pub  fn is_within_x_range(&self, min_x: usize, max_x: usize) -> bool {
        let center_x = self.x + self.width / 2.0;
        center_x >= (min_x as f32) && center_x <= (max_x as f32)
    }
}

#[derive(Debug, Serialize)]
pub struct OcrLine {
    pub text: String,
    pub words: Vec<OcrWord>,
}

#[derive(Debug, Serialize)]
pub struct OcrResultData {
    pub full_text: String,
    pub lines: Vec<OcrLine>,
}

fn empty_result() -> OcrResultData {
    OcrResultData {
        full_text: String::new(),
        lines: vec![],
    }
}

impl WindowsOcr {
    pub fn new() -> Self {
        let engine = WindowsOcrEngine::TryCreateFromUserProfileLanguages().expect(
            "Failed to create OCR engine"
        );

        Self { engine }
    }
}

#[async_trait]
impl OcrEngine for WindowsOcr {
    async fn process(&self, image: &DynamicImage) -> OcrResultData {
        let engine = &self.engine;

        let mut cursor = Cursor::new(Vec::new());

        if let Err(e) = image.write_to(&mut cursor, image::ImageFormat::Png) {
            eprintln!("Image encoding failed: {:?}", e);
            return empty_result();
        }

        let stream = match InMemoryRandomAccessStream::new() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Stream creation failed: {:?}", e);
                return empty_result();
            }
        };

        let writer = match DataWriter::CreateDataWriter(&stream) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("DataWriter creation failed: {:?}", e);
                return empty_result();
            }
        };

        if let Err(e) = writer.WriteBytes(&cursor.into_inner()) {
            eprintln!("WriteBytes failed: {:?}", e);
            return empty_result();
        }

        if let Err(e) = writer.StoreAsync() {
            eprintln!("StoreAsync creation failed: {:?}", e);
            return empty_result();
        }

        if let Err(e) = writer.FlushAsync() {
            eprintln!("FlushAsync creation failed: {:?}", e);
            return empty_result();
        }

        if let Err(e) = stream.Seek(0) {
            eprintln!("Stream seek failed: {:?}", e);
            return empty_result();
        }

        let decoder = match BitmapDecoder::CreateAsync(&stream) {
            Ok(d) =>
                match d.await {
                    Ok(dec) => dec,
                    Err(e) => {
                        eprintln!("Decoder await failed: {:?}", e);
                        return empty_result();
                    }
                }
            Err(e) => {
                eprintln!("Decoder creation failed: {:?}", e);
                return empty_result();
            }
        };

        let bitmap = match decoder.GetSoftwareBitmapAsync() {
            Ok(b) =>
                match b.await {
                    Ok(bm) => bm,
                    Err(e) => {
                        eprintln!("Bitmap await failed: {:?}", e);
                        return empty_result();
                    }
                }
            Err(e) => {
                eprintln!("Bitmap request failed: {:?}", e);
                return empty_result();
            }
        };

        let result = match engine.RecognizeAsync(&bitmap) {
            Ok(r) =>
                match r.await {
                    Ok(res) => res,
                    Err(e) => {
                        eprintln!("OCR await failed: {:?}", e);
                        return empty_result();
                    }
                }
            Err(e) => {
                eprintln!("OCR request failed: {:?}", e);
                return empty_result();
            }
        };

        let mut result_lines: Vec<OcrLine> = Vec::new();
        let mut full_text: String = String::new();

        if let Ok(lines) = result.Lines() {
            for line in lines {
                let line_text = line
                    .Text()
                    .ok()
                    .map(|t| t.to_string_lossy())
                    .unwrap_or_default();

                full_text.push_str(&line_text);
                full_text.push('\n');

                let mut words_vec = Vec::new();

                if let Ok(words) = line.Words() {
                    for word in words {
                        let text: String = word
                            .Text()
                            .ok()
                            .map(|t| t.to_string_lossy())
                            .unwrap_or_default();

                        let rect = word.BoundingRect().ok();

                        words_vec.push(OcrWord {
                            text,
                            x: rect
                                .as_ref()
                                .map(|r| r.X)
                                .unwrap_or(0.0),
                            y: rect
                                .as_ref()
                                .map(|r| r.Y)
                                .unwrap_or(0.0),
                            width: rect
                                .as_ref()
                                .map(|r| r.Width)
                                .unwrap_or(0.0),
                            height: rect
                                .as_ref()
                                .map(|r| r.Height)
                                .unwrap_or(0.0),
                        });
                    }
                }

                result_lines.push(OcrLine {
                    text: line_text,
                    words: words_vec,
                });
            }
        }

        return OcrResultData {
            full_text,
            lines: result_lines,
        };
    }
}
