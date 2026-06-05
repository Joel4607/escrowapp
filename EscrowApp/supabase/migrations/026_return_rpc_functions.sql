-- ============================================
-- 026: Return RPC Functions
-- All server-side functions for the return workflow.
-- ============================================


-- ============================================
-- admin_approve_return(p_dispute_id, p_deadline_days, p_admin_notes)
-- Called by admin. Creates a return_transaction, updates
-- dispute and transaction statuses.
-- ============================================

CREATE OR REPLACE FUNCTION admin_approve_return(
  p_dispute_id UUID,
  p_deadline_days INTEGER,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_dispute disputes%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
  v_return_id UUID;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can approve returns';
  END IF;

  IF p_deadline_days < 1 OR p_deadline_days > 30 THEN
    RAISE EXCEPTION 'Deadline must be between 1 and 30 days';
  END IF;

  SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  IF v_dispute.status = 'resolved' THEN RAISE EXCEPTION 'Dispute is already resolved'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_dispute.transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM return_transactions
    WHERE original_transaction_id = v_tx.id
      AND status NOT IN ('expired', 'resolved', 'approved')
  ) THEN
    RAISE EXCEPTION 'An active return already exists for this transaction';
  END IF;

  v_deadline := NOW() + (p_deadline_days || ' days')::INTERVAL;

  INSERT INTO return_transactions (
    original_transaction_id, dispute_id, return_deadline,
    buyer_location, seller_location, seller_return_conditions,
    status, created_by, admin_notes
  ) VALUES (
    v_tx.id, p_dispute_id, v_deadline,
    v_tx.buyer_location, v_tx.seller_location, v_tx.seller_return_conditions,
    'created', v_admin_id, p_admin_notes
  ) RETURNING id INTO v_return_id;

  UPDATE disputes
    SET status = 'under_review',
        admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_dispute_id;

  UPDATE transactions
    SET status = 'return_approved'
  WHERE id = v_tx.id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, v_admin_id, 'admin', 'RETURN_APPROVED',
    COALESCE(p_admin_notes, 'Admin approved product return'),
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'return_transaction_id', v_return_id,
      'deadline_days', p_deadline_days,
      'deadline', v_deadline
    )
  );

  RETURN json_build_object(
    'success', true,
    'return_transaction_id', v_return_id,
    'deadline', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- generate_return_delivery_token(p_return_transaction_id)
-- Called by the buyer. Generates a return token and
-- updates the return transaction to 'in_transit'.
-- ============================================

CREATE OR REPLACE FUNCTION generate_return_delivery_token(
  p_return_transaction_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can generate a return delivery token';
  END IF;

  IF v_rt.status NOT IN ('created', 'awaiting_shipment') THEN
    RAISE EXCEPTION 'Return is not awaiting shipment';
  END IF;

  IF v_rt.return_deadline < NOW() THEN
    RAISE EXCEPTION 'Return deadline has passed';
  END IF;

  v_token := upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));
  v_expires_at := v_rt.return_deadline;

  INSERT INTO delivery_tokens (transaction_id, seller_id, buyer_id, token_hash, expires_at)
  VALUES (v_rt.original_transaction_id, v_tx.seller_id, v_tx.buyer_id, v_token, v_expires_at);

  UPDATE return_transactions
    SET status = 'in_transit',
        shipped_at = NOW()
  WHERE id = p_return_transaction_id;

  UPDATE transactions
    SET status = 'return_in_progress'
  WHERE id = v_rt.original_transaction_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_rt.original_transaction_id, auth.uid(), 'buyer', 'RETURN_SHIPPED',
    'Buyer generated return delivery token and shipped item',
    jsonb_build_object('return_transaction_id', p_return_transaction_id)
  );

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- confirm_return_delivery(p_return_transaction_id, p_token)
-- Called by the seller. Validates the return token,
-- confirms receipt, starts inspection period.
-- ============================================

CREATE OR REPLACE FUNCTION confirm_return_delivery(
  p_return_transaction_id UUID,
  p_token TEXT
)
RETURNS void AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_token delivery_tokens%ROWTYPE;
  v_trimmed TEXT;
  v_inspection_deadline TIMESTAMPTZ;
