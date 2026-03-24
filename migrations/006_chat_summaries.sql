-- ==========================================
-- CHAT SUMMARIES (Context Window Management)
-- ==========================================
-- Stores compressed summaries of older chat history.
-- Part of the Chat Context Manager architecture.
--
-- Summary is regenerated when:
-- - New messages arrive and raw pairs exceed threshold
-- - Summary + 2 recent pairs fit in 1500 token budget

CREATE TABLE IF NOT EXISTS chat_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    
    -- Compressed summary of older messages (≤300 tokens)
    summary TEXT NOT NULL,
    
    -- ID of the last message included in this summary
    -- Messages after this ID are in the "recent pairs" window
    last_summarized_message_id INTEGER NOT NULL,
    
    -- Approximate token count of the summary
    token_count INTEGER NOT NULL DEFAULT 0,
    
    -- Track how many messages were compressed into this summary
    messages_summarized INTEGER NOT NULL DEFAULT 0,
    
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    updated_at DATETIME DEFAULT (datetime('now','localtime')),
    
    FOREIGN KEY(session_id) REFERENCES chats(session_id) ON DELETE CASCADE,
    FOREIGN KEY(last_summarized_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_summaries_session_id ON chat_summaries(session_id);
