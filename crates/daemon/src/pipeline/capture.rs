// Capture responsibilities are capture the images and checks the hash if identical skip otherwise we capture the windows
// hash it and checks the windowOCRCache
use base64::{ engine::general_purpose, Engine as _ };
use chrono::{ DateTime, Utc };
use serde::{ Deserialize, Deserializer, Serialize, Serializer };
#[cfg(not(target_os = "macos"))]
use xcap::XCapError;
use xcap::{ Monitor, Window };
use tokio::sync::{ Mutex, mpsc::{ Sender } };
use image::{ DynamicImage, GenericImageView, codecs::jpeg::JpegEncoder };
use std::{
    collections::HashMap,
    error::Error,
    fmt,
    sync::Arc,
    time::{ Duration, Instant, UNIX_EPOCH },
};
use tracing::{ info, error, debug, warn };
use crate::browser_utils::create_url_detector;
use crate::{
    cache::{ cache::FrameComparer, ocr_cache::{ WindowCacheKey, WindowOcrCache } },
    embedding::all_models_exist,
    ocr::{ engine::{ OcrEngine, WindowsOcrEngine } },
    pipeline::monitor::{ SafeMonitor, get_monitor_by_id },
};
use once_cell::sync::Lazy;
use std::collections::HashSet;
use app_core::db::{ Rect };

#[derive(Debug, Clone)]
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

    // Monitor Dimensions
    pub monitor_dimensions: Rect,
}

/// Intermediate structure for window data extracted from platform-specific Window types
struct WindowData {
    app_name: String,
    title: String,
    is_focused: bool,
    process_id: i32,
    window_x: i32,
    window_y: i32,
    window_width: u32,
    window_height: u32,
    image_buffer: image::RgbaImage,
}

#[derive(Debug, Clone)]
pub struct CaptureResult {
    pub image: DynamicImage,
    pub timestamp: Instant,
    /// Wall-clock timestamp captured atomically with the screenshot
    pub captured_at: DateTime<Utc>,
    pub window_ocr_results: Vec<WindowOcrResult>,
}

pub struct MaxAverageFrame {
    pub image: DynamicImage,
    pub window_images: Vec<CapturedWindow>,
    pub image_hash: u64,
    pub timestamp: Instant,
    /// Wall-clock timestamp captured atomically with the screenshot
    pub captured_at: DateTime<Utc>,
    pub result_tx: Sender<CaptureResult>,
    pub monitor_dimensions: Rect,
}

#[derive(Debug, Clone)]
pub struct WindowOcrResult {
    pub image: DynamicImage,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
    pub browser_url: Option<String>,
    pub monitor_dimensions: Rect,
}

pub struct OcrTaskData {
    pub image: DynamicImage,
    pub window_images: Vec<CapturedWindow>,
    pub timestamp: Instant,
    /// Wall-clock timestamp captured atomically with the screenshot
    pub captured_at: DateTime<Utc>,
    pub result_tx: Sender<CaptureResult>,
    pub monitor_dimensions: Rect,
}
const BROWSER_NAMES: [&str; 9] = [
    "chrome",
    "firefox",
    "safari",
    "edge",
    "brave",
    "arc",
    "chromium",
    "vivaldi",
    "opera",
];

#[cfg(target_os = "windows")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Windows Shell Experience Host",
        "Microsoft Text Input Application",
        "Windows Explorer",
        "Program Manager",
        "Microsoft Store",
        "Search",
        "TaskBar",
        // Screenpipe's own UI should never be captured
        "screenpipe",
        "screenpipe - Development",
        "screenpipe beta",
    ])
});

#[cfg(target_os = "windows")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Program Manager",
        "Windows Input Experience",
        "Microsoft Text Input Application",
        "Task View",
        "Start",
        "System Tray",
        "Notification Area",
        "Action Center",
        "Task Bar",
        "Desktop",
    ])
});

fn serialize_image<S>(image: &Option<DynamicImage>, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer
{
    if let Some(image) = image {
        let mut webp_buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut webp_buffer);

        let mut encoder = JpegEncoder::new_with_quality(&mut cursor, 80);

        // Encode the image as WebP
        encoder.encode_image(image).map_err(serde::ser::Error::custom)?;

        // Base64 encode the WebP data
        let base64_string = general_purpose::STANDARD.encode(webp_buffer);

        // Serialize the base64 string
        serializer.serialize_str(&base64_string)
    } else {
        serializer.serialize_none()
    }
}

fn deserialize_image<'de, D>(deserializer: D) -> Result<Option<DynamicImage>, D::Error>
    where D: serde::Deserializer<'de>
{
    // Deserialize the base64 string
    let base64_string: String = serde::Deserialize::deserialize(deserializer)?;

    // Check if the base64 string is empty or invalid
    if base64_string.trim().is_empty() {
        return Ok(None);
    }

    // Decode base64 to bytes
    let image_bytes = general_purpose::STANDARD
        .decode(&base64_string)
        .map_err(serde::de::Error::custom)?;

    // Create a cursor to read from the bytes
    let cursor = std::io::Cursor::new(image_bytes);

    // Decode the JPEG data back into an image
    let image = image::load(cursor, image::ImageFormat::Jpeg).map_err(serde::de::Error::custom)?;
    Ok(Some(image))
}

