-- Migration: Create legacy usage tracking table for free tier AI limits
-- This table is now superseded by daily_usage and premium_credits tables
-- Keeping for backward compatibility

-- Drop existing usage table if it has incompatible schema
DROP TABLE IF EXISTS usage CASCADE;

CREATE TABLE IF NOT EXISTS usage (
  device_id TEXT PRIMARY KEY REFERENCES device(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  daily_count INTEGER DEFAULT 0,
  last_reset TIMESTAMP NOT NULL DEFAULT NOW(),
  user_role user_role DEFAULT 'anonymous',
  model_used TEXT,
  fallback_usage_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  available_premium_credits INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient daily reset queries
CREATE INDEX IF NOT EXISTS idx_usage_last_reset ON usage(last_reset);

-- Index for user lookups (when user logs in, we can link devices)
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
