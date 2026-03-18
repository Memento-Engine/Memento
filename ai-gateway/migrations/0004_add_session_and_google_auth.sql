-- Migration: Add session table and Google OAuth support
-- This migration adds:
-- 1. Session table for multi-device authentication
-- 2. Google subject ID to user table
-- 3. User plan enum for model access control

-- Add user plan enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
        CREATE TYPE user_plan AS ENUM ('free', 'premium');
    END IF;
END$$;

-- Add new columns to user table
ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS "google_subject_id" TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS "plan" user_plan DEFAULT 'free';

-- Create session table for multi-device authentication
CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    
    -- Device info for session management UI
    "device_os" TEXT,
    "device_hostname" TEXT,
    "app_version" TEXT,
    
    -- IP address for security logging
    "ip_address" TEXT,
    
    -- Session lifecycle
    "created_at" TIMESTAMP DEFAULT NOW(),
    "last_active_at" TIMESTAMP DEFAULT NOW(),
    
    -- Revocation
    "revoked" BOOLEAN DEFAULT FALSE,
    "revoked_at" TIMESTAMP,
    
    -- Refresh token (stored as hash for security)
    "refresh_token_hash" TEXT,
    "refresh_token_expires_at" TIMESTAMP
);

-- Index for efficient session lookups
CREATE INDEX IF NOT EXISTS "idx_session_user_id" ON "session"("user_id");
CREATE INDEX IF NOT EXISTS "idx_session_refresh_token_hash" ON "session"("refresh_token_hash");

-- Index for Google subject ID lookups (used during login)
CREATE INDEX IF NOT EXISTS "idx_user_google_subject_id" ON "user"("google_subject_id");
