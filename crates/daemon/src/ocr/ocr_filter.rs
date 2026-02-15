use strsim::levenshtein;
use std::cmp::Ordering; // Import Ordering
use tracing::info;
use crate::ocr::windows::OcrWord; // Assuming this is where your struct lives

// --- Algorithms ---

/// STEP 2: The "XY-Cut" Algorithm (Histogram Analysis)
/// Returns the (min_x, max_x) of the MAIN CONTENT column.
pub fn find_main_content_column(words: &[OcrWord], page_width: usize, page_height: usize) -> (f32, f32) {
    if words.is_empty() || page_width == 0 {
        return (0.0, page_width as f32);
    }

    // Heuristic: Resolution independence. 
    // If page is 1000px wide, min gap is 20px. If 3000px, min gap is 60px.
    let min_gap_width = (page_width as f32 * 0.02).max(10.0) as usize; 
    
    // Heuristic: Noise Threshold.
    // We consider a column "empty" even if it has a few pixels of noise.
    // This handles stray specks or very thin vertical separator lines.
    // If less than 1% of the page height is occupied at x, it's a gap.
    let noise_threshold = (page_height as f32 * 0.01).max(5.0) as usize;

    let mut histogram = vec![0; page_width];

    // --- Step 1: Intelligent Filtering ---
    let valid_words = words.iter().filter(|w| {
        // 1. Filter huge spanning elements (banners)
        let is_too_wide = w.width > (page_width as f32) * 0.5;
        // 2. Filter tiny noise (often " . " or specks that confuse layout)
        let is_noise = w.width < 3.0 && w.height < 3.0; 
        
        !is_too_wide && !is_noise
    });

    // --- Step 2: Build Histogram ---
    for word in valid_words {
        let start = word.x.max(0.0) as usize;
        let end = (word.x + word.width).min(page_width as f32) as usize;
        
        // Clamp to page bounds
        let start = start.min(page_width - 1);
        let end = end.min(page_width);

        for i in start..end {
            histogram[i] += 1;
        }
    }

    // --- Step 3: Find Gaps (with Noise Tolerance) ---
    let mut gaps = Vec::new();
    let mut current_gap_start = None;

    for (x, &density) in histogram.iter().enumerate() {
        // CRITICAL FIX: Check <= threshold, not == 0
        if density <= noise_threshold {
            if current_gap_start.is_none() {
                current_gap_start = Some(x);
            }
        } else {
            // We hit a wall of text
            if let Some(start) = current_gap_start {
                if x - start > min_gap_width {
                    gaps.push((start, x));
                }
                current_gap_start = None;
            }
        }
    }
    
    // Check for edge gap
    if let Some(start) = current_gap_start {
        if page_width - start > min_gap_width {
            gaps.push((start, page_width));
        }
    }

    // --- Step 4: Identify Main Column ---
    if gaps.is_empty() {
        info!("Layout Analysis: No vertical gaps found. Returning full page.");
        return (0.0, page_width as f32);
    }

    // We effectively have columns *between* the gaps.
    // Let's invert gaps to find "Content Blocks"
    let mut content_blocks = Vec::new();
    let mut last_edge = 0;
    
    for (gap_start, gap_end) in gaps {
        // There is a content block between the last gap end and this gap start
        if gap_start > last_edge {
            let width = gap_start - last_edge;
            // Filter out super thin columns (often just vertical separators detected as content)
            if width > min_gap_width {
                content_blocks.push((last_edge, gap_start));
            }
        }
        last_edge = gap_end;
    }
    
    // Check right-most content
    if page_width > last_edge {
        let width = page_width - last_edge;
        if width > min_gap_width {
            content_blocks.push((last_edge, page_width));
        }
    }

    // Strategy: Pick the Widest Column (safest for docs)
    // Alternative Strategy: Pick "Central" column if widths are similar
    let best_col = content_blocks.into_iter()
        .max_by_key(|&(start, end)| end - start)
        .unwrap_or((0, page_width));

    info!("Layout Analysis: Main Column Detected: {}-{}", best_col.0, best_col.1);
    
    (best_col.0 as f32, best_col.1 as f32)
}
/// STEP 3: Geometric Line Stitching - Returns lines with position data
fn cluster_into_lines(mut words: Vec<OcrWord>) -> Vec<LineInfo> {
    // --- CRITICAL FIX: Use total_cmp to prevent Sort Panic ---
    words.sort_by(|a, b| {
        let y_diff = (a.y - b.y).abs();
        
        // If words are on roughly the same line (within 10px Y-diff)
        if y_diff < 10.0 {
            // Sort Left-to-Right
            a.x.total_cmp(&b.x)
        } else {
            // Sort Top-to-Bottom
            a.y.total_cmp(&b.y)
        }
    });

    let mut lines = Vec::new();
    let mut current_line_words: Vec<OcrWord> = Vec::new();
    let mut last_y = -100.0;
    let mut last_h = 0.0;

    for word in words {
        // If this word is far below the previous one, start a new line
        if (word.y - last_y).abs() > (last_h * 0.5_f32).max(10.0_f32) {
            if !current_line_words.is_empty() {
                let line_info = LineInfo::from_words(&current_line_words);
                lines.push(line_info);
            }
            current_line_words = Vec::new();
            last_y = word.y;
            last_h = word.height;
        }
        current_line_words.push(word);
    }
    
    // Push the last line
    if !current_line_words.is_empty() {
        let line_info = LineInfo::from_words(&current_line_words);
        lines.push(line_info);
    }

    lines
}

