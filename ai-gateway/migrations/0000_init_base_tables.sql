-- Migration: Create base tables (user, device)
-- This must run BEFORE 0001 and 0002 migrations

-- Create user_role enum type
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('anonymous', 'logged');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Users Table
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices Table
CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY,
  os TEXT NOT NULL,
  app_version TEXT,
  hostname TEXT,
  fingerprint TEXT,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  refresh_token TEXT,
  refresh_token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for device table
CREATE INDEX IF NOT EXISTS idx_device_fingerprint ON device(fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_user_id ON device(user_id);
