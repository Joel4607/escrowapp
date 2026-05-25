-- ============================================
-- Trigger: send simulated release email on status -> released
-- Safe to rerun in the Supabase SQL Editor during development.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION notify_release_email()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'released' AND NEW.seller_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://ktyvdgwdnhgilstuvdtl.supabase.co/functions/v1/send-release-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'transaction_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_transaction_released ON public.transactions;

CREATE TRIGGER on_transaction_released
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_release_email();
