-- ============================================
-- Move remaining client-side escrow operations to server RPCs.
-- Each function enforces authorization, valid status transitions,
-- and runs atomically inside a single transaction.
-- ============================================


-- ============================================
-- accept_transaction(p_transaction_id)
-- Called by a seller (in-app join-by-code flow).
-- Sets the caller as seller and advances status to 'accepted'.
-- ============================================

CREATE OR REPLACE FUNCTION accept_transaction(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id = auth.uid() THEN
    RAISE EXCEPTION 'Buyer cannot accept their own transaction';
  END IF;

  IF v_tx.status NOT IN ('created', 'seller_invited') THEN
    RAISE EXCEPTION 'Transaction is not awaiting a seller';
  END IF;

  IF v_tx.seller_id IS NOT NULL AND v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Another seller is already assigned';
  END IF;

  UPDATE transactions
    SET seller_id = auth.uid(),
        status = 'accepted',
        terms_accepted_by_seller = true,
        accepted_at = NOW()
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- reject_transaction(p_transaction_id)
-- Called by a seller to reject a transaction they were invited to.
-- ============================================

CREATE OR REPLACE FUNCTION reject_transaction(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id = auth.uid() THEN
    RAISE EXCEPTION 'Buyer cannot reject their own transaction';
  END IF;

  IF v_tx.status NOT IN ('created', 'seller_invited') THEN
    RAISE EXCEPTION 'Transaction is not in a rejectable state';
  END IF;

  UPDATE transactions
    SET status = 'rejected'
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- generate_delivery_token(p_transaction_id)
-- Called by the seller. Generates a CSPRNG token, stores it,
-- advances status to 'in_delivery', and returns the token
-- so the seller can share it with the buyer.
-- ============================================

CREATE OR REPLACE FUNCTION generate_delivery_token(p_transaction_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_tx transactions%ROWTYPE;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.seller_id IS NULL OR v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned seller can generate a delivery token';
  END IF;

  IF v_tx.status NOT IN ('funded', 'in_delivery') THEN
    RAISE EXCEPTION 'Transaction must be funded before generating a delivery token';
  END IF;

  -- Generate 12-char alphanumeric token using pgcrypto
  v_token := upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));
  v_expires_at := NOW() + INTERVAL '24 hours';

  INSERT INTO delivery_tokens (transaction_id, seller_id, buyer_id, token_hash, expires_at)
  VALUES (p_transaction_id, v_tx.seller_id, v_tx.buyer_id, v_token, v_expires_at);

  IF v_tx.status = 'funded' THEN
    UPDATE transactions
      SET status = 'in_delivery'
    WHERE id = p_transaction_id;
  END IF;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- confirm_delivery(p_transaction_id, p_token)
-- Called by the buyer. Validates the delivery token,
-- marks it used, and advances status to 'delivered'.
-- ============================================

CREATE OR REPLACE FUNCTION confirm_delivery(p_transaction_id UUID, p_token TEXT)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
  v_token delivery_tokens%ROWTYPE;
  v_trimmed TEXT;
BEGIN
  v_trimmed := upper(trim(p_token));

  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can confirm delivery';
  END IF;

  IF v_tx.status != 'in_delivery' THEN
    RAISE EXCEPTION 'Transaction is not in delivery';
  END IF;

  SELECT * INTO v_token
  FROM delivery_tokens
  WHERE transaction_id = p_transaction_id
    AND token_hash = v_trimmed
    AND buyer_id = auth.uid()
    AND is_used = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used token';
  END IF;

  IF v_token.expires_at < NOW() THEN
    RAISE EXCEPTION 'Token has expired. Ask the seller to generate a new one.';
  END IF;

  UPDATE delivery_tokens
    SET is_used = true, used_at = NOW()
  WHERE id = v_token.id;

  UPDATE transactions
    SET status = 'delivered',
        delivered_at = NOW()
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- raise_dispute(p_transaction_id, p_reason, p_description)
-- Called by the buyer during inspection. Creates a dispute
-- record and advances transaction status to 'disputed'.
-- ============================================

CREATE OR REPLACE FUNCTION raise_dispute(
  p_transaction_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  IF trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() AND v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only transaction parties can raise a dispute';
  END IF;

  IF v_tx.status NOT IN ('delivered', 'under_inspection') THEN
    RAISE EXCEPTION 'Disputes can only be raised during delivery or inspection';
  END IF;

  INSERT INTO disputes (transaction_id, opened_by, reason, description, status)
  VALUES (p_transaction_id, auth.uid(), trim(p_reason), nullif(trim(p_description), ''), 'open');

  UPDATE transactions
    SET status = 'disputed',
        disputed_at = NOW()
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
