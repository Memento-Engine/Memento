use image::{DynamicImage, imageops::FilterType};

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