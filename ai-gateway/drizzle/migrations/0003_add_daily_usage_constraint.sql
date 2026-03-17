-- Migration: Add unique constraint to daily_usage
-- This is needed for ON CONFLICT upsert to work

-- Drop existing constraint if it exists (to make this idempotent)
ALTER TABLE daily_usage DROP CONSTRAINT IF EXISTS daily_usage_device_id_date_key_unique;

-- Add the unique constraint
ALTER TABLE daily_usage ADD CONSTRAINT daily_usage_device_id_date_key_unique UNIQUE (device_id, date_key);
