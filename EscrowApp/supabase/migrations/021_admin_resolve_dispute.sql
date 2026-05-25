-- ============================================
-- 021: Admin Resolve Dispute RPCs
-- Adds admin arbitration functions:
--   1. admin_resolve_dispute  (release/refund/partial_refund/dismiss)
--   2. admin_request_evidence (set status to awaiting_evidence)
-- Also adds 'awaiting_evidence' to dispute_status enum.
-- ============================================

-- 1. Add awaiting_evidence to dispute_status enum
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'awaiting_evidence' AFTER 'under_review';

-- 2. admin_resolve_dispute
-- Called by admin from the dashboard. Handles release, refund, partial_refund, dismiss.
-- SECURITY DEFINER so it can update wallets, ledger, dispute, transaction.
CREATE OR REPLACE FUNCTION admin_resolve_dispute(
  p_dispute_id UUID,
  p_decision TEXT,        -- 'release_to_seller' | 'refund_buyer' | 'partial_refund' | 'dismissed'
  p_admin_notes TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_dispute disputes%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
  v_seller_amount NUMERIC;
BEGIN
  -- Verify caller is admin
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can resolve disputes';
  END IF;

  -- Validate decision
  IF p_decision NOT IN ('release_to_seller', 'refund_buyer', 'partial_refund', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  -- Get dispute
  SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;
  IF v_dispute.status = 'resolved' THEN
    RAISE EXCEPTION 'Dispute is already resolved';
  END IF;

  -- Get transaction
  SELECT * INTO v_tx FROM transactions WHERE id = v_dispute.transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- ---- RELEASE TO SELLER ----
  IF p_decision = 'release_to_seller' THEN
    -- Credit seller wallet
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price
    WHERE id = v_tx.seller_id;

    -- Deduct buyer locked balance
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
    WHERE id = v_tx.buyer_id;

    -- Complete ledger entry
    UPDATE escrow_ledger
      SET to_user_id = v_tx.seller_id, status = 'completed'
    WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

    -- Update transaction
    UPDATE transactions
      SET status = 'released', released_at = NOW()
    WHERE id = v_tx.id;

    -- Resolve dispute
    UPDATE disputes
      SET status = 'resolved',
          admin_decision = 'release_to_seller',
          resolution_type = 'release',
          admin_notes = p_admin_notes,
          resolved_at = NOW()
    WHERE id = p_dispute_id;

  -- ---- REFUND BUYER ----
  ELSIF p_decision = 'refund_buyer' THEN
    -- Return funds to buyer wallet
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price
    WHERE id = v_tx.buyer_id;

    -- Deduct buyer locked balance
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
    WHERE id = v_tx.buyer_id;

    -- Mark ledger as failed, insert refund entry
    UPDATE escrow_ledger SET status = 'failed'
    WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
    VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');

    -- Update transaction
    UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

    -- Resolve dispute
    UPDATE disputes
      SET status = 'resolved',
          admin_decision = 'refund_buyer',
          resolution_type = 'refund',
          admin_notes = p_admin_notes,
          resolved_at = NOW()
    WHERE id = p_dispute_id;

  -- ---- PARTIAL REFUND ----
  ELSIF p_decision = 'partial_refund' THEN
    IF p_refund_amount <= 0 OR p_refund_amount >= v_tx.price THEN
      RAISE EXCEPTION 'Refund amount must be between 0 and transaction price (%)' , v_tx.price;
    END IF;

    v_seller_amount := v_tx.price - p_refund_amount;

    -- Refund part to buyer wallet
    UPDATE users SET wallet_balance = wallet_balance + p_refund_amount
    WHERE id = v_tx.buyer_id;

    -- Release part to seller wallet
    UPDATE users SET wallet_balance = wallet_balance + v_seller_amount
    WHERE id = v_tx.seller_id;

    -- Deduct buyer locked balance
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
    WHERE id = v_tx.buyer_id;

    -- Update ledger
    UPDATE escrow_ledger SET status = 'completed'
    WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
    VALUES (v_tx.id, v_tx.buyer_id, v_tx.buyer_id, p_refund_amount, 'partial_refund', 'completed');

    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
    VALUES (v_tx.id, v_tx.buyer_id, v_tx.seller_id, v_seller_amount, 'release', 'completed');

    -- Update transaction
    UPDATE transactions SET status = 'partially_refunded' WHERE id = v_tx.id;

    -- Resolve dispute
    UPDATE disputes
      SET status = 'resolved',
          admin_decision = 'partial_refund',
          resolution_type = 'partial_refund',
          admin_notes = p_admin_notes,
          resolved_at = NOW()
    WHERE id = p_dispute_id;

  -- ---- DISMISSED ----
  ELSIF p_decision = 'dismissed' THEN
    -- Keep funds locked, revert transaction to previous state
    UPDATE transactions SET status = 'under_inspection' WHERE id = v_tx.id;

    UPDATE disputes
      SET status = 'resolved',
          admin_decision = 'dismissed',
          admin_notes = p_admin_notes,
          resolved_at = NOW()
    WHERE id = p_dispute_id;
  END IF;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id,
    v_admin_id,
    'admin',
    'DISPUTE_RESOLVED_' || UPPER(p_decision),
    COALESCE(p_admin_notes, 'Admin resolved dispute with decision: ' || p_decision),
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'decision', p_decision,
      'refund_amount', p_refund_amount,
      'transaction_price', v_tx.price
    )
  );

  RETURN json_build_object(
    'success', true,
    'decision', p_decision,
    'dispute_id', p_dispute_id,
    'transaction_id', v_tx.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. admin_request_evidence
-- Sets dispute status to 'awaiting_evidence' and logs the request.
CREATE OR REPLACE FUNCTION admin_request_evidence(
  p_dispute_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_dispute disputes%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can request evidence';
  END IF;

  SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;
  IF v_dispute.status = 'resolved' THEN
    RAISE EXCEPTION 'Dispute is already resolved';
  END IF;

  UPDATE disputes
    SET status = 'awaiting_evidence',
        admin_notes = p_admin_notes
  WHERE id = p_dispute_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description)
  VALUES (
    v_dispute.transaction_id,
    v_admin_id,
    'admin',
    'ADMIN_REQUESTED_EVIDENCE',
    COALESCE(p_admin_notes, 'Admin requested additional evidence')
  );

  RETURN json_build_object('success', true, 'dispute_id', p_dispute_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant execute to authenticated users (admin check is inside the function)
GRANT EXECUTE ON FUNCTION admin_resolve_dispute(UUID, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_request_evidence(UUID, TEXT) TO authenticated;
