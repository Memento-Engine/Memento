use tokio::sync::mpsc::{ Sender, Receiver };

use crate::{
    dedup::{ cache::DedupCache, db_index::DbIndex, phash::compute_hash },
    pipeline::capture::CaptureMetaData,
};

pub async fn run(
    mut rx: Receiver<CaptureMetaData>,
    tx: Sender<CaptureMetaData>,
    mut cache: DedupCache,
    db_index: DbIndex
) {
    while let Some(frame) = rx.recv().await {
        let hash = compute_hash(frame.image());

        let mut should_skip = cache.should_skip(hash);

        if should_skip {
            println!("Cache hit...");
        }

        if !should_skip {
            println!("Cache missed. Looking in the DB");

            match db_index.is_duplicate(hash) {
                Ok(is_dup) => {
                    should_skip = is_dup;
                }
                Err(e) => {
                    eprintln!("DB duplicate check failed: {}", e);
                    should_skip = false;
                }
            }
        }

        if !should_skip {
            cache.add(hash);
            db_index.insert_frame(&frame, hash as i64);
            tx.send(frame).await.unwrap();
        }
    }
}
