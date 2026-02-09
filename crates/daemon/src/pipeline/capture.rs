use std::time::{ SystemTime, UNIX_EPOCH };

use tokio::sync::mpsc::{ Sender, Receiver };
use active_win_pos_rs::get_active_window;
use image::DynamicImage;
use xcap::Monitor;


#[derive(Debug)]
pub struct WindowMetadata {
    app_name: String,
    window_title: String,
}

impl WindowMetadata {
    pub fn new(app_name: String, window_title: String) -> Self {
        Self { app_name, window_title }
    }

    pub fn app_name(&self) -> &str {
        &self.app_name
    }

    pub fn window_title(&self) -> &str {
        &self.window_title
    }
}

#[derive(Debug)]
pub struct MetaData {
    window_meta: WindowMetadata,
    file_name: String,
}

impl MetaData {
    pub fn new(window_meta: WindowMetadata, file_name: String) -> Self {
        Self { window_meta, file_name }
    }

    pub fn window_meta(&self) -> &WindowMetadata {
        &self.window_meta
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }
}

pub struct CaptureMetaData {
    image: DynamicImage,
    image_meta_data: MetaData,
}

impl CaptureMetaData {
    pub fn new(image: DynamicImage, image_meta_data: MetaData) -> Self {
        Self { image, image_meta_data }
    }

    // Getter for image (read-only)
    pub fn image(&self) -> &DynamicImage {
        &self.image
    }

    // Getter for metadata
    pub fn metadata(&self) -> &MetaData {
        &self.image_meta_data
    }
}

fn get_window_meta_data() -> WindowMetadata {
    match get_active_window() {
        Ok(window) =>
            WindowMetadata {
                app_name: window.app_name,
                window_title: window.title,
            },
        Err(()) =>
            WindowMetadata {
                app_name: "Unknown".to_string(),
                window_title: "Unknown".to_string(),
            },
    }
}

fn get_primary_monitor() -> Monitor {
    Monitor::all().expect("Failed to get monitors").into_iter().next().expect("No monitor found!")
}

fn build_capture_metadata(image_buffer: impl Into<DynamicImage>) -> CaptureMetaData {
    let timestamp = current_timestamp();

    let dynamic: DynamicImage = image_buffer.into();

    let window_meta = get_window_meta_data();

    let meta_data = MetaData {
        file_name: format!("watcher/{}.png", timestamp),
        window_meta,
    };

    CaptureMetaData {
        image: dynamic,
        image_meta_data: meta_data,
    }
}

fn current_timestamp() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).expect("Time went backwards").as_millis()
}

pub fn capture(tx: Sender<CaptureMetaData>) {
    let primary_monitor = get_primary_monitor();

    println!("Capturing screen: {}", primary_monitor.name().unwrap_or("Unknown Display".into()));

    loop {
        println!("Watching Screen...");

        if let Ok(image_buffer) = primary_monitor.capture_image() {
            let capture_meta = build_capture_metadata(image_buffer);

            if let Err(err) = tx.try_send(capture_meta) {
                eprintln!("Channel full or disconnected: {:?}", err);
            }
        }
    }
}
