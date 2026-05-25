-- ============================================
-- Allow authenticated users to read any user profile
-- Needed for: seller lookup, transaction counterparty info
-- Run this in the Supabase SQL Editor
-- ============================================

-- Drop the restrictive "own profile only" policy
DROP POLICY IF EXISTS "Users can read own profile" ON users;

-- Replace with: any logged-in user can read users
CREATE POLICY "Authenticated users can read users"
  ON users FOR SELECT
  USING (auth.uid() IS NOT NULL);
