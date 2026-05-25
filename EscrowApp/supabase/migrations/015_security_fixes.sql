-- ============================================
-- SECURITY FIXES
-- 1. Protect sensitive user columns from client-side manipulation
-- 2. Atomic fund_escrow() RPC (replaces client-side multi-step writes)
-- 3. Default wallet balance set in DB instead of client
-- ============================================


-- ============================================
-- Fix 5: Default wallet balance = 10000 for new signups
-- Previously set client-side in create-password.tsx, which was manipulable.
-- ============================================

ALTER TABLE users ALTER COLUMN wallet_balance SET DEFAULT 10000.00;


-- ============================================
-- Fix 1: Protect sensitive columns on UPDATE
-- Prevents authenticated users from modifying: role, wallet_balance,
-- locked_balance, trust_score, is_verified via direct table updates.
-- SECURITY DEFINER functions (RPCs) bypass this because current_user
-- becomes the function owner ('postgres'), not 'authenticated'.
-- ============================================

CREATE OR REPLACE FUNCTION protect_user_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.wallet_balance := OLD.wallet_balance;
    NEW.locked_balance := OLD.locked_balance;
    NEW.trust_score := OLD.trust_score;
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_user_sensitive_columns
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_user_columns();


-- ============================================
-- Fix 1b: Enforce defaults on INSERT
-- Prevents a user from creating their account with role='admin'
-- or wallet_balance=999999 by intercepting the signup request.
-- ============================================

CREATE OR REPLACE FUNCTION enforce_user_defaults_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := 'buyer';
    NEW.wallet_balance := 10000.00;
    NEW.locked_balance := 0.00;
    NEW.trust_score := 100.00;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_user_defaults_on_insert
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_user_defaults_on_insert();


-- ============================================
-- Fix 2: fund_escrow() RPC
-- Atomically deducts buyer wallet, locks funds, creates ledger entry,
-- and advances transaction status. Uses FOR UPDATE to prevent races.
-- ============================================

CREATE OR REPLACE FUNCTION fund_escrow(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
  v_buyer users%ROWTYPE;
BEGIN
  -- Lock the transaction row to prevent concurrent fund attempts
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can fund this transaction';
  END IF;

  IF v_tx.status != 'accepted' THEN
    RAISE EXCEPTION 'Transaction must be accepted before funding';
  END IF;

  -- Lock the buyer row to prevent concurrent balance modifications
  SELECT * INTO v_buyer FROM users WHERE id = v_tx.buyer_id FOR UPDATE;

  IF v_buyer.wallet_balance < v_tx.price THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  -- Debit buyer wallet, credit locked balance
  UPDATE users
    SET wallet_balance = wallet_balance - v_tx.price,
        locked_balance = locked_balance + v_tx.price
  WHERE id = v_tx.buyer_id;

  -- Create ledger entry
  INSERT INTO escrow_ledger (transaction_id, from_user_id, amount, type, status)
  VALUES (p_transaction_id, v_tx.buyer_id, v_tx.price, 'fund', 'locked');

  -- Advance transaction status
  UPDATE transactions
    SET status = 'funded',
        funded_at = NOW()
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
