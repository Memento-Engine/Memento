-- Migration: Add unique constraint for authenticated daily usage
-- This aligns daily_usage with authenticated user tracking by (user_id, date_key)

CREATE UNIQUE INDEX IF NOT EXISTS daily_usage_user_id_date_key_unique
ON daily_usage (user_id, date_key);
