use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{ Connection, Result };

use sqlite_vec::sqlite3_vec_init;
use rusqlite::ffi::sqlite3_auto_extension;

pub fn register_vec_extension() {
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        println!("sqlite_vec auto-extension registered");
    }
}

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_pool(db_path: &str) -> std::result::Result<DbPool, Box<dyn std::error::Error>> {
    register_vec_extension();

    // STEP 1: Create sqlite connection manager
    let manager = SqliteConnectionManager::file(db_path);

    // STEP 2: Create pool (handle error manually)
    let pool = match Pool::new(manager) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("CRITICAL: Failed to create DB pool: {}", e);
            return Err(Box::new(e));
        }
    };

    // STEP 3: Get connection from pool
    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("CRITICAL: Failed to get DB connection from pool: {}", e);
            return Err(Box::new(e));
        }
    };

    // STEP 4: Run migrations
    match run_migrations(&conn) {
        Ok(_) => {
            println!("Migrations applied successfully.");
        }
        Err(e) => {
            eprintln!("CRITICAL: Database migrations failed: {}", e);
            println!("Warning: Proceeding with potentially inconsistent database.");
        }
    }

    Ok(pool)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    println!("Running Database migrations");

    // include SQL at compile time
    let schema_sql = include_str!(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations/001_init.sql")
    );

    match conn.execute_batch(schema_sql) {
        Ok(_) => Ok(()),
        Err(e) => {
            eprintln!("Migration execution failed: {}", e);
            Err(e)
        }
    }
}
