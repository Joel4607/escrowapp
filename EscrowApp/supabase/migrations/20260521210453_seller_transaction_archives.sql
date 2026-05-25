-- ============================================
-- Seller-side per-user transaction archive
-- Lets sellers hide settled transactions from their own list without
-- deleting the shared transaction record.
-- ============================================

CREATE TABLE IF NOT EXISTS public.transaction_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_archives_user
  ON public.transaction_archives(user_id);

CREATE INDEX IF NOT EXISTS idx_transaction_archives_transaction
  ON public.transaction_archives(transaction_id);

ALTER TABLE public.transaction_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transaction archives"
  ON public.transaction_archives;

CREATE POLICY "Users can read own transaction archives"
  ON public.transaction_archives FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can archive own settled transactions"
  ON public.transaction_archives;

CREATE POLICY "Sellers can archive own settled transactions"
  ON public.transaction_archives FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_archives.transaction_id
        AND t.seller_id = auth.uid()
        AND t.status IN (
          'released',
          'refunded',
          'partially_refunded',
          'cancelled',
          'rejected',
          'expired'
        )
    )
  );

DROP POLICY IF EXISTS "Users can unarchive own transactions"
  ON public.transaction_archives;

CREATE POLICY "Users can unarchive own transactions"
  ON public.transaction_archives FOR DELETE
  USING (user_id = auth.uid());

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.transaction_archives TO authenticated;
GRANT ALL ON public.transaction_archives TO service_role;

NOTIFY pgrst, 'reload schema';
