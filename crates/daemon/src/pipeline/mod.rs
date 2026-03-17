// Screen capture pipeline with adaptive scheduling and OCR processing
pub mod capture;
pub mod monitor;
pub mod processor;
pub mod processing_ocr_results;

// Re-export commonly used items
pub use capture::{CaptureResult, CapturedWindow, WindowOcrResult};
pub use processor::OcrProcessor;
