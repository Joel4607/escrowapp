-- delete_transaction(p_transaction_id)
-- Atomically deletes a transaction and all related rows.
-- Only allowed for transactions where funds are NOT actively locked.
-- Runs as SECURITY DEFINER to bypass per-table RLS for cascade cleanup.
CREATE OR REPLACE FUNCTION delete_transaction(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can delete this transaction';
  END IF;

  IF v_tx.status IN ('funded', 'in_delivery', 'delivered', 'under_inspection', 'disputed', 'admin_review') THEN
    RAISE EXCEPTION 'Cannot delete transactions with locked funds';
  END IF;

  -- Delete all related rows
  DELETE FROM otp_challenges WHERE transaction_invite_id IN (
    SELECT id FROM transaction_invites WHERE transaction_id = p_transaction_id
  );
  DELETE FROM transaction_invites WHERE transaction_id = p_transaction_id;
  DELETE FROM audit_logs WHERE transaction_id = p_transaction_id;
  DELETE FROM escrow_ledger WHERE transaction_id = p_transaction_id;
  DELETE FROM delivery_tokens WHERE transaction_id = p_transaction_id;
  DELETE FROM ratings WHERE transaction_id = p_transaction_id;
  DELETE FROM evidence WHERE transaction_id = p_transaction_id;
  DELETE FROM fraud_flags WHERE transaction_id = p_transaction_id;
  DELETE FROM disputes WHERE transaction_id = p_transaction_id;

  -- Delete the transaction itself
  DELETE FROM transactions WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