fn serialize_instant<S>(instant: &Instant, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer
{
    let duration_since_epoch = UNIX_EPOCH.elapsed().map_err(serde::ser::Error::custom)?;
    let instant_duration = duration_since_epoch - instant.elapsed();
    let millis = instant_duration.as_millis();
    serializer.serialize_u128(millis)
}

fn deserialize_instant<'de, D>(deserializer: D) -> Result<Instant, D::Error>
    where D: Deserializer<'de>
{
    let millis: u128 = Deserialize::deserialize(deserializer)?;
    Ok(Instant::now() - Duration::from_millis(millis as u64))
}

#[derive(Debug)]
enum CaptureError {
    NoWindows,
    #[cfg(not(target_os = "macos"))] XCapError(XCapError),
    #[cfg(target_os = "macos")] CaptureBackendError(String),
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CaptureError::NoWindows => write!(f, "No windows found"),
            #[cfg(not(target_os = "macos"))]
            CaptureError::XCapError(e) => write!(f, "XCap error: {}", e),
            #[cfg(target_os = "macos")]
            CaptureError::CaptureBackendError(e) => write!(f, "Capture error: {}", e),
        }
    }
}

impl Error for CaptureError {}

#[cfg(not(target_os = "macos"))]
impl From<XCapError> for CaptureError {
    fn from(error: XCapError) -> Self {
        debug!("XCap error occurred: {}", error);
        CaptureError::XCapError(error)
    }
}

#[derive(Debug)]
pub enum ContinuousCaptureError {
    MonitorNotFound,
    ErrorCapturingScreenshot(String),
    ErrorProcessingOcr(String),
    ErrorSendingOcrResult(String),
}

impl std::fmt::Display for ContinuousCaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

fn get_default_monitor() -> Monitor {
    let monitors = Monitor::all().expect("Failed to get monitors");

    monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .expect("No primary monitor found")
}

#[cfg(not(target_os = "macos"))]
fn get_all_windows() -> Result<Vec<WindowData>, Box<dyn Error>> {
    let windows = Window::all()?;
    Ok(
        windows
            .into_iter()
            .filter_map(|window| {
                let app_name = match window.app_name() {
                    Ok(name) => name.to_string(),
                    Err(e) => {
                        debug!("Failed to get app_name for window: {}", e);
                        return None;
                    }
                };

                let title = match window.title() {
                    Ok(title) => title.to_string(),
                    Err(e) => {
                        debug!("Failed to get title for window {}: {}", app_name, e);
                        return None;
                    }
                };

                if let Ok(is_minimized) = window.is_minimized() {
                    if is_minimized {
                        debug!("Window {} ({}) is_minimized", app_name, title);
                        return None;
                    }
                }

                let is_focused = window.is_focused().unwrap_or(false);
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

                match window.capture_image() {
                    Ok(buffer) =>
                        Some(WindowData {
                            app_name,
                            title,
                            is_focused,
                            process_id,
                            window_x,
                            window_y,
                            window_width,
                            window_height,
                            image_buffer: buffer,
                        }),
                    Err(e) => {
                        debug!(
                            "Failed to capture image for window {} ({}): {}",
                            app_name,
                            title,
                            e
                        );
                        None
                    }
                }
            })
            .collect()
    )
}

