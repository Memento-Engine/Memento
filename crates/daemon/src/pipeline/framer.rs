use image::{DynamicImage, imageops::FilterType};

pub fn process_image(image: &DynamicImage, scale_factor: u32) -> DynamicImage {
    // 1. DOWNSCALE
    // We divide the current width/height by the scale factor (e.g., 2, 4, 8)
    let n_width = image.width() / scale_factor;
    let n_height = image.height() / scale_factor;

    // Resize it. 
    // FilterType::Triangle is usually a good balance between speed and quality.
    // Nearest is fastest but can look jagged (pixelated).
    let scaled_image = image.resize_exact(n_width, n_height, FilterType::Triangle);

    // 2. GRAYSCALE
    // This converts RGB -> Luma (black and white)
    let gray_image = scaled_image.grayscale();

    gray_image
}