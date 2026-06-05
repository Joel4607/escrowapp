-- Update accept_transaction to accept location and return conditions
CREATE OR REPLACE FUNCTION accept_transaction(
  p_transaction_id UUID,
  p_seller_location TEXT DEFAULT NULL,
  p_return_conditions TEXT DEFAULT NULL
)
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
        accepted_at = NOW(),
        seller_location = COALESCE(p_seller_location, seller_location),
        seller_return_conditions = COALESCE(p_return_conditions, seller_return_conditions)
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
