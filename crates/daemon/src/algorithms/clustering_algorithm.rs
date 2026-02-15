// use std::cmp::Ordering;

// /// Groups words into paragraphs and returns them as a list of strings.
// /// Each string represents one paragraph.
// pub fn simple_clustering(mut words: Vec<SmartWord>) -> Vec<String> {
//     if words.is_empty() {
//         return Vec::new();
//     }

//     // 1. Sort words: Top-to-bottom, then Left-to-right
//     words.sort_by(|a, b| {
//         let a_y = a.geometry.min_y();
//         let b_y = b.geometry.min_y();
        
//         // If words are roughly on the same vertical level (within 5.0 units), sort by X
//         if (a_y - b_y).abs() < 5.0 {
//             a.geometry.min_x().partial_cmp(&b.geometry.min_x()).unwrap_or(Ordering::Equal)
//         } else {
//             a_y.partial_cmp(&b_y).unwrap_or(Ordering::Equal)
//         }
//     });

//     // 2. Calculate thresholds based on median line height
//     let line_heights: Vec<f32> = words.iter().map(|w| w.geometry.height()).collect();
//     let median_height = median(&line_heights).unwrap_or(12.0);
    
//     // Thresholds
//     let same_line_tolerance = median_height * 0.5; 
//     let new_paragraph_threshold = median_height * 1.5; 

//     let mut paragraphs: Vec<String> = Vec::new();
//     let mut current_paragraph_text = String::new();
    
//     // Track position of the previous word to determine spacing
//     let mut last_word_max_x = -1.0;
//     let mut last_word_y = words[0].geometry.min_y();
//     let mut last_line_bottom = words[0].geometry.max_y();

//     for word in words {
//         let word_y = word.geometry.min_y();
//         let word_height = word.geometry.height();
        
//         // Calculate vertical gap from the previous word/line
//         let vertical_gap = (word_y - last_word_y).abs();
//         let gap_from_prev_line = word_y - last_line_bottom;

//         if current_paragraph_text.is_empty() {
//             // Start of the very first paragraph
//             current_paragraph_text.push_str(&word.text);
//         } else if vertical_gap <= same_line_tolerance {
//             // CASE: Same Line
//             // Check horizontal distance for space insertion (standard word spacing)
//             let horizontal_gap = word.geometry.min_x() - last_word_max_x;
//             if horizontal_gap > 2.0 { // Arbitrary small value for "needs a space"
//                 current_paragraph_text.push(' ');
//             }
//             current_paragraph_text.push_str(&word.text);
            
//             // Update line tracking
//             last_line_bottom = last_line_bottom.max(word.geometry.max_y());

//         } else {
//             // CASE: New Line
//             // Check if this new line is far enough down to be a NEW PARAGRAPH
//             if gap_from_prev_line > new_paragraph_threshold {
//                 // Push the finished paragraph and start a new one
//                 paragraphs.push(current_paragraph_text);
//                 current_paragraph_text = String::from(&word.text);
//             } else {
//                 // Just a new line within the same paragraph. 
//                 // Add a space to separate the last word of prev line and first of new line.
//                 current_paragraph_text.push(' '); 
//                 current_paragraph_text.push_str(&word.text);
//             }
            
//             // Update line tracking for the new line
//             last_line_bottom = word.geometry.max_y();
//         }

//         // Update trackers for the next iteration
//         last_word_max_x = word.geometry.max_x();
//         last_word_y = word_y;
//     }

//     // Don't forget to add the final paragraph being built
//     if !current_paragraph_text.is_empty() {
//         paragraphs.push(current_paragraph_text);
//     }

//     paragraphs
// }

// fn median(numbers: &[f32]) -> Option<f32> {
//     if numbers.is_empty() {
//         return None;
//     }
//     let mut sorted = numbers.to_vec();
//     sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
//     let mid = sorted.len() / 2;
//     if sorted.len() % 2 == 0 {
//         Some((sorted[mid - 1] + sorted[mid]) / 2.0)
//     } else {
//         Some(sorted[mid])
//     }
// }