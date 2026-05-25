-- ============================================
-- PHASE 2 FIXES
-- 1. Allow potential sellers to discover and accept transactions
-- 2. Allow ledger updates by the transacting buyer
-- 3. release_escrow() RPC — atomically releases funds to seller
-- ============================================

-- Sellers can read transactions they're invited to (matched by email)
CREATE POLICY "Potential sellers can read invited transactions"
  ON transactions FOR SELECT
  USING (
    status IN ('created', 'seller_invited')
    AND seller_contact = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Sellers can accept/reject before their seller_id is set.
-- WITH CHECK (true) allows the new row state to differ from the USING predicate
-- (e.g. status changes from 'seller_invited' → 'accepted').
CREATE POLICY "Potential sellers can accept transactions"
  ON transactions FOR UPDATE
  USING (
    status = 'seller_invited'
    AND seller_contact = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (true);

-- Allow buyer to update the escrow_ledger entry they created (for release completion)
CREATE POLICY "Buyers can update own ledger entries"
  ON escrow_ledger FOR UPDATE
  USING (from_user_id = auth.uid());

-- ============================================
-- release_escrow(p_transaction_id)
-- Called by the buyer. Runs SECURITY DEFINER so it can update the
-- seller's wallet balance (bypassing the RLS "update own row" limit).
-- ============================================
CREATE OR REPLACE FUNCTION release_escrow(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can release escrow funds';
  END IF;

  IF v_tx.status NOT IN ('delivered', 'under_inspection') THEN
    RAISE EXCEPTION 'Transaction must be in delivered or under_inspection status to release';
  END IF;

  -- Credit seller wallet
  UPDATE users
    SET wallet_balance = wallet_balance + v_tx.price
  WHERE id = v_tx.seller_id;

  -- Deduct buyer locked balance (floor at 0)
  UPDATE users
    SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
  WHERE id = v_tx.buyer_id;

  -- Mark ledger entry as completed
  UPDATE escrow_ledger
    SET to_user_id = v_tx.seller_id,
        status     = 'completed'
  WHERE transaction_id = p_transaction_id
    AND type            = 'fund'
    AND status          = 'locked';

  -- Advance transaction
  UPDATE transactions
    SET status      = 'released',
        released_at = NOW()
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
