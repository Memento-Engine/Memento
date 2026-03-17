-- ==========================================
-- 1. FRAMES (The Timeline & Images)
-- ==========================================
CREATE TABLE IF NOT EXISTS frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at DATETIME DEFAULT (datetime('now','localtime')),

    app_name TEXT NOT NULL,
    window_title TEXT,
    is_focused BOOLEAN,
    browser_url TEXT,

    -- These represents the window dimensions
    window_x INTEGER,
    window_y INTEGER,
    window_width INTEGER,
    window_height INTEGER,

    -- Monitor dimensions to answers the dimension related queries (e.g: what was the text on my top left corner?)
    monitor_height INTEGER,  
    monitor_width INTEGER,

    image_path TEXT
);


CREATE INDEX IF NOT EXISTS idx_frames_created_at ON frames(captured_at);
CREATE INDEX IF NOT EXISTS idx_frames_app_name ON frames(app_name);



-- ==========================================
-- 2. CHUNKS (The Structured Memory)
-- ==========================================
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL,
    
    text_content TEXT NOT NULL,    -- The clean text block
    text_json TEXT NOT NULL,    

    FOREIGN KEY(frame_id) REFERENCES frames(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_frame_id ON chunks(frame_id);



-- ==========================================
-- 3. KEYWORD SEARCH INDEX (FTS5)
-- ==========================================
-- This enables "Google-like" fast text search.
-- We use a "Contentless" or "External Content" table to save space.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text_content, 
    content='chunks', 
    content_rowid='id'
);

-- Triggers to keep FTS in sync with Chunks
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text_content) VALUES (new.id, new.text_content);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text_content) VALUES('delete', old.id, old.text_content);
END;

-- ==========================================
-- 4. VECTOR INDEX (Semantic Search)
-- ==========================================
-- Requires sqlite-vec extension
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    chunk_id INTEGER PRIMARY KEY,
    embedding float[384]
);