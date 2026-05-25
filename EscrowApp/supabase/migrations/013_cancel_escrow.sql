-- cancel_escrow(p_transaction_id)
-- Called by the buyer. Refunds locked funds back to buyer wallet.
-- Only allowed when status is 'funded' (before seller ships).
CREATE OR REPLACE FUNCTION cancel_escrow(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can cancel this transaction';
  END IF;

  IF v_tx.status != 'funded' THEN
    RAISE EXCEPTION 'Can only cancel funded transactions before shipment';
  END IF;

  -- Return funds to buyer wallet
  UPDATE users
    SET wallet_balance = wallet_balance + v_tx.price,
        locked_balance = GREATEST(0, locked_balance - v_tx.price)
  WHERE id = v_tx.buyer_id;

  -- Mark ledger entry as failed (refunded)
  UPDATE escrow_ledger
    SET status = 'failed'
  WHERE transaction_id = p_transaction_id
    AND type = 'fund'
    AND status = 'locked';

  -- Advance transaction to cancelled
  UPDATE transactions
    SET status = 'cancelled'
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