/// Structure to hold line text with positional metadata
#[derive(Debug, Clone)]
pub struct LineInfo {
    pub text: String,
    pub y: f32,
    pub y_end: f32,
    pub x: f32,
    pub x_end: f32,
    pub height: f32,
    pub width: f32,
}

impl LineInfo {
    fn from_words(words: &[OcrWord]) -> Self {
        let text = words
            .iter()
            .map(|w| w.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        let x = words.iter().map(|w| w.x).fold(f32::INFINITY, f32::min);
        let x_end = words.iter().map(|w| w.x + w.width).fold(0.0, f32::max);
        let y = words.iter().map(|w| w.y).fold(f32::INFINITY, f32::min);
        let y_end = words.iter().map(|w| w.y + w.height).fold(0.0, f32::max);

        LineInfo {
            text,
            y,
            y_end,
            x,
            x_end,
            height: y_end - y,
            width: x_end - x,
        }
    }
}

// --- The Main Pipeline ---

pub fn process_ocr_pipeline(raw_words: Vec<OcrWord>, page_width: usize, page_height: usize) -> Vec<LineInfo> {
    // --- STEP 1: Layout Analysis (XY-Cut) ---
    let (col_min, col_max) = find_main_content_column(&raw_words, page_width, page_height);

    // Filter words: Only keep those strictly inside the main column
    // Helper closure to check range since we can't add methods to your OcrWord struct
    let is_within_x_range = |w: &OcrWord, min: f32, max: f32| -> bool {
        let center = w.x + (w.width / 2.0);
        center >= min && center <= max
    };

    let mut main_content_words: Vec<OcrWord> = raw_words
        .into_iter()
        .filter(|w| is_within_x_range(w, col_min, col_max))
        .collect();

    // --- STEP 2: Cleaning (Typos) ---
    let known_entities = vec!["Facebook", "Atlassian", "Monorepo", "Git LFS"];

    for word in &mut main_content_words {
        // Simple optimization: only check words with special chars
        if word.text.chars().any(|c| !c.is_alphanumeric()) {
            let mut best_match = word.text.clone();
            let mut best_score = usize::MAX;

            for entity in &known_entities {
                let dist = levenshtein(&word.text, entity);
                if dist <= 2 && dist < best_score {
                    best_score = dist;
                    best_match = entity.to_string();
                }
            }
            if best_match != word.text {
                word.text = best_match;
            }
        }
    }

    // --- STEP 3: Line Stitching ---
    let lines: Vec<LineInfo> = cluster_into_lines(main_content_words);

    info!("Lines After Processing OCR Pipeline : {:#?}", lines);

    // --- STEP 4: Paragraph Assembly ---
    // let paragraphs = assemble_paragraphs(&lines);
    // paragraphs

    lines
}

/// STEP 4: Paragraph Assembly using geometric data
fn assemble_paragraphs(lines: &[LineInfo]) -> Vec<String> {
    if lines.is_empty() {
        return vec![];
    }

    let mut paragraphs = Vec::new();
    let mut current_para: Vec<&LineInfo> = Vec::new();

    let avg_line_height: f32 = lines.iter().map(|l| l.height).sum::<f32>() / (lines.len() as f32);
    let para_spacing_threshold = avg_line_height * 1.5;

    for line in lines {
        if current_para.is_empty() {
            current_para.push(line);
            continue;
        }

        let prev_line = current_para.last().unwrap();
        let vertical_gap = line.y - prev_line.y_end;

        // New paragraph logic:
        // 1. Large vertical gap
        // 2. Indentation
        // 3. Previous line was very short (likely heading or end of sentence)
        let is_new_paragraph = vertical_gap > para_spacing_threshold
            || (line.x - prev_line.x) > (avg_line_height * 0.5)
            || (prev_line.width < (avg_line_height * 5.0) && vertical_gap > avg_line_height * 0.8);

        if is_new_paragraph {
            let para_text = current_para
                .iter()
                .map(|l| l.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            paragraphs.push(para_text);
            current_para.clear();
        }

        current_para.push(line);
    }

    if !current_para.is_empty() {
        let para_text = current_para
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        paragraphs.push(para_text);
    }

    paragraphs
}

// Keep your original cluster_into_lines_simple for backward compatibility
pub fn cluster_into_lines_simple(words: Vec<OcrWord>) -> Vec<String> {
    let lines_with_pos: Vec<LineInfo> = cluster_into_lines(words);
    lines_with_pos
        .into_iter()
        .map(|l| l.text)
        .collect()
}