pub async fn capture_all_visible_windows(
    monitor: &SafeMonitor
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    let mut all_captured_images = Vec::new();

    // Get windows using the appropriate backend
    let windows_data = get_all_windows()?;

    if windows_data.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    // Build the monitor bounds for window-to-monitor matching
    let monitor_bounds = Rect {
        x: monitor.x(),
        y: monitor.y(),
        width: monitor.width(),
        height: monitor.height(),
    };

    // On non-macOS, fall back to the frontmost PID (no CGWindowList available)
    #[cfg(not(target_os = "macos"))]
    let topmost_pid: Option<i32> = None;

    // Process the captured data
    for window_data in windows_data {
        let WindowData {
            app_name,
            title: window_name,
            is_focused,
            process_id,
            window_x,
            window_y,
            window_width,
            window_height,
            image_buffer,
        } = window_data;

        // Convert to DynamicImage
        let image = DynamicImage::ImageRgba8(image_buffer);

        // Determine if this window should be captured:
        // - capture_unfocused_windows=true: capture ALL valid windows
        // - capture_unfocused_windows=false: capture only the topmost window on
        //   this monitor (using CGWindowList z-order), falling back to focused
        let window_bounds = Rect {
            x: window_x,
            y: window_y,
            width: window_width,
            height: window_height,
        };

        let is_on_this_monitor = window_bounds.overlaps(&monitor_bounds);

        let should_capture = if let Some(top_pid) = topmost_pid {
            // Capture windows belonging to the topmost app on this monitor
            process_id == top_pid && is_on_this_monitor
        } else {
            // Fallback: use focused status (original behavior for non-macOS
            // or when topmost detection fails)
            is_focused && is_on_this_monitor
        };
        // Apply filters
        // Note: Empty window_name/app_name check fixes frame-window mismatch bug where apps like Arc
        // have internal windows with empty titles that create duplicate DB records
        // Also skip system UI elements that have no owning app (empty app_name)
        // Safety-net: always exclude screenpipe's own UI regardless of exact app name variant
        let is_memento_ui = app_name.to_lowercase().contains("memento");
        let is_valid =
            !is_memento_ui &&
            !SKIP_APPS.contains(app_name.as_str()) &&
            !app_name.is_empty() &&
            !window_name.is_empty() &&
            !SKIP_TITLES.contains(window_name.as_str()) &&
            should_capture;

        if is_valid {
            // Fetch browser URL atomically with screenshot for focused browser windows
            // This prevents timing mismatches where URL is fetched after navigation
            let browser_url = if
                is_focused &&
                BROWSER_NAMES.iter().any(|&browser| app_name.to_lowercase().contains(browser))
            {
                let detector = create_url_detector();
                match detector.get_active_url(&app_name, process_id, &window_name) {
                    Ok(url) => url,
                    Err(e) => {
                        debug!("Failed to get browser URL for {}: {}", app_name, e);
                        None
                    }
                }
            } else {
                None
            };

            // Check if URL should be blocked for privacy (e.g., banking sites)
            // Browser URL privacy filtering is handled separately
            // if let Some(ref url) = browser_url { ... }

            // Fallback: For unfocused browser windows where we can't get URL,
            // check if window title suggests it's a blocked site
            let is_browser = BROWSER_NAMES.iter().any(|&browser|
                app_name.to_lowercase().contains(browser)
            );

            if
                is_browser &&
                browser_url.is_none() &&
                !is_focused
                // window_filters.is_title_suggesting_blocked_url(&window_name)
            {
                tracing::info!(
                    "Privacy filter: Skipping unfocused browser window with suspicious title: {}",
                    window_name
                );
                continue;
            }

            all_captured_images.push(CapturedWindow {
                image,
                app_name,
                window_name,
                process_id,
                is_focused,
                browser_url,
                window_x,
                window_y,
                window_width,
                window_height,
                monitor_dimensions: monitor_bounds,
            });
        }
    }

    Ok(all_captured_images)
}

/// Capture only the monitor screenshot (no window capture, no hash).
/// Window capture is deferred until after frame comparison to avoid
/// expensive work on frames that will be skipped.
pub async fn capture_monitor_image(
    monitor: &SafeMonitor
) -> Result<(DynamicImage, Duration), anyhow::Error> {
    let capture_start = Instant::now();
    let image = monitor.capture_image().await.map_err(|e| {
        debug!("failed to capture monitor image: {}", e);
        anyhow::anyhow!("monitor capture failed")
    })?;
    let capture_duration = capture_start.elapsed();
    Ok((image, capture_duration))
}

