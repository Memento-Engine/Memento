use app_core::config::memories_dir;
use chrono::{ Utc };
use xcap::{ Window };
use tokio::sync::{ Mutex, mpsc::{ Sender } };
use image::DynamicImage;
use std::{ error::Error, sync::Arc };
use tracing::{ info, error };
use crate::cache::{ cache::FramesCache, phash::compute_hash };

pub struct CapturedWindow {
    pub image: DynamicImage,
    pub app_name: String,
    pub window_name: String,
    pub process_id: i32,
    pub is_focused: bool,
    /// Browser URL captured atomically with the screenshot to prevent timing mismatches
    pub browser_url: Option<String>,
    /// Window position and size on screen for coordinate transformation
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,
    pub image_hash: u64,
    pub image_path: String,
}

pub async fn continues_capture_windows(
    frames_cache: Arc<Mutex<FramesCache>>,
    capture_tx: Sender<CapturedWindow>
) -> Result<(), Box<dyn Error>> {
    let windows = Window::all()?;

    for window in windows {
        let app_name = match window.app_name() {
            Ok(name) => name.to_string(),
            Err(e) => {
                info!("Failed to get app_name for window: {}", e);
                continue;
            }
        };

        let title = match window.title() {
            Ok(title) => title.to_string(),
            Err(e) => {
                info!("Failed to get title for window {}: {}", app_name, e);
                continue;
            }
        };

        if window.is_minimized().unwrap_or(false) {
            info!("Window {} ({}) is minimized", app_name, title);
            continue;
        }

        let is_focused = window.is_focused().unwrap_or(false);

        if !is_focused {
            continue;
        }

        let process_id = window
            .pid()
            .map(|p| p as i32)
            .unwrap_or(-1);

        let (window_x, window_y, window_width, window_height) = (
            window.x().unwrap_or(0),
            window.y().unwrap_or(0),
            window.width().unwrap_or(0),
            window.height().unwrap_or(0),
        );

        let buffer = match window.capture_image() {
            Ok(buffer) => buffer,
            Err(e) => {
                info!("Failed to capture image for window {} ({}): {}", app_name, title, e);
                continue;
            }
        };

        let dyn_img: DynamicImage = buffer.into();

        let image_hash = compute_hash(&dyn_img);

        let should_skip = {
            let mut cache = frames_cache.lock().await;
            cache.should_skip(image_hash)
        }; // unlocked immediately

        if should_skip {
            info!("Frame Cache hit.");
            continue;
        }

        info!("Frame Cache missed.");

        let memories_path = memories_dir();

        if let Err(e) = std::fs::create_dir_all(&memories_path) {
            error!("Failed to create memories folder: {:?}", e);
        }

        let mut image_path = memories_path.clone();
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");

        image_path.push(format!("{}_{}.png", image_hash, timestamp));

        if let Err(e) = dyn_img.save(&image_path) {
            error!("Failed to save image: {:?}", e);
        }

        let captured_window = CapturedWindow {
            app_name,
            window_name: title,
            is_focused,
            process_id,
            window_x,
            window_y,
            window_width,
            window_height,
            browser_url: None,
            image: dyn_img,
            image_hash,
            image_path: image_path.to_string_lossy().to_string(),
        };
        if let Err(e) = capture_tx.try_send(captured_window) {
            error!("Failed to send image to queue: {:?}", e);
            continue;
        }
    }

    Ok(())
}
