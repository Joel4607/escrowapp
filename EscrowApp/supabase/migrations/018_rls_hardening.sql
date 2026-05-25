-- ============================================
-- RLS HARDENING
-- Now that all escrow mutations go through SECURITY DEFINER RPCs,
-- remove overly permissive direct-access policies that the client
-- no longer needs.  Keeps only the minimum policies required:
--   • SELECTs for reading data the UI displays
--   • INSERTs for the few direct writes that remain (signup, create tx, push tokens, archives)
-- ============================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. TRANSACTIONS — remove direct UPDATE / DELETE
-- RPCs: accept_transaction, reject_transaction, fund_escrow,
--       generate_delivery_token, confirm_delivery, release_escrow,
--       cancel_escrow, raise_dispute, delete_transaction
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Buyers can update own transactions"            ON transactions;
DROP POLICY IF EXISTS "Sellers can update assigned transactions"      ON transactions;
DROP POLICY IF EXISTS "Users can accept unassigned transactions"      ON transactions;
DROP POLICY IF EXISTS "Potential sellers can accept transactions"     ON transactions;
DROP POLICY IF EXISTS "Buyers can delete settled transactions"        ON transactions;

-- ─────────────────────────────────────────────
-- 2. TRANSACTIONS SELECT
-- "Users can find transactions by code" is kept as-is:
--   it only allows reading transactions with status IN
--   ('created','seller_invited') and requires auth.  This is
--   needed for the join-by-code flow (join.tsx) where the
--   potential seller doesn't yet have seller_id set.
-- Buyer/seller/admin SELECT policies from 001 remain in place.
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 3. ESCROW LEDGER — remove direct INSERT / UPDATE
-- All ledger mutations are inside RPCs (fund_escrow, release_escrow,
-- cancel_escrow).
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert ledger entries"   ON escrow_ledger;
DROP POLICY IF EXISTS "Buyers can update own ledger entries" ON escrow_ledger;

-- ─────────────────────────────────────────────
-- 4. DELIVERY TOKENS — remove direct INSERT / UPDATE
-- RPCs: generate_delivery_token, confirm_delivery
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Sellers can create delivery tokens" ON delivery_tokens;
DROP POLICY IF EXISTS "Buyers can mark token as used"      ON delivery_tokens;

-- ─────────────────────────────────────────────
-- 5. DISPUTES — remove direct INSERT
-- RPC: raise_dispute
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can open disputes" ON disputes;

-- ─────────────────────────────────────────────
-- 6. AUDIT LOGS — remove client INSERT
-- Audit rows should only be created server-side (RPCs / edge functions).
-- Letting clients insert lets a user fabricate audit entries.
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert audit logs" ON audit_logs;

-- ─────────────────────────────────────────────
-- 7. TRANSACTION INVITES — remove direct DELETE
-- The delete_transaction RPC handles cascade deletion.
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Buyers can delete invites for own transactions" ON transaction_invites;

-- ─────────────────────────────────────────────
-- 8. STORAGE — tighten evidence bucket policies
-- Old policies let any authenticated user upload to or read from
-- the entire evidence bucket.  Scope uploads so the file path
-- includes the user's own ID, and scope reads to transaction
-- parties only.
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can upload evidence images"
  ON storage.objects;

DROP POLICY IF EXISTS "Users can read evidence images from their transactions"
  ON storage.objects;

CREATE POLICY "Users can upload own evidence images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Transaction parties can read evidence images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM evidence e
          JOIN transactions t ON t.id = e.transaction_id
        WHERE e.image_url LIKE '%' || storage.filename(name)
          AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
      )
    )
  );

-- ─────────────────────────────────────────────
-- 9. REVOKE unnecessary table-level grants
-- otp_challenges should only be accessed by service_role (edge functions).
-- The authenticated grants are unnecessary and misleading.
-- ─────────────────────────────────────────────

REVOKE SELECT, INSERT, UPDATE ON public.otp_challenges FROM authenticated;
REVOKE SELECT ON public.otp_challenges FROM anon;

COMMIT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
