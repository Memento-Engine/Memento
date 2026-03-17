-- Migration: Enhanced usage tracking system with premium credits
-- This migration adds tables for:
-- 1. Premium credits tracking (anonymous: 3 credits, logged in: 5 credits)
-- 2. Detailed usage logging per request
-- 3. Daily usage aggregation for rate limiting

-- Add new columns to device table for refresh token management
ALTER TABLE device ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE device ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP;

-- Add created_at to user table if not exists
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Premium Credits Table
-- Tracks available premium credits for users/devices
CREATE TABLE IF NOT EXISTS premium_credits (
  id SERIAL PRIMARY KEY,
  device_id TEXT REFERENCES device(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  
  -- Credit balance
  total_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  
  -- Last refill tracking
  last_refill_at TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure either device_id or user_id is set
  CONSTRAINT credits_owner_check CHECK (device_id IS NOT NULL OR user_id IS NOT NULL)
);

-- Usage Log Table
-- Detailed tracking of each AI request
CREATE TABLE IF NOT EXISTS usage_log (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  
  -- Model tracking
  model_used TEXT NOT NULL,
  fallback_used BOOLEAN DEFAULT FALSE,
  
  -- Token usage
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  
  -- Request metadata
  role TEXT, -- GatewayRole: router, planner, executor, etc.
  user_role user_role DEFAULT 'anonymous',
  
  -- Credit tracking
  credits_cost INTEGER DEFAULT 0,
  is_premium_request BOOLEAN DEFAULT FALSE,
  
  -- Context window tracking
  context_window_size INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily Usage Table
-- Aggregated daily usage for rate limiting
CREATE TABLE IF NOT EXISTS daily_usage (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  
  -- Date key for aggregation (YYYY-MM-DD format)
  date_key TEXT NOT NULL,
  
  -- Daily counts
  request_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  premium_credits_used INTEGER NOT NULL DEFAULT 0,
  
  -- Per-minute tracking for rate limiting (rolling window)
  last_minute_request_count INTEGER DEFAULT 0,
  last_minute_reset_at TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint for device + date
  UNIQUE(device_id, date_key)
);

-- Indexes for efficient querying

-- Premium credits lookups
CREATE INDEX IF NOT EXISTS idx_premium_credits_device ON premium_credits(device_id);
CREATE INDEX IF NOT EXISTS idx_premium_credits_user ON premium_credits(user_id);

-- Usage log analytics
CREATE INDEX IF NOT EXISTS idx_usage_log_device ON usage_log(device_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_model ON usage_log(model_used);

-- Daily usage rate limiting
CREATE INDEX IF NOT EXISTS idx_daily_usage_device_date ON daily_usage(device_id, date_key);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date_key);

-- Device user lookup
CREATE INDEX IF NOT EXISTS idx_device_user ON device(user_id);
