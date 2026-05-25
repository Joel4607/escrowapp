-- ============================================
-- add_wallet_funds(p_amount)
-- Simulated top-up for the academic prototype.
-- Runs as SECURITY DEFINER to bypass the column protection trigger.
-- ============================================

CREATE OR REPLACE FUNCTION add_wallet_funds(p_amount NUMERIC)
RETURNS void AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  UPDATE users
    SET wallet_balance = wallet_balance + p_amount
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
