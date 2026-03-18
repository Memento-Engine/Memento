-- Migration: Simplify schema for authenticated users only
-- This migration removes the dependency on the device table for tracking authenticated users
-- The device table is kept for backward compatibility but no longer required for usage tracking

-- Drop existing constraints that require device_id
-- Step 1: Drop the old usage_log table (it requires device_id NOT NULL)
DROP TABLE IF EXISTS usage_log CASCADE;

-- Step 2: Drop the old daily_usage table (it requires device_id NOT NULL)
DROP TABLE IF EXISTS daily_usage CASCADE;

-- Step 3: Recreate usage_log without device_id requirement
CREATE TABLE IF NOT EXISTS usage_log (
  id SERIAL PRIMARY KEY,
  
  -- For authenticated users (preferred)
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  
  -- For legacy device tracking (optional)
  device_id TEXT REFERENCES device(id) ON DELETE SET NULL,
  
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

-- Step 4: Recreate daily_usage without strict device_id requirement
CREATE TABLE IF NOT EXISTS daily_usage (
  id SERIAL PRIMARY KEY,
  
  -- Either user_id or device_id (at least one should be set for tracking)
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES device(id) ON DELETE SET NULL,
  
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
  
  -- Unique constraint for (user_id OR device_id) + date
  -- For authenticated users: UNIQUE(user_id, date_key)
  -- For device tracking: UNIQUE(device_id, date_key)
  UNIQUE(user_id, date_key),
  UNIQUE(device_id, date_key)
);

-- Step 5: Update premium_credits to not require device_id for authenticated users
-- Premium credits already supports both user_id and device_id, but make sure constraint allows user_id only
ALTER TABLE premium_credits DROP CONSTRAINT IF EXISTS credits_owner_check;
ALTER TABLE premium_credits ADD CONSTRAINT credits_owner_check 
  CHECK (device_id IS NOT NULL OR user_id IS NOT NULL);

-- Step 6: Add session table for multi-device auth
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  
  -- Link to user
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  
  -- Device info for session management UI
  device_os TEXT,
  device_hostname TEXT,
  app_version TEXT,
  
  -- IP address for security logging
  ip_address TEXT,
  
  -- Session lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  
  -- Revocation - revoked sessions are rejected even with valid JWT
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  
  -- Refresh token (stored as hash for security)
  refresh_token_hash TEXT,
  refresh_token_expires_at TIMESTAMP
);

-- Step 7: Add missing columns to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_subject_id TEXT UNIQUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- Step 8: Create indexes for efficient querying

-- Usage log analytics
CREATE INDEX IF NOT EXISTS idx_usage_log_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_device ON usage_log(device_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_model ON usage_log(model_used);

-- Daily usage rate limiting
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_daily_usage_device_date ON daily_usage(device_id, date_key);

-- Session management
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_revoked ON session(revoked);
CREATE INDEX IF NOT EXISTS idx_session_created ON session(created_at);
