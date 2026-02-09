use async_trait::async_trait;
use image::DynamicImage;

#[async_trait]
pub trait OcrEngine: Send + Sync {
    async fn process(&self, image: &DynamicImage) -> String;
}
