-- 1. IMAGES TABLE
CREATE TABLE IF NOT EXISTS frames (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_path TEXT NOT NULL,
    app_name TEXT,
    window_title TEXT,
    p_hash INTEGER
);
CREATE INDEX IF NOT EXISTS idx_frames_hash ON frames(p_hash);

-- 2. CHUNKS TABLE
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    frame_id INTEGER,
    text_content TEXT,
    text_hash TEXT,
    start_char_idx INTEGER,
    end_char_idx INTEGER,
    FOREIGN KEY(frame_id) REFERENCES frames(id)
);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(text_hash);

-- 3. VECTOR TABLE
-- Note: You must load the sqlite-vec extension before running this!
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    chunk_id INTEGER PRIMARY KEY,
    embedding float[768]  -- Assuming 768 dim (e.g., all-MiniLM-L6-v2)
);