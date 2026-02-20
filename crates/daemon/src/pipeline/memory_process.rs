use chrono::{ DateTime, Utc };
use regex::Regex;
use serde::Serialize;

use crate::{ocr::ocr_filter::LineInfo, pipeline::capture::CapturedWindow};

#[derive(Debug, Serialize, Clone)]
pub struct ScreenMemory {
    // 1. The Container (Who, When, Where)
    pub timestamp: DateTime<Utc>,
    pub app_name: String, // "Code", "Chrome", "Slack"
    pub window_title: String, // "main.rs - Project", "Inbox (2) - Gmail"

    // 2. The Content (Agnostic List of Data)
    // We don't force a schema. We store "Heavy Text" blocks.
    pub text_blocks: Vec<TextBlock>,

    // 3. Derived Tags (For Filtering)
    // We calculate these during processing: ["#code", "#email", "#urgent"]
    pub tags: Vec<String>,

    pub p_hash: u64,

    /// Window position and size on screen for coordinate transformation
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,

    pub process_id: i32,
    pub is_focused: bool,
    /// Browser URL captured atomically with the screenshot to prevent timing mismatches
    pub browser_url: Option<String>,
    pub image_path : String
}

#[derive(Debug, Serialize, Clone)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Serialize, Clone)]
pub struct TextBlock {
    pub text: String,
    // "Content" = The big paragraph
    // "Meta" = "Sent by Pavan", "Ln 42, Col 1"
    pub role: BlockRole,
    pub bbox: BoundingBox,
}

#[derive(Debug, Serialize, Clone)]
pub enum BlockRole {
    Content, // The signal (keep this for embeddings)
    Meta, // Context (keep for display, ignore for embeddings)
    Noise, // Trash (delete before DB)
    Genearl,
}

impl BlockRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            BlockRole::Content => "content",
            BlockRole::Meta => "meta",
            BlockRole::Noise => "noise",
            BlockRole::Genearl => "general",
        }
    }
}

pub fn process_screen_memory(
    raw_paragraphs: Vec<LineInfo>,
    captured_window : CapturedWindow
) -> ScreenMemory {
    let mut clean_blocks = Vec::new();
    let mut inferred_tags = Vec::new();

    // 1. Universal Noise Patterns (Regex)
    // Matches: "10:42 AM", "Battery", "Ln 1, Col 1", "UTF-8", "Search"
    let re_system_trash = Regex::new(
        r"(?i)^(\d{1,2}:\d{2}|Ln \d+|Col \d+|UTF-8|ENG|Search|Menu|File|Edit|View|Help|window|tab)$"
    ).unwrap();

    // Matches: OCR artifacts like "o", "x", "vv", "|", "—"
    let re_ocr_garbage = Regex::new(r"^[\W\d\w]{1,2}$").unwrap();

    // 2. Iterate and Classify
    for p in raw_paragraphs {
        let text = p.text.trim().to_lowercase();

        // FILTER 1: Skip Empty or Garbage
        if text.len() < 2 || re_ocr_garbage.is_match(&text) {
            continue;
        }

        // FILTER 2: Classify as Noise/Meta
        if re_system_trash.is_match(&text) {
            // It's technically "text", but it's UI noise.
            // Option: Store it as 'Noise' or discard it. Let's discard.
            continue;
        }

        // FILTER 3: Determine "Role" based on length/density
        let role = if text.len() > 30 {
            // Long text is almost always Content (Email body, Code block)
            BlockRole::Content
        } else if
            text
                .chars()
                .filter(|c| c.is_alphabetic())
                .count() > 3
        {
            // Short meaningful text (Subject lines, Filenames, Chat messages)
            BlockRole::Meta
        } else {
            // "v", ">>", "..."
            continue;
        };

        // 3. Auto-Tagging (The "Smarts")
        // We add tags based on keywords found in the TEXT, not the app
        let lower = text.to_lowercase();
        if lower.contains("function") || lower.contains("pub fn") || lower.contains("impl") {
            if !inferred_tags.contains(&"#code".to_string()) {
                inferred_tags.push("#code".to_string());
            }
        }
        if lower.contains("dear") || lower.contains("regards") || lower.contains("sent:") {
            if !inferred_tags.contains(&"#email".to_string()) {
                inferred_tags.push("#email".to_string());
            }
        }
        if lower.contains("offer") && lower.contains("salary") {
            if !inferred_tags.contains(&"#job_offer".to_string()) {
                inferred_tags.push("#job_offer".to_string());
            }
        }

        clean_blocks.push(TextBlock {
            text: text.to_string().to_lowercase(),
            role,
            bbox: BoundingBox { x: p.x, y: p.y, width: p.width, height: p.height },
        });
    }

    // 4. Structural Merge (Optional but recommended)
    // If we have two "Content" blocks right next to each other, merge them?
    // For now, let's keep them distinct to preserve list structures.

    ScreenMemory {
        p_hash: captured_window.image_hash,
        browser_url : captured_window.browser_url,
        is_focused : captured_window.is_focused,
        process_id : captured_window.process_id,
        window_height : captured_window.window_height,
        window_width : captured_window.window_width,
        window_x : captured_window.window_x,
        window_y : captured_window.window_y,
        timestamp: chrono::Utc::now(),
        app_name : captured_window.app_name,
        window_title : captured_window.window_name,
        text_blocks: clean_blocks,
        tags: inferred_tags,
        image_path : captured_window.image_path
    }
}
