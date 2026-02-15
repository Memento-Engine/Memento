use daemon::dedup::{ cache::DedupCache, phash::compute_hash };
use serde::Deserialize;
use std::{ fs, path::PathBuf };
use image::open;

#[derive(Debug, Deserialize)]
struct TestCase {
    file: String,
    cache_hit: bool,
}

fn load_test_cases(path: &str) -> anyhow::Result<Vec<TestCase>> {
    println!("path : {}", path);

    let data = fs::read_to_string(path)?;
    let cases: Vec<TestCase> = serde_json::from_str(&data)?;
    Ok(cases)
}

pub fn run_cache_test(folder: &str, json_file: &str, mut cache: DedupCache) -> anyhow::Result<()> {
    // Build path
    let mut json_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    json_path.push("tests");
    json_path.push("test_capture_images");
    json_path.push("test_capture_images.json"); // use parameter instead of hardcoding

    // Convert path safely
    let path = json_path.to_str().ok_or_else(|| anyhow::anyhow!("Failed to convert path to str"))?;

    // IMPORTANT: unwrap Result using ?
    let test_cases = load_test_cases(path)?;

    println!("Loaded {} test cases", test_cases.len());

    for case in test_cases {
        let image_path = format!("{}/{}", folder, case.file);

        let img = open(&image_path)?;

        let hash = compute_hash(&img);

        let result = cache.should_skip(hash);

        if result != case.cache_hit {
            panic!("Test failed for {} → expected {}, got {}", case.file, case.cache_hit, result);
        }

        println!("PASS {}", case.file);
        println!("file={} expected={} actual={}", case.file, case.cache_hit, result);
    } 

    Ok(())
}