/// Capture all visible windows on a monitor (called only when frame changed).
pub async fn capture_windows(monitor: &SafeMonitor) -> Vec<CapturedWindow> {
    match capture_all_visible_windows(monitor).await {
        Ok(images) => images,
        Err(e) => {
            warn!("Failed to capture window images: {}. Continuing with empty result.", e);
            Vec::new()
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn continuous_capture(
    result_tx: Sender<CaptureResult>,
    interval: Duration,
    ocr_engine: Arc<WindowsOcrEngine>,
    monitor_id: u32
) -> Result<(), ContinuousCaptureError> {
    let mut frame_counter: u64 = 0;
    let mut max_average: Option<MaxAverageFrame> = None;

    // Initialize optimized frame comparer with all optimizations enabled:
    // - Hash-based early exit for identical frames (30-50% CPU reduction in static scenes)
    // - Downscaled comparison at 640x360 (60-80% faster comparisons)
    // - Single metric (histogram only, 40-50% faster than histogram+SSIM)
    let mut frame_comparer = FrameComparer::new(100, 10);

    // Initialize OCR cache for skipping unchanged windows
    // Cache entries expire after 5 minutes, max 100 windows cached
    let ocr_cache = Arc::new(Mutex::new(WindowOcrCache::new(Duration::from_secs(300), 100)));

    debug!("continuous_capture: Starting using monitor: {:?}", monitor_id);
    // 1. Get monitor (mutable so we can refresh() the cached handle on failure)
    let mut monitor = match get_monitor_by_id(monitor_id).await {
        Some(m) => m,
        None => {
            error!("Monitor not found");
            return Err(ContinuousCaptureError::MonitorNotFound);
        }
    };
    let mut consecutive_capture_failures: u32 = 0;
    const MAX_CAPTURE_RETRIES: u32 = 3;
    const MAX_CONSECUTIVE_FAILURES: u32 = 30;

    loop {
        // 3. Capture monitor screenshot and wall-clock time atomically.
        //    Window capture is deferred until after frame comparison to skip
        //    expensive per-window work on unchanged frames.
        let captured_at = Utc::now();
        let (image, _capture_duration) = {
            let mut last_err = None;
            let mut captured = None;

            for attempt in 0..=MAX_CAPTURE_RETRIES {
                match capture_monitor_image(&monitor).await {
                    Ok(result) => {
                        if attempt > 0 {
                            debug!(
                                "capture succeeded after {} retries for monitor {}",
                                attempt,
                                monitor_id
                            );
                        }
                        consecutive_capture_failures = 0;
                        captured = Some(result);
                        break;
                    }
                    Err(e) => {
                        last_err = Some(e);
                        if attempt < MAX_CAPTURE_RETRIES {
                            // Refresh the cached monitor handle — resolution may have
                            // changed, or the display may have been reconnected.
                            debug!(
                                "capture failed for monitor {} (attempt {}/{}), refreshing handle",
                                monitor_id,
                                attempt + 1,
                                MAX_CAPTURE_RETRIES
                            );
                            if let Err(refresh_err) = monitor.refresh().await {
                                debug!("monitor refresh failed: {}", refresh_err);
                            }
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                    }
                }
            }

            match captured {
                Some(result) => result,
                None => {
                    consecutive_capture_failures += 1;
                    let err = last_err.unwrap();
                    if consecutive_capture_failures >= MAX_CONSECUTIVE_FAILURES {
                        error!(
                            "monitor {} failed {} consecutive captures, bailing: {}",
                            monitor_id,
                            consecutive_capture_failures,
                            err
                        );
                        return Err(
                            ContinuousCaptureError::ErrorCapturingScreenshot(err.to_string())
                        );
                    }
                    debug!(
                        "all {} capture retries failed for monitor {} ({}/{}): {}",
                        MAX_CAPTURE_RETRIES,
                        monitor_id,
                        consecutive_capture_failures,
                        MAX_CONSECUTIVE_FAILURES,
                        err
                    );
                    tokio::time::sleep(interval).await;
                    continue;
                }
            }
        };

        // 4. Optimized frame comparison: downscales once (proportional to preserve
        //    ultrawide aspect ratios), hashes the thumbnail, then compares histograms.
        //    No full-resolution hash or redundant downscale needed.
        let current_diff = frame_comparer.compare(&image);

        // Get skip threshold from adaptive FPS or use default
        #[cfg(feature = "adaptive-fps")]
        let skip_threshold = activity_feed
            .as_ref()
            .map(|f| f.get_capture_params().skip_threshold)
            .unwrap_or(0.02);
        #[cfg(not(feature = "adaptive-fps"))]
        let should_skip = current_diff == 0.0;

        if should_skip {
            debug!(
                "Skipping frame {} due to low difference: {:.3} < {:.3}",
                frame_counter,
                current_diff,
                0.0
            );
            frame_counter += 1;
            // Use adaptive interval if enabled, otherwise use base interval
            #[cfg(feature = "adaptive-fps")]
            let sleep_interval = activity_feed
                .as_ref()
                .map(|f| f.get_capture_params().interval)
                .unwrap_or(interval);
            #[cfg(not(feature = "adaptive-fps"))]
            let sleep_interval = interval;
            tokio::time::sleep(sleep_interval).await;
            continue;
        }

        // 4b. Capture windows only for frames that passed the change threshold.
        //     This avoids expensive per-window screenshots + CGWindowList enumeration
        //     on unchanged frames (major CPU savings on multi-monitor setups).
        let window_images = capture_windows(&monitor).await;
        let monitor_bounds = Rect {
            x: monitor.x(),
            y: monitor.y(),
            width: monitor.width(),
            height: monitor.height(),
        };
        // Track the frame with maximum difference for OCR processing
        max_average = Some(MaxAverageFrame {
            image: image.clone(),
            window_images,
            image_hash: 0, // Hash is now internal to FrameComparer
            timestamp: Instant::now(),
            captured_at,
            result_tx: result_tx.clone(),
            monitor_dimensions: monitor_bounds,
        });

        // 5. Process max average frame if available
        if let Some(max_avg_frame) = max_average.take() {
            if
                let Err(e) = process_max_average_frame(
                    max_avg_frame,
                    ocr_engine.clone(),
                    ocr_cache.clone()
                ).await
            {
                error!("Error processing max average frame: {}", e);
            }
            frame_counter = 0;

            // Log frame comparison stats periodically
            let stats = frame_comparer.stats();
            if stats.total_comparisons.is_multiple_of(100) {
                debug!(
                    "Frame comparison stats: {} total, {} hash hits ({:.1}% hit rate)",
                    stats.total_comparisons,
                    stats.hash_hits,
                    stats.hash_hit_rate * 100.0
                );
            }
        }

        frame_counter += 1;
        // Use adaptive interval if enabled, otherwise use base interval
        #[cfg(feature = "adaptive-fps")]
        let sleep_interval = activity_feed
            .as_ref()
            .map(|f| f.get_capture_params().interval)
            .unwrap_or(interval);
        #[cfg(not(feature = "adaptive-fps"))]
        let sleep_interval = interval;
        tokio::time::sleep(sleep_interval).await;
    }
}

async fn process_max_average_frame(
    max_avg_frame: MaxAverageFrame,
    ocr_engine: Arc<WindowsOcrEngine>,
    ocr_cache: Arc<Mutex<WindowOcrCache>>
) -> Result<(), ContinuousCaptureError> {
    let ocr_task_data = OcrTaskData {
        image: max_avg_frame.image,
        window_images: max_avg_frame.window_images,
        timestamp: max_avg_frame.timestamp,
        captured_at: max_avg_frame.captured_at,
        result_tx: max_avg_frame.result_tx,
        monitor_dimensions: max_avg_frame.monitor_dimensions,
    };

    if let Err(e) = process_ocr_task(ocr_task_data, ocr_engine, ocr_cache).await {
        error!("Error processing OCR task: {}", e);
        return Err(ContinuousCaptureError::ErrorProcessingOcr(e.to_string()));
    }

    Ok(())
}

pub async fn process_ocr_task(
    ocr_task_data: OcrTaskData,
    ocr_engine: Arc<WindowsOcrEngine>,
    ocr_cache: Arc<Mutex<WindowOcrCache>>
) -> Result<(), ContinuousCaptureError> {
    let OcrTaskData {
        image,
        window_images,
        monitor_dimensions,
        timestamp,
        captured_at,
        result_tx,
    } = ocr_task_data;

    let start_time = Instant::now();

    let mut window_ocr_results = Vec::new();
    let mut total_confidence = 0.0;
    let mut window_count = 0;
    let mut cache_hits = 0;
    let mut cache_misses = 0;

    // Get screen dimensions for coordinate transformation
    let (screen_width, screen_height) = image.dimensions();

    for captured_window in window_images {
        // Calculate hash for this window's image
        let window_image_hash = WindowOcrCache::calculate_image_hash(
            captured_window.image.as_bytes()
        );
        let window_id = WindowOcrCache::make_window_id(
            &captured_window.app_name,
            &captured_window.window_name
        );
        let cache_key = WindowCacheKey {
            window_id: window_id.clone(),
            image_hash: window_image_hash,
        };

        // Check cache first
        let cached_result = {
            let mut cache = ocr_cache.lock().await;
            cache.get(&cache_key)
        };

        let ocr_result = if let Some(cached) = cached_result {
            // Cache hit - reuse previous OCR result
            cache_hits += 1;
            debug!("OCR cache hit for window '{}' (hash: {})", window_id, window_image_hash);

            // Still need to transform coordinates for the current position
            let parsed_json = parse_json_output(&cached.text_json);
            let transformed_json = transform_ocr_coordinates_to_screen(
                parsed_json,
                captured_window.window_x,
                captured_window.window_y,
                captured_window.window_width,
                captured_window.window_height,
                screen_width,
                screen_height
            );

            total_confidence += cached.confidence;
            window_count += 1;

            WindowOcrResult {
                image: captured_window.image,
                window_name: captured_window.window_name,
                app_name: captured_window.app_name,
                text: cached.text.clone(),
                text_json: transformed_json,
                focused: captured_window.is_focused,
                confidence: cached.confidence,
                browser_url: captured_window.browser_url,
                monitor_dimensions: captured_window.monitor_dimensions,
            }
        } else {
            // Cache miss - perform OCR
            cache_misses += 1;
            let result = process_window_ocr(
                captured_window,
                ocr_engine.clone(),
                &mut total_confidence,
                &mut window_count,
                screen_width,
                screen_height
            ).await.map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string()))?;

            // Cache the result for future use (serialize JSON for storage)
            {
                let mut cache = ocr_cache.lock().await;
                let json_str = serde_json::to_string(&result.text_json).unwrap_or_default();
                cache.insert(cache_key, result.text.clone(), json_str, result.confidence);
            }

            debug!(
                "Result after processing and transforming the OCR:
                App Name: {},
                Window Name: {},
                text: {},
                focused: {},
                browser_url: {:?},
                ",
                result.app_name,
                result.window_name,
                result.text,
                result.focused,
                result.browser_url
            );

            result
        };

        window_ocr_results.push(ocr_result);
    }

    // Log cache performance
    if cache_hits > 0 || cache_misses > 0 {
        debug!(
            "OCR cache stats : {} hits, {} misses ({:.1}% hit rate)",
            cache_hits,
            cache_misses,
            if cache_hits + cache_misses > 0 {
                ((cache_hits as f64) / ((cache_hits + cache_misses) as f64)) * 100.0
            } else {
                0.0
            }
        );
    }

    // Create and send the result
    let capture_result = CaptureResult {
        image,
        timestamp,
        captured_at,
        window_ocr_results,
    };

    send_ocr_result(&result_tx, capture_result).await.map_err(|e|
        ContinuousCaptureError::ErrorSendingOcrResult(e.to_string())
    )?;

    // Log performance metrics
    log_ocr_performance(start_time, window_count, total_confidence);

    Ok(())
}

async fn process_window_ocr(
    captured_window: CapturedWindow,
    ocr_engine: Arc<WindowsOcrEngine>,
    total_confidence: &mut f64,
    window_count: &mut u32,
    screen_width: u32,
    screen_height: u32
) -> Result<WindowOcrResult, ContinuousCaptureError> {
    // Use the browser URL that was captured atomically with the screenshot
    // This prevents timing mismatches where URL is fetched after browser navigation
    let browser_url = captured_window.browser_url.clone();

    // Perform OCR based on the selected engine
    let (window_text, window_json_output, confidence) = perform_ocr_with_engine(
        ocr_engine,
        &captured_window.image
    ).await.map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string()))?;

    // Update confidence metrics
    if let Some(conf) = confidence {
        *total_confidence += conf;
        *window_count += 1;
    }

    // Parse the OCR JSON and transform coordinates from window-relative to screen-relative
    let parsed_json = parse_json_output(&window_json_output);

    let transformed_json = transform_ocr_coordinates_to_screen(
        parsed_json,
        captured_window.window_x,
        captured_window.window_y,
        captured_window.window_width,
        captured_window.window_height,
        screen_width,
        screen_height
    );

    Ok(WindowOcrResult {
        image: captured_window.image,
        monitor_dimensions: captured_window.monitor_dimensions,
        window_name: captured_window.window_name,
        app_name: captured_window.app_name,
        text: window_text,
        text_json: transformed_json,
        focused: captured_window.is_focused,
        confidence: confidence.unwrap_or(0.0),
        browser_url,
    })
}

