-- ============================================
-- Fix phone column: drop UNIQUE, default to NULL
-- Run this in the Supabase SQL Editor
-- ============================================

-- Drop the UNIQUE constraint on phone
ALTER TABLE users DROP CONSTRAINT users_phone_key;

-- Change default from '' to NULL (multiple users can have NULL phone)
ALTER TABLE users ALTER COLUMN phone SET DEFAULT NULL;

-- Clean up any existing empty-string phone values
UPDATE users SET phone = NULL WHERE phone = '';
