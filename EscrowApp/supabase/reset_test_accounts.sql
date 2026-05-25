-- ============================================
-- One-off reset for final-year-project test accounts
--
-- Target accounts:
--   - niijk9811@gmail.com
--   - niitmo567@outlook.com
--
-- This keeps the Auth accounts and public.users profiles, but clears app data:
-- transactions, invites, OTPs, ledgers, disputes, evidence rows, ratings,
-- push tokens, fraud flags, audit logs, seller archives, and simulated balances.
--
-- Run in the Supabase SQL Editor for the same project used by .env.local.
-- ============================================

BEGIN;

CREATE TEMP TABLE _reset_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE _target_emails (
  email TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _target_emails (email)
VALUES
  ('niijk9811@gmail.com'),
  ('niitmo567@outlook.com');

INSERT INTO _reset_users (id, email)
SELECT id, email
FROM auth.users
WHERE lower(email) IN (SELECT email FROM _target_emails)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO _reset_users (id, email)
SELECT id, email
FROM public.users
WHERE lower(email) IN (SELECT email FROM _target_emails)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

DO $$
DECLARE
  v_found_count INT;
  v_profile_count INT;
BEGIN
  SELECT COUNT(*) INTO v_found_count FROM _reset_users;
  SELECT COUNT(*) INTO v_profile_count
  FROM public.users
  WHERE lower(email) IN (SELECT email FROM _target_emails);

  IF v_found_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 target users, found %. Aborting reset.', v_found_count;
  END IF;

  IF v_profile_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 public user profiles, found %. Aborting reset.', v_profile_count;
  END IF;
END $$;

CREATE TEMP TABLE _reset_transactions (
  id UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _reset_transactions (id)
SELECT id
FROM public.transactions
WHERE buyer_id IN (SELECT id FROM _reset_users)
   OR seller_id IN (SELECT id FROM _reset_users);

INSERT INTO _reset_transactions (id)
SELECT id
FROM public.transactions
WHERE lower(seller_contact) IN (SELECT email FROM _target_emails)
ON CONFLICT (id) DO NOTHING;

INSERT INTO _reset_transactions (id)
SELECT transaction_id
FROM public.transaction_invites
WHERE lower(recipient_email) IN (SELECT email FROM _target_emails)
   OR created_by IN (SELECT id FROM _reset_users)
   OR claimed_by_user_id IN (SELECT id FROM _reset_users)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_tx_count INT;
BEGIN
  SELECT COUNT(*) INTO v_tx_count FROM _reset_transactions;
  RAISE NOTICE 'Resetting app data for 2 users and % related transaction(s).', v_tx_count;
END $$;

-- Optional/newer table. Keep this dynamic so the script works even if the
-- seller archive migration has not been applied yet.
DO $$
BEGIN
  IF to_regclass('public.transaction_archives') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.transaction_archives
      WHERE user_id IN (SELECT id FROM pg_temp._reset_users)
         OR transaction_id IN (SELECT id FROM pg_temp._reset_transactions)
    $sql$;
  END IF;
END $$;

DELETE FROM public.otp_challenges
WHERE transaction_invite_id IN (
  SELECT id
  FROM public.transaction_invites
  WHERE transaction_id IN (SELECT id FROM _reset_transactions)
     OR created_by IN (SELECT id FROM _reset_users)
     OR claimed_by_user_id IN (SELECT id FROM _reset_users)
     OR lower(recipient_email) IN (SELECT email FROM _target_emails)
)
   OR lower(email) IN (SELECT email FROM _target_emails);

DELETE FROM public.transaction_invites
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR created_by IN (SELECT id FROM _reset_users)
   OR claimed_by_user_id IN (SELECT id FROM _reset_users)
   OR lower(recipient_email) IN (SELECT email FROM _target_emails);

DELETE FROM public.audit_logs
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR user_id IN (SELECT id FROM _reset_users);

DELETE FROM public.escrow_ledger
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR from_user_id IN (SELECT id FROM _reset_users)
   OR to_user_id IN (SELECT id FROM _reset_users);

DELETE FROM public.delivery_tokens
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR buyer_id IN (SELECT id FROM _reset_users)
   OR seller_id IN (SELECT id FROM _reset_users);

DELETE FROM public.ratings
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR rated_by IN (SELECT id FROM _reset_users)
   OR rated_user IN (SELECT id FROM _reset_users);

DELETE FROM public.evidence
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR uploaded_by IN (SELECT id FROM _reset_users);

DELETE FROM public.fraud_flags
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR user_id IN (SELECT id FROM _reset_users);

DELETE FROM public.disputes
WHERE transaction_id IN (SELECT id FROM _reset_transactions)
   OR opened_by IN (SELECT id FROM _reset_users);

DELETE FROM public.push_tokens
WHERE user_id IN (SELECT id FROM _reset_users);

DELETE FROM public.transactions
WHERE id IN (SELECT id FROM _reset_transactions);

UPDATE public.users
SET
  wallet_balance = 10000.00,
  locked_balance = 0.00,
  trust_score = 100.00,
  is_verified = TRUE,
  updated_at = NOW()
WHERE id IN (SELECT id FROM _reset_users);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verification query: should return the two target profiles with no locked funds.
SELECT
  email,
  wallet_balance,
  locked_balance,
  trust_score,
  is_verified
FROM public.users
WHERE lower(email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
ORDER BY email;

-- Verification query: should return 0.
SELECT COUNT(*) AS remaining_transactions_for_target_accounts
FROM public.transactions
WHERE buyer_id IN (
    SELECT id FROM public.users
    WHERE lower(email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
  )
   OR seller_id IN (
    SELECT id FROM public.users
    WHERE lower(email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
  )
   OR lower(seller_contact) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com');

-- Verification query: should return 0.
SELECT COUNT(*) AS remaining_invites_for_target_accounts
FROM public.transaction_invites
WHERE lower(recipient_email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
   OR created_by IN (
    SELECT id FROM auth.users
    WHERE lower(email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
  )
   OR claimed_by_user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) IN ('niijk9811@gmail.com', 'niitmo567@outlook.com')
  );
