-- ==========================================
-- MESSAGES (Chat History Persistence)
-- ==========================================
-- Stores conversation messages for session continuity.
-- Each message belongs to a session (conversation thread).

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);


-- ==========================================
-- MESSAGE SOURCES (Citation References)
-- ==========================================
-- Links messages to chunks by reference (chunk_id only).
-- No data duplication — full chunk data is fetched on demand
-- from the chunks/frames tables via chunk_id.

CREATE TABLE IF NOT EXISTS message_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    chunk_id INTEGER NOT NULL,
    usage_type TEXT NOT NULL CHECK(usage_type IN ('citation', 'reviewed', 'context')),
    step_id TEXT,

    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_sources_message_id ON message_sources(message_id);
CREATE INDEX IF NOT EXISTS idx_message_sources_chunk_id ON message_sources(chunk_id);
