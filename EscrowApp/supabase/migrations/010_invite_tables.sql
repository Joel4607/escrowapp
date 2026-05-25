-- ============================================
-- Web-Link Escrow: Invite + OTP tables
-- Safe to rerun in the Supabase SQL Editor during development.
-- ============================================

-- Invite status enum
DO $$
BEGIN
  CREATE TYPE public.invite_status AS ENUM (
    'pending',
    'viewed',
    'verified',
    'accepted',
    'rejected',
    'revoked',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- OTP purpose enum
DO $$
BEGIN
  CREATE TYPE public.otp_purpose AS ENUM ('seller_verify');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Transaction Invites
CREATE TABLE IF NOT EXISTS public.transaction_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'seller',
  recipient_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status public.invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  viewed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_transaction ON public.transaction_invites(transaction_id);
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON public.transaction_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_recipient ON public.transaction_invites(recipient_email);
CREATE INDEX IF NOT EXISTS idx_invites_status ON public.transaction_invites(status);

-- OTP Challenges
CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_invite_id UUID NOT NULL REFERENCES public.transaction_invites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose public.otp_purpose NOT NULL DEFAULT 'seller_verify',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_invite ON public.otp_challenges(transaction_invite_id);

-- RLS
ALTER TABLE public.transaction_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

-- Recreate policies so the script can be rerun safely.
DROP POLICY IF EXISTS "Invite creators can read own invites"
  ON public.transaction_invites;

CREATE POLICY "Invite creators can read own invites"
  ON public.transaction_invites FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Buyers can create invites"
  ON public.transaction_invites;

CREATE POLICY "Buyers can create invites"
  ON public.transaction_invites FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Admins can read all invites"
  ON public.transaction_invites;

CREATE POLICY "Admins can read all invites"
  ON public.transaction_invites FOR SELECT
  USING (is_admin());

-- OTP: no direct client access. Edge Functions use the service role key.
-- No SELECT/INSERT policies are created for authenticated users.

-- Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Granting table privileges exposes the tables to Supabase's Data API.
-- RLS still controls which rows each role can actually read or mutate.
GRANT SELECT ON public.transaction_invites TO anon;
GRANT SELECT, INSERT, UPDATE ON public.transaction_invites TO authenticated;
GRANT SELECT ON public.otp_challenges TO anon;
GRANT SELECT, INSERT, UPDATE ON public.otp_challenges TO authenticated;
GRANT USAGE ON TYPE public.invite_status TO authenticated;
GRANT USAGE ON TYPE public.otp_purpose TO authenticated;

GRANT ALL ON public.transaction_invites TO service_role;
GRANT ALL ON public.otp_challenges TO service_role;

-- Enable realtime on invites so buyer sees status changes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'transaction_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_invites;
  END IF;
END $$;

-- Refresh PostgREST schema cache for Supabase REST/API access.
NOTIFY pgrst, 'reload schema';
