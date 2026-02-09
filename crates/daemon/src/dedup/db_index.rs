use app_core::db::DbPool;
use crate::{ dedup::phash::hamming_distance, pipeline::capture::CaptureMetaData };

pub struct DbIndex {
    pool: DbPool,
}

impl DbIndex {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn insert_frame(&self, frame: &CaptureMetaData, hash : i64) {
        let conn = self.pool.get().unwrap();

        let meta = frame.metadata();

        match
            conn.execute(
                "INSERT INTO frames (file_path, app_name, window_title, p_hash)
     VALUES (?1, ?2, ?3, ?4)",
                (
                    meta.file_name(),
                    meta.window_meta().app_name(),
                    meta.window_meta().window_title(),
                    hash as i64,
                )
            )
        {
            Ok(rows) => {
                println!("Inserted {} row(s)", rows);
            }
            Err(e) => {
                eprintln!("Insert failed: {}", e);
            }
        }

    }

    pub fn is_duplicate(&self, hash: u64) -> rusqlite::Result<bool> {
        let conn = self.pool.get().unwrap();

        let delta = 10_000u64;

        let mut stmt = conn.prepare("SELECT phash FROM frames WHERE phash BETWEEN ?1 AND ?2")?;

        let lower = (hash - delta) as i64;
        let upper = (hash + delta) as i64;

        let rows = stmt.query_map([lower, upper], |row| { row.get::<_, i64>(0) })?;

        for db_hash in rows {
            let db_hash = db_hash?;

            if hamming_distance(db_hash as u64, hash) <= 3 {
                return Ok(true);
            }
        }

        Ok(false)
    }
}
