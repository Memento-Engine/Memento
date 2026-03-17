use std::{ collections::{ VecDeque } };
use image::DynamicImage;
use image_hasher::{ HashAlg, Hasher, HasherConfig, ImageHash };
use tracing::{ debug };

/// Statistics about frame comparison performance.
#[derive(Debug, Clone)]
pub struct FrameComparisonStats {
    pub total_comparisons: u64,
    pub hash_hits: u64,
    pub hash_hit_rate: f64,
}

pub struct FrameComparer {
    hashes: VecDeque<ImageHash>,
    max_size: usize,
    threshold: u32,
    comparison_count: u64,
    hash_hits: u64,
    hasher: Hasher,
}

impl FrameComparer {
    pub fn new(max_size: usize, threshold: u32) -> Self {
        Self {
            hashes: VecDeque::with_capacity(max_size),
            max_size,
            threshold,
            comparison_count: 0,
            hasher: HasherConfig::new().hash_alg(HashAlg::Gradient).hash_size(8, 8).to_hasher(),
            hash_hits: 0,
        }
    }

    fn hash_image(&self, downscaled: &DynamicImage) -> ImageHash {
        self.hasher.hash_image(downscaled)
    }

    fn update_hashes(&mut self, current_hash: ImageHash) {
        self.hashes.push_front(current_hash);
        if self.hashes.len() > self.max_size {
            self.hashes.pop_back();
        }
    }

    // Distance	Meaning
    // 0	    EXACT same image (after resize)
    // 1–2	    Almost identical (tiny noise, cursor blink, compression)
    // 3–5	    Very similar (minor UI change)
    // 6–10	    Similar but noticeable change
    // 11–16	Significant difference
    // 17–24	Mostly different
    // 25–32	Completely different
    pub fn compare(&mut self, current_image: &DynamicImage) -> f32 {
        self.comparison_count += 1;

        let current_hash: ImageHash = self.hash_image(current_image);

        // iterate over the window to check the similar hashes
        for existing_hash in &self.hashes {
            let distance = existing_hash.dist(&current_hash);
            if distance < self.threshold {
                self.hash_hits += 1;
                debug!(
                    "Hash match - skipping comparison (hits: {}/{})",
                    self.hash_hits,
                    self.comparison_count
                );
                return 0.0; // identical
            }
        }

        self.update_hashes(current_hash);
        return 1.0; // completely different
    }

    // grayscale it , Binary thresholding

    /// Get statistics about comparison performance.
    pub fn stats(&self) -> FrameComparisonStats {
        FrameComparisonStats {
            total_comparisons: self.comparison_count,
            hash_hits: self.hash_hits,
            hash_hit_rate: if self.comparison_count > 0 {
                (self.hash_hits as f64) / (self.comparison_count as f64)
            } else {
                0.0
            },
        }
    }
}
