use std::collections::{ HashMap, VecDeque };

use crate::cache::phash::hamming_distance;

pub struct FramesCache {
    hashes: VecDeque<u64>,
    max_size: usize,
    threshold: u32,
}

pub struct ChunkCache {
    map: HashMap<u64, u64>,
    max_size: usize,
    threshold: u32,
}

impl ChunkCache {
    pub fn new(max_size: usize, threshold: u32) -> Self {
        Self {
            map: HashMap::with_capacity(max_size),
            max_size,
            threshold,
        }
    }

    pub fn add(&mut self, k: u64, v: u64) {
        self.map.insert(k, v);
    }

    pub fn get(&self, hash: u64) -> Option<&u64> {
        self.map.get(&hash)
    }
}

impl FramesCache {
    pub fn new(max_size: usize, threshold: u32) -> Self {
        Self {
            hashes: VecDeque::with_capacity(max_size),
            max_size,
            threshold,
        }
    }

    pub fn should_skip(&mut self, new_hash: u64) -> bool {
        for &existing_hash in &self.hashes {
            let distance = hamming_distance(existing_hash, new_hash);
            if distance <= self.threshold {
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