BEGIN
  v_trimmed := upper(trim(p_token));

  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can confirm return delivery';
  END IF;

  IF v_rt.status != 'in_transit' THEN
    RAISE EXCEPTION 'Return is not in transit';
  END IF;

  SELECT * INTO v_token
  FROM delivery_tokens
  WHERE transaction_id = v_rt.original_transaction_id
    AND token_hash = v_trimmed
    AND is_used = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used return token';
  END IF;

  UPDATE delivery_tokens
    SET is_used = true, used_at = NOW()
  WHERE id = v_token.id;

  v_inspection_deadline := NOW() + (v_tx.inspection_period || ' hours')::INTERVAL;

  UPDATE return_transactions
    SET status = 'inspection',
        delivered_at = NOW(),
        inspection_deadline = v_inspection_deadline
  WHERE id = p_return_transaction_id;

  UPDATE transactions
    SET status = 'return_delivered'
  WHERE id = v_rt.original_transaction_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_rt.original_transaction_id, auth.uid(), 'seller', 'RETURN_RECEIVED',
    'Seller confirmed receipt of returned item',
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'inspection_deadline', v_inspection_deadline
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- approve_return(p_return_transaction_id)
-- Called by the seller. Approves the return condition,
-- triggers full refund to buyer.
-- ============================================

CREATE OR REPLACE FUNCTION approve_return(p_return_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can approve a return';
  END IF;

  IF v_rt.status != 'inspection' THEN
    RAISE EXCEPTION 'Return is not under inspection';
  END IF;

  UPDATE users SET wallet_balance = wallet_balance + v_tx.price
  WHERE id = v_tx.buyer_id;

  UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
  WHERE id = v_tx.buyer_id;

  UPDATE escrow_ledger SET status = 'failed'
  WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

  INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
  VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');

  UPDATE return_transactions
    SET status = 'approved',
        resolved_at = NOW(),
        resolution = 'approved'
  WHERE id = p_return_transaction_id;

  UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

  UPDATE disputes
    SET status = 'resolved',
        admin_decision = 'return_approved_by_seller',
        resolution_type = 'refund',
        resolved_at = NOW()
  WHERE id = v_rt.dispute_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, auth.uid(), 'seller', 'RETURN_APPROVED_BY_SELLER',
    'Seller approved return. Full refund issued to buyer.',
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'refund_amount', v_tx.price
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- raise_counter_dispute(p_return_transaction_id, p_reason, p_description)
-- Called by the seller during return inspection.
-- ============================================

CREATE OR REPLACE FUNCTION raise_counter_dispute(
  p_return_transaction_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_counter_id UUID;
BEGIN
  IF trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can raise a counter-dispute';
  END IF;

  IF v_rt.status != 'inspection' THEN
    RAISE EXCEPTION 'Counter-disputes can only be raised during return inspection';
  END IF;

  IF EXISTS (
    SELECT 1 FROM counter_disputes
    WHERE return_transaction_id = p_return_transaction_id
      AND status != 'resolved'
  ) THEN
    RAISE EXCEPTION 'An active counter-dispute already exists for this return';
  END IF;

  INSERT INTO counter_disputes (
    return_transaction_id, original_dispute_id, opened_by,
    reason, description, status
  ) VALUES (
    p_return_transaction_id, v_rt.dispute_id, auth.uid(),
    trim(p_reason), nullif(trim(p_description), ''), 'open'
  ) RETURNING id INTO v_counter_id;

  UPDATE return_transactions
    SET status = 'counter_disputed'
  WHERE id = p_return_transaction_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, auth.uid(), 'seller', 'COUNTER_DISPUTE_RAISED',
    'Seller raised counter-dispute on returned item: ' || trim(p_reason),
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'counter_dispute_id', v_counter_id,
      'reason', trim(p_reason)
    )
  );

  RETURN v_counter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- admin_resolve_counter_dispute(p_counter_dispute_id, p_decision, p_admin_notes, p_refund_amount)
-- Admin resolves a counter-dispute on a return.
-- ============================================