async fn perform_ocr_with_engine(
    ocr_engine: Arc<WindowsOcrEngine>,
    image: &DynamicImage
) -> Result<(String, String, Option<f64>), ContinuousCaptureError> {
    ocr_engine
        .process(&image).await
        .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string()))
}

fn parse_json_output(json_output: &str) -> Vec<HashMap<String, String>> {
    let parsed_output: Vec<HashMap<String, String>> = serde_json
        ::from_str(json_output)
        .unwrap_or_else(|e| {
            error!("Failed to parse JSON output: {}", e);
            Vec::new()
        });

    parsed_output
}

async fn send_ocr_result(
    result_tx: &Sender<CaptureResult>,
    capture_result: CaptureResult
) -> Result<(), ContinuousCaptureError> {
    // Add channel health check
    if result_tx.capacity() == 0 {
        warn!("OCR task channel at capacity - receiver may be blocked or slow");
    }

    if let Err(e) = result_tx.send(capture_result).await {
        if e.to_string().contains("channel closed") {
            error!("OCR task channel closed, recording may have stopped: {}", e);
            return Err(
                ContinuousCaptureError::ErrorSendingOcrResult(
                    "Channel closed - recording appears to have stopped".to_string()
                )
            );
        }

        error!("Failed to send OCR result: {}", e);
        return Err(
            ContinuousCaptureError::ErrorSendingOcrResult(
                format!("Failed to send OCR result: {}", e)
            )
        );
    }

    Ok(())
}

