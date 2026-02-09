use std::collections::VecDeque;

use crate::dedup::phash::hamming_distance;

pub struct DedupCache {
    hashes: VecDeque<u64>,
    max_size: usize,
    threshold: u32,
}

impl DedupCache {
    pub fn new(max_size: usize, threshold: u32) -> Self {
        Self {
            hashes: VecDeque::with_capacity(max_size),
            max_size,
            threshold,
        }
    }

    pub fn add(&mut self, hash: u64) {
        self.hashes.push_back(hash);
    }

    pub fn should_skip(&mut self, new_hash: u64) -> bool {
        for &existing_hash in &self.hashes {
            if hamming_distance(existing_hash, new_hash) <= self.threshold {
                return true;
            }
        }

        self.hashes.push_back(new_hash);

        if self.hashes.len() > self.max_size {
            self.hashes.pop_front();
        }

        return false;
    }
}
