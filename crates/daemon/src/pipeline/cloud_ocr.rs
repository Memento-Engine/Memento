use anyhow::{ anyhow, Result };
use image::{ codecs::png::PngEncoder, DynamicImage, ImageEncoder };
use reqwest::multipart::{ Form, Part };
use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::io::Cursor;
use std::io::Read;
use std::io::Write;
use std::path::PathBuf;
use tempfile::NamedTempFile;
use tokio::time::{ timeout, Duration };

pub async fn unstructured_chunking(image: &DynamicImage) -> Result<Vec<String>> {
    let client = Client::new();
    // let api_key = env::var("UNSTRUCTURED_API_KEY").map_err(|_| anyhow!("Missing API key"))?;
    // let api_key = "K1hlQPdCnCRFTR0ov601JkGTfm4eOe";

    // Convert image into PNG bytes
    let mut buffer = Vec::new();

    image.write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageFormat::Png)?;

    // Prepare multipart form
    let form = reqwest::multipart::Form
        ::new()
        .part("files", Part::bytes(buffer).file_name("image.png").mime_str("image/png")?)
        .text("chunking_strategy", "by_similarity")
        .text("similarity_threshold", "0.5")
        .text("max_characters", "300")
        .text("output_format", "application/json");

    // Send request
    let response = client
        .post("https://api.unstructuredapp.io/general/v0/general")
        .header("accept", "application/json")
        .header("unstructured-api-key", "K1hlQPdCnCRFTR0ov601JkGTfm4eOe")
        .multipart(form)
        .send().await?;

    if response.status().is_success() {
        let chunks = response.json::<Vec<Value>>().await?;

        let texts = chunks
            .iter()
            .filter_map(|c| c["text"].as_str().map(String::from))
            .collect();

        Ok(texts)
    } else {
        Err(anyhow!("Error: {}", response.status()))
    }
}
