use daemon::dedup::{ cache::DedupCache };
mod capture_tests;
#[test]
fn test_cache_logic() {
    let cache = DedupCache::new(10, 3);

    match
        capture_tests::run_cache_test(
            "tests/test_capture_images",
            "tests/test_capture_images.json",
            cache
        )
    {
        Ok(e) => {
            println!("Passed : {:#?}", e);
        }
        Err(e) => {
            println!("Failed :{:#?}", e);
        }
    }
}
