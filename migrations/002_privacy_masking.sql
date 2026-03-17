-- ==========================================
-- MASKED ITEMS (Privacy Settings)
-- ==========================================
-- Stores websites and applications that should be excluded from capture
CREATE TABLE IF NOT EXISTS masked_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,              -- Domain name (e.g., "facebook.com") or app name (e.g., "WhatsApp")
    item_type TEXT NOT NULL,         -- "web" or "app"
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    updated_at DATETIME DEFAULT (datetime('now','localtime')),
    
    UNIQUE(name, item_type)
);

CREATE INDEX IF NOT EXISTS idx_masked_items_type ON masked_items(item_type);
CREATE INDEX IF NOT EXISTS idx_masked_items_name ON masked_items(name);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS masked_items_update 
AFTER UPDATE ON masked_items 
BEGIN
    UPDATE masked_items SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
