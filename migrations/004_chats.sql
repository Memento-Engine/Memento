-- ==========================================
-- CHATS (Session Metadata)
-- ==========================================
-- Stores per-session metadata for chat list rendering and controls.

CREATE TABLE IF NOT EXISTS chats (
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    updated_at DATETIME DEFAULT (datetime('now','localtime'))
);

-- Backfill existing sessions from messages so chat history appears in sidebar
-- immediately after upgrading.
INSERT OR IGNORE INTO chats (session_id, title, created_at, updated_at)
SELECT
    m.session_id,
    COALESCE(
        NULLIF(
            TRIM(SUBSTR(
                MIN(CASE WHEN m.role = 'user' AND LENGTH(TRIM(m.content)) > 0 THEN m.content END),
                1,
                64
            )),
            ''
        ),
        'New chat'
    ) AS title,
    MIN(m.created_at) AS created_at,
    MAX(m.created_at) AS updated_at
FROM messages m
GROUP BY m.session_id;

CREATE INDEX IF NOT EXISTS idx_chats_pinned_updated ON chats(pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
