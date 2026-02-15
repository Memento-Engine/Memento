use async_trait::async_trait;
use image::DynamicImage;

use crate::ocr::windows::OcrResultData;

#[async_trait]
pub trait OcrEngine: Send + Sync {
    async fn process(&self, image: &DynamicImage) -> OcrResultData;
}
