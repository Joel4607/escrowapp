-- ============================================
-- Fix table-level grants for Data API roles
-- Supabase needs both GRANT (table access) and RLS (row filtering)
-- Run this in the Supabase SQL Editor
-- ============================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Public app tables are accessed from the Expo client as authenticated users.
-- RLS policies above still decide which rows each user can see or change.
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.escrow_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.delivery_tokens TO authenticated;
GRANT SELECT, INSERT ON TABLE public.evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.disputes TO authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fraud_flags TO authenticated;
GRANT SELECT, INSERT ON TABLE public.ratings TO authenticated;

-- Ratings are intentionally readable by anonymous users via the existing
-- "Anyone can read ratings" RLS policy.
GRANT SELECT ON TABLE public.ratings TO anon;

-- Server-side code using the service role should be able to manage app data.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.release_escrow(UUID) TO authenticated;