CREATE OR REPLACE FUNCTION admin_resolve_counter_dispute(
  p_counter_dispute_id UUID,
  p_decision TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_cd counter_disputes%ROWTYPE;
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
  v_seller_amount NUMERIC;
BEGIN
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can resolve counter-disputes';
  END IF;

  IF p_decision NOT IN ('refund_buyer', 'release_to_seller', 'partial_refund') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_cd FROM counter_disputes WHERE id = p_counter_dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Counter-dispute not found'; END IF;
  IF v_cd.status = 'resolved' THEN RAISE EXCEPTION 'Counter-dispute already resolved'; END IF;

  SELECT * INTO v_rt FROM return_transactions WHERE id = v_cd.return_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF p_decision = 'refund_buyer' THEN
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.buyer_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET status = 'failed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');
    UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

  ELSIF p_decision = 'release_to_seller' THEN
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.seller_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET to_user_id = v_tx.seller_id, status = 'completed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    UPDATE transactions SET status = 'released', released_at = NOW() WHERE id = v_tx.id;

  ELSIF p_decision = 'partial_refund' THEN
    IF p_refund_amount <= 0 OR p_refund_amount >= v_tx.price THEN
      RAISE EXCEPTION 'Refund amount must be between 0 and %', v_tx.price;
    END IF;
    v_seller_amount := v_tx.price - p_refund_amount;

    UPDATE users SET wallet_balance = wallet_balance + p_refund_amount WHERE id = v_tx.buyer_id;
    UPDATE users SET wallet_balance = wallet_balance + v_seller_amount WHERE id = v_tx.seller_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET status = 'completed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.buyer_id, v_tx.buyer_id, p_refund_amount, 'partial_refund', 'completed');
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.buyer_id, v_tx.seller_id, v_seller_amount, 'release', 'completed');
    UPDATE transactions SET status = 'partially_refunded' WHERE id = v_tx.id;
  END IF;

  UPDATE counter_disputes
    SET status = 'resolved',
        admin_decision = p_decision,
        admin_notes = p_admin_notes,
        resolution_type = p_decision,
        refund_amount = p_refund_amount,
        resolved_at = NOW()
  WHERE id = p_counter_dispute_id;

  UPDATE return_transactions
    SET status = 'resolved',
        resolved_at = NOW(),
        resolution = 'counter_disputed'
  WHERE id = v_cd.return_transaction_id;

  UPDATE disputes
    SET status = 'resolved',
        admin_decision = 'counter_dispute_' || p_decision,
        resolution_type = CASE p_decision
          WHEN 'refund_buyer' THEN 'refund'
          WHEN 'release_to_seller' THEN 'release'
          WHEN 'partial_refund' THEN 'partial_refund'
        END,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
  WHERE id = v_rt.dispute_id;

  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, v_admin_id, 'admin',
    'COUNTER_DISPUTE_RESOLVED_' || UPPER(p_decision),
    COALESCE(p_admin_notes, 'Admin resolved counter-dispute: ' || p_decision),
    jsonb_build_object(
      'counter_dispute_id', p_counter_dispute_id,
      'return_transaction_id', v_cd.return_transaction_id,
      'decision', p_decision,
      'refund_amount', p_refund_amount,
      'transaction_price', v_tx.price
    )
  );

  RETURN json_build_object(
    'success', true,
    'decision', p_decision,
    'counter_dispute_id', p_counter_dispute_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- expire_overdue_returns()
-- Called by cron. Expires returns past deadline
-- where buyer hasn't shipped, releasing funds to seller.
-- ============================================

CREATE OR REPLACE FUNCTION expire_overdue_returns()
RETURNS JSON AS $$
DECLARE
  v_rt RECORD;
  v_tx transactions%ROWTYPE;
  v_expired_count INTEGER := 0;
BEGIN
  FOR v_rt IN
    SELECT * FROM return_transactions
    WHERE status IN ('created', 'awaiting_shipment')
      AND return_deadline < NOW()
    FOR UPDATE
  LOOP
    SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;

    IF FOUND THEN
      UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.seller_id;
      UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
      UPDATE escrow_ledger SET to_user_id = v_tx.seller_id, status = 'completed'
        WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

      UPDATE return_transactions
        SET status = 'expired', resolved_at = NOW(), resolution = 'expired'
      WHERE id = v_rt.id;

      UPDATE transactions SET status = 'released', released_at = NOW()
      WHERE id = v_tx.id;

      UPDATE disputes
        SET status = 'resolved',
            admin_decision = 'return_expired',
            resolution_type = 'release',
            resolved_at = NOW()
      WHERE id = v_rt.dispute_id;

      INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
      VALUES (
        v_tx.id, v_tx.buyer_id, 'system', 'RETURN_EXPIRED',
        'Return deadline expired. Funds released to seller.',
        jsonb_build_object('return_transaction_id', v_rt.id)
      );

      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  FOR v_rt IN
    SELECT * FROM return_transactions
    WHERE status = 'inspection'
      AND inspection_deadline IS NOT NULL
      AND inspection_deadline < NOW()
    FOR UPDATE
  LOOP
    SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;

    IF FOUND THEN
      UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.buyer_id;
      UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
      UPDATE escrow_ledger SET status = 'failed'
        WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
      INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
        VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');

      UPDATE return_transactions
        SET status = 'approved', resolved_at = NOW(), resolution = 'auto_approved'
      WHERE id = v_rt.id;

      UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

      UPDATE disputes
        SET status = 'resolved',
            admin_decision = 'return_auto_approved',
            resolution_type = 'refund',
            resolved_at = NOW()
      WHERE id = v_rt.dispute_id;

      INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
      VALUES (
        v_tx.id, v_tx.seller_id, 'system', 'RETURN_AUTO_APPROVED',
        'Seller inspection period expired. Return auto-approved. Buyer refunded.',
        jsonb_build_object('return_transaction_id', v_rt.id)
      );

      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('expired_count', v_expired_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_approve_return(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_return_delivery_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_return_delivery(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_return(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION raise_counter_dispute(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_counter_dispute(UUID, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_overdue_returns() TO authenticated;
