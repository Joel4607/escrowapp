-- ============================================
-- Switch primary identity from phone to email
-- Run this in the Supabase SQL Editor
-- ============================================

-- Make phone nullable (users can add it later)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';

-- Make email required and unique
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Update the RLS policy for verify screen check
-- (verify screen checks by email now, not phone)