fn log_ocr_performance(
    start_time: Instant,
    window_count: u32,
    total_confidence: f64,
) {
    let duration = start_time.elapsed();
    let avg_confidence = if window_count > 0 {
        total_confidence / (window_count as f64)
    } else {
        0.0
    };
    debug!(
        "OCR task processed  Duration {} windows in {:?}, average confidence: {:.2}",
        window_count,
        duration,
        avg_confidence
    );
}

/// Transform OCR coordinates from window-relative (normalized 0-1) to screen-relative (normalized 0-1).
///
/// OCR engines return coordinates normalized to the window image dimensions.
/// This function transforms them to be normalized to the full screen dimensions,
/// which is necessary because the video frames store the full screen capture.
fn transform_ocr_coordinates_to_screen(
    ocr_blocks: Vec<HashMap<String, String>>,
    window_x: i32,
    window_y: i32,
    window_width: u32,
    window_height: u32,
    screen_width: u32,
    screen_height: u32
) -> Vec<HashMap<String, String>> {
    // Skip transformation if dimensions are invalid
    if screen_width == 0 || screen_height == 0 || window_width == 0 || window_height == 0 {
        return ocr_blocks;
    }

    let screen_w = screen_width as f64;
    let screen_h = screen_height as f64;
    let win_x = window_x as f64;
    let win_y = window_y as f64;
    let win_w = window_width as f64;
    let win_h = window_height as f64;

    ocr_blocks
        .into_iter()
        .map(|mut block| {
            // Parse the normalized window coordinates (0-1 range)
            if
                let (Some(left_str), Some(top_str), Some(width_str), Some(height_str)) = (
                    block.get("left").cloned(),
                    block.get("top").cloned(),
                    block.get("width").cloned(),
                    block.get("height").cloned(),
                )
            {
                if
                    let (Ok(left), Ok(top), Ok(width), Ok(height)) = (
                        left_str.parse::<f64>(),
                        top_str.parse::<f64>(),
                        width_str.parse::<f64>(),
                        height_str.parse::<f64>(),
                    )
                {
                    // Transform from window-relative normalized coords to screen-relative normalized coords
                    // screen_coord = (window_offset + window_coord_normalized * window_size) / screen_size
                    let screen_left = (win_x + left * win_w) / screen_w;
                    let screen_top = (win_y + top * win_h) / screen_h;
                    let screen_width_normalized = (width * win_w) / screen_w;
                    let screen_height_normalized = (height * win_h) / screen_h;

                    // Update the block with screen-relative coordinates
                    block.insert("left".to_string(), screen_left.to_string());
                    block.insert("top".to_string(), screen_top.to_string());
                    block.insert("width".to_string(), screen_width_normalized.to_string());
                    block.insert("height".to_string(), screen_height_normalized.to_string());
                }
            }
            block
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RealtimeVisionEvent {
    Ocr(WindowOcr),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowOcr {
    #[serde(serialize_with = "serialize_image", deserialize_with = "deserialize_image")]
    pub image: Option<DynamicImage>,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
    #[serde(serialize_with = "serialize_instant", deserialize_with = "deserialize_instant")]
    pub timestamp: Instant,
    pub browser_url: Option<String>,
}

/// Improved continuous capture with adaptive scheduling and shutdown support
pub async fn continuous_capture_v2(
    result_tx: Sender<CaptureResult>,
    scheduler: crate::throttle::AdaptiveScheduler,
    ocr_engine: Arc<WindowsOcrEngine>,
    ocr_cache: Arc<crate::cache::PersistentOcrCache>,
    privacy_cache: Arc<crate::server::privacy::PrivacyCache>,
    monitor_id: u32,
    shutdown: Arc<crate::core::ShutdownController>,
    lifecycle: Arc<crate::core::DaemonLifecycle>,
) -> Result<(), ContinuousCaptureError> {
    use crate::throttle::ScheduleReason;
    
    let mut frame_counter: u64 = 0;
    let mut frame_comparer = FrameComparer::new(100, 10);
    let mut shutdown_rx = shutdown.subscribe();
    let mut models_missing_logged = false;
    
    debug!("continuous_capture_v2: Starting with adaptive scheduling for monitor: {}", monitor_id);
    
    // Get monitor
    let mut monitor = match get_monitor_by_id(monitor_id).await {
        Some(m) => m,
        None => {
            error!("Monitor {} not found", monitor_id);
            sentry::with_scope(|scope| {
                scope.set_tag("environment", "daemon");
                scope.set_tag("service", "daemon");
                scope.set_tag("area", "capture");
                scope.set_extra("monitor_id", monitor_id.into());
            }, || {
                sentry::capture_message("Capture monitor not found", sentry::Level::Error);
            });
            return Err(ContinuousCaptureError::MonitorNotFound);
        }
    };
    
    let mut consecutive_failures: u32 = 0;
    const MAX_CONSECUTIVE_FAILURES: u32 = 30;
    const MAX_RETRIES: u32 = 3;
    
    loop {
        // Check for shutdown
        if shutdown.is_shutdown_requested() {
            info!("Shutdown requested, stopping capture");
            break;
        }

        // Halt capture when model files are missing. This uses filesystem detection
        // and allows automatic resume once models are restored.
        if !all_models_exist() {
            if !models_missing_logged {
                warn!("Model files are missing; capture is paused until models are available");
                models_missing_logged = true;
            }

            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                _ = shutdown_rx.recv() => break,
            }
            continue;
        }

        if models_missing_logged {
            info!("Model files detected again; resuming capture");
            models_missing_logged = false;
        }
        
        // Get adaptive scheduling parameters
        let schedule = scheduler.get_schedule_params().await;
        
        // Skip capture if scheduler says so
        if !schedule.should_capture {
            debug!(
                "Capture paused due to {:?} (CPU: {:.1}%)",
                schedule.reason,
                schedule.cpu_usage * 100.0
            );
            
            tokio::select! {
                _ = tokio::time::sleep(schedule.interval) => {}
                _ = shutdown_rx.recv() => break,
            }
            continue;
        }
        
        // Log throttling state periodically
        if frame_counter % 60 == 0 && schedule.reason != ScheduleReason::Normal {
            info!(
                "Capture throttled: {:?}, interval: {:?}, CPU: {:.1}%",
                schedule.reason,
                schedule.interval,
                schedule.cpu_usage * 100.0
            );
        }
        
        // Capture monitor screenshot
        let captured_at = chrono::Utc::now();
        let capture_result = {
            let mut last_err = None;
            let mut captured = None;
            
            for attempt in 0..=MAX_RETRIES {
                match capture_monitor_image(&monitor).await {
                    Ok(result) => {
                        consecutive_failures = 0;
                        captured = Some(result);
                        break;
                    }
                    Err(e) => {
                        last_err = Some(e);
                        if attempt < MAX_RETRIES {
                            if let Err(refresh_err) = monitor.refresh().await {
                                debug!("Monitor refresh failed: {}", refresh_err);
                            }
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                    }
                }
            }
            
            match captured {
                Some(result) => result,
                None => {
                    consecutive_failures += 1;
                    let err = last_err.unwrap();
                    
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        error!(
                            "Too many consecutive capture failures ({}), stopping",
                            consecutive_failures
                        );
                        sentry::with_scope(|scope| {
                            scope.set_tag("environment", "daemon");
                            scope.set_tag("service", "daemon");
                            scope.set_tag("area", "capture");
                            scope.set_extra("monitor_id", monitor_id.into());
                            scope.set_extra("consecutive_failures", consecutive_failures.into());
                            scope.set_extra("error", err.to_string().into());
                        }, || {
                            sentry::capture_message("Capture loop failed repeatedly", sentry::Level::Error);
                        });
                        return Err(ContinuousCaptureError::ErrorCapturingScreenshot(
                            err.to_string()
                        ));
                    }
                    
                    tokio::select! {
                        _ = tokio::time::sleep(schedule.interval) => {}
                        _ = shutdown_rx.recv() => break,
                    }
                    continue;
                }
            }
        };
        
        let (image, _capture_duration) = capture_result;
        
        // Frame comparison to skip unchanged frames
        let current_diff = frame_comparer.compare(&image);
        
        if current_diff == 0.0 {
            frame_counter += 1;
            lifecycle.record_skip().await;
            
            tokio::select! {
                _ = tokio::time::sleep(schedule.interval) => {}
                _ = shutdown_rx.recv() => break,
            }
            continue;
        }
        
        // Capture windows (only for changed frames)
        let window_images = capture_windows(&monitor).await;
        let monitor_bounds = Rect {
            x: monitor.x(),
            y: monitor.y(),
            width: monitor.width(),
            height: monitor.height(),
        };
        
        // Process OCR for each window
        let mut window_ocr_results = Vec::new();
        let (screen_width, screen_height) = image.dimensions();
        
        for captured_window in window_images {
            // Privacy check: skip masked apps/websites
            if privacy_cache.should_mask_window(
                &captured_window.app_name, 
                captured_window.browser_url.as_deref()
            ).await {
                debug!(
                    "Skipping masked window: app='{}' url={:?}",
                    captured_window.app_name,
                    captured_window.browser_url
                );
                continue;
            }
            
            // Check OCR cache first
            let window_hash = crate::cache::PersistentOcrCache::calculate_image_hash(
                captured_window.image.as_bytes()
            );
            let window_id = crate::cache::PersistentOcrCache::make_window_id(
                &captured_window.app_name,
                &captured_window.window_name,
            );
            let cache_key = crate::cache::WindowCacheKey {
                window_id: window_id.clone(),
                image_hash: window_hash,
            };
            
            // Try cache first
            if let Some(cached) = ocr_cache.get(&cache_key).await {
                let parsed_json = parse_json_output(&cached.text_json);
                let transformed_json = transform_ocr_coordinates_to_screen(
                    parsed_json,
                    captured_window.window_x,
                    captured_window.window_y,
                    captured_window.window_width,
                    captured_window.window_height,
                    screen_width,
                    screen_height,
                );
                
                window_ocr_results.push(WindowOcrResult {
                    image: captured_window.image,
                    window_name: captured_window.window_name,
                    app_name: captured_window.app_name,
                    text: cached.text,
                    text_json: transformed_json,
                    focused: captured_window.is_focused,
                    confidence: cached.confidence,
                    browser_url: captured_window.browser_url,
                    monitor_dimensions: captured_window.monitor_dimensions,
                });
                continue;
            }
            
            // Cache miss - perform OCR
            match ocr_engine.process(&captured_window.image).await {
                Ok((text, json_output, confidence)) => {
                    let conf = confidence.unwrap_or(0.0);
                    let parsed_json = parse_json_output(&json_output);
                    let transformed_json = transform_ocr_coordinates_to_screen(
                        parsed_json,
                        captured_window.window_x,
                        captured_window.window_y,
                        captured_window.window_width,
                        captured_window.window_height,
                        screen_width,
                        screen_height,
                    );
                    
                    // Cache the result
                    ocr_cache.insert(
                        cache_key,
                        text.clone(),
                        json_output,
                        conf,
                    ).await;
                    
                    window_ocr_results.push(WindowOcrResult {
                        image: captured_window.image,
                        window_name: captured_window.window_name,
                        app_name: captured_window.app_name,
                        text,
                        text_json: transformed_json,
                        focused: captured_window.is_focused,
                        confidence: conf,
                        browser_url: captured_window.browser_url,
                        monitor_dimensions: captured_window.monitor_dimensions,
                    });
                }
                Err(e) => {
                    debug!("OCR failed for window {}: {}", window_id, e);
                }
            }
        }
        
        // Send results
        if !window_ocr_results.is_empty() {
            let capture_result = CaptureResult {
                image,
                timestamp: Instant::now(),
                captured_at,
                window_ocr_results,
            };
            
            // Record the capture in stats
            lifecycle.record_capture().await;
            
            if let Err(e) = result_tx.send(capture_result).await {
                if shutdown.is_shutdown_requested() {
                    break;
                }
                error!("Failed to send capture result: {}", e);
                sentry::with_scope(|scope| {
                    scope.set_tag("environment", "daemon");
                    scope.set_tag("service", "daemon");
                    scope.set_tag("area", "capture");
                    scope.set_extra("error", e.to_string().into());
                }, || {
                    sentry::capture_message("Failed to enqueue capture result", sentry::Level::Error);
                });
            }
        } else {
            // No windows had OCR results - record as skip
            lifecycle.record_skip().await;
        }
        
        frame_counter += 1;
        
        // Log stats periodically
        if frame_counter % 100 == 0 {
            let stats = frame_comparer.stats();
            debug!(
                "Capture stats: frame={}, hash_hit_rate={:.1}%",
                frame_counter,
                stats.hash_hit_rate * 100.0
            );
        }
        
        // Wait with shutdown check
        tokio::select! {
            _ = tokio::time::sleep(schedule.interval) => {}
            _ = shutdown_rx.recv() => break,
        }
    }
    
    info!("Continuous capture stopped after {} frames", frame_counter);
    Ok(())
}
