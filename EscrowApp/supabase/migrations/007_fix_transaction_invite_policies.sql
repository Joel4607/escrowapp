-- ============================================
-- Fix transaction invite policies
-- Avoid reading auth.users from RLS policies. Client requests run as the
-- authenticated role, which cannot select from auth.users directly.
-- ============================================

DROP POLICY IF EXISTS "Potential sellers can read invited transactions"
  ON public.transactions;

CREATE POLICY "Potential sellers can read invited transactions"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    status IN ('created', 'seller_invited')
    AND lower(seller_contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Potential sellers can accept transactions"
  ON public.transactions;

CREATE POLICY "Potential sellers can accept transactions"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    status = 'seller_invited'
    AND lower(seller_contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (true);
