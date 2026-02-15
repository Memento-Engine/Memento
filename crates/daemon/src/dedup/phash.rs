use image::{DynamicImage, imageops::FilterType};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn compute_hash(img: &DynamicImage) -> u64 {
    // convert to grayscale
    let gray = img.to_luma8();

    // resize to 9x8
    let small = image::imageops::resize(&gray, 9, 8, FilterType::Triangle);

    let mut hash: u64 = 0;

    for y in 0..8 {
        for x in 0..8 {
            let left = small.get_pixel(x, y)[0];
            let right = small.get_pixel(x + 1, y)[0];

            hash <<= 1;

            if left > right {
                hash |= 1;
            }
        }
    }

    hash
}

pub fn hamming_distance(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}
pub fn simhash(text: &str) -> u64 {
    let mut bits = [0i32; 64];

    for token in text.split_whitespace() {
        let mut hasher = DefaultHasher::new();
        token.hash(&mut hasher);
        let hash = hasher.finish();

        for i in 0..64 {
            if (hash >> i) & 1 == 1 {
                bits[i] += 1;
            } else {
                bits[i] -= 1;
            }
        }
    }

    let mut result = 0u64;
    for i in 0..64 {
        if bits[i] > 0 {
            result |= 1 << i;
        }
    }

    result
}

