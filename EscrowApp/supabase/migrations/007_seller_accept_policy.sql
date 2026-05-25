-- ============================================
-- Allow users to accept transactions as seller
-- Fixes: seller can't update because seller_id is NULL
-- Run this in the Supabase SQL Editor
-- ============================================

-- Let any authenticated user accept a transaction that has no seller yet
CREATE POLICY "Users can accept unassigned transactions"
  ON transactions FOR UPDATE
  USING (
    seller_id IS NULL
    AND status IN ('created', 'seller_invited')
  )
  WITH CHECK (
    seller_id = auth.uid()
  );

-- Let any authenticated user read transactions by code (for joining)
CREATE POLICY "Users can find transactions by code"
  ON transactions FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND status IN ('created', 'seller_invited')
  );
