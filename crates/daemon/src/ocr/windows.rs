use super::engine::OcrEngine; // YOUR trait

use windows::Media::Ocr::OcrEngine as WindowsOcrEngine; // Windows API
use windows::Graphics::Imaging::{BitmapDecoder, SoftwareBitmap};
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
use async_trait::async_trait;

use image::DynamicImage;
use std::io::Cursor;

pub struct WindowsOcr;

#[async_trait]
impl OcrEngine for WindowsOcr {
    async fn process(&self, image: &DynamicImage) -> String {

        let engine = match WindowsOcrEngine::TryCreateFromUserProfileLanguages() {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Failed to create OCR engine: {:?}", e);
                return String::new();
            }
        };

        let mut cursor = Cursor::new(Vec::new());

        if let Err(e) = image.write_to(&mut cursor, image::ImageFormat::Png) {
            eprintln!("Image encoding failed: {:?}", e);
            return String::new();
        }

        let stream = match InMemoryRandomAccessStream::new() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Stream creation failed: {:?}", e);
                return String::new();
            }
        };

        let writer = match DataWriter::CreateDataWriter(&stream) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("DataWriter creation failed: {:?}", e);
                return String::new();
            }
        };

        if let Err(e) = writer.WriteBytes(&cursor.into_inner()) {
            eprintln!("WriteBytes failed: {:?}", e);
            return String::new();
        }

        if let Err(e) = writer.StoreAsync() {
            eprintln!("StoreAsync creation failed: {:?}", e);
            return String::new();
        }

        if let Err(e) = writer.FlushAsync() {
            eprintln!("FlushAsync creation failed: {:?}", e);
            return String::new();
        }

        if let Err(e) = stream.Seek(0) {
            eprintln!("Stream seek failed: {:?}", e);
            return String::new();
        }

        let decoder = match BitmapDecoder::CreateAsync(&stream) {
            Ok(d) => match d.await {
                Ok(dec) => dec,
                Err(e) => {
                    eprintln!("Decoder await failed: {:?}", e);
                    return String::new();
                }
            },
            Err(e) => {
                eprintln!("Decoder creation failed: {:?}", e);
                return String::new();
            }
        };

        let bitmap = match decoder.GetSoftwareBitmapAsync() {
            Ok(b) => match b.await {
                Ok(bm) => bm,
                Err(e) => {
                    eprintln!("Bitmap await failed: {:?}", e);
                    return String::new();
                }
            },
            Err(e) => {
                eprintln!("Bitmap request failed: {:?}", e);
                return String::new();
            }
        };

        let result = match engine.RecognizeAsync(&bitmap) {
            Ok(r) => match r.await {
                Ok(res) => res,
                Err(e) => {
                    eprintln!("OCR await failed: {:?}", e);
                    return String::new();
                }
            },
            Err(e) => {
                eprintln!("OCR request failed: {:?}", e);
                return String::new();
            }
        };

        let mut full_text = String::new();

        match result.Lines() {
            Ok(lines) => {
                for line in lines {
                    if let Ok(text) = line.Text() {
                        full_text.push_str(&text.to_string_lossy());
                        full_text.push(' ');
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to get lines: {:?}", e);
                return String::new();
            }
        }

        full_text
    }
}
