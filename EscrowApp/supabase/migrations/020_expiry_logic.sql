-- ============================================
-- TRANSACTION EXPIRY & AUTO-RELEASE LOGIC
-- 1. Update state machine to allow transitions to 'expired'
-- 2. expire_stale_transactions() — batch function for scheduled cleanup
-- ============================================

-- Allow transitions to 'expired' from pre-funded statuses,
-- and auto-release from inspection statuses.
CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'created'            AND NEW.status IN ('seller_invited', 'accepted', 'rejected', 'expired'))
    OR (OLD.status = 'seller_invited'  AND NEW.status IN ('accepted', 'rejected', 'expired'))
    OR (OLD.status = 'accepted'        AND NEW.status IN ('funded', 'expired'))
    OR (OLD.status = 'funded'          AND NEW.status IN ('in_delivery', 'cancelled'))
    OR (OLD.status = 'in_delivery'     AND NEW.status = 'delivered')
    OR (OLD.status = 'delivered'       AND NEW.status IN ('under_inspection', 'released', 'disputed'))
    OR (OLD.status = 'under_inspection' AND NEW.status IN ('released', 'disputed'))
    OR (OLD.status = 'disputed'        AND NEW.status IN ('admin_review', 'refunded', 'partially_refunded', 'released'))
    OR (OLD.status = 'admin_review'    AND NEW.status IN ('refunded', 'partially_refunded', 'released'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- expire_stale_transactions()
-- Called periodically (via cron or edge function).
-- Handles three cases:
--   1. Pre-funded transactions past delivery deadline → expired
--   2. Inspection period elapsed without buyer action → auto-release to seller
--   3. Expired delivery tokens → marked as used
-- Returns a summary JSON for logging.
-- ============================================
CREATE OR REPLACE FUNCTION expire_stale_transactions()
RETURNS JSON AS $$
DECLARE
  v_expired_count INT := 0;
  v_released_count INT := 0;
  v_tokens_count INT := 0;
  v_tx RECORD;
BEGIN
  -- 1. Expire pre-funded stale transactions
  --    (created/seller_invited/accepted that are past delivery deadline)
  UPDATE transactions
    SET status = 'expired',
        updated_at = NOW()
  WHERE status IN ('created', 'seller_invited', 'accepted')
    AND delivery_deadline < NOW();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- 2. Auto-release after inspection period lapses
  --    inspection_period is stored in hours
  FOR v_tx IN
    SELECT id, buyer_id, seller_id, price
    FROM transactions
    WHERE status IN ('delivered', 'under_inspection')
      AND delivered_at IS NOT NULL
      AND delivered_at + (inspection_period * INTERVAL '1 hour') < NOW()
  LOOP
    -- Credit seller
    UPDATE users
      SET wallet_balance = wallet_balance + v_tx.price
    WHERE id = v_tx.seller_id;

    -- Deduct buyer locked balance
    UPDATE users
      SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
    WHERE id = v_tx.buyer_id;

    -- Complete ledger entry
    UPDATE escrow_ledger
      SET to_user_id = v_tx.seller_id,
          status     = 'completed'
    WHERE transaction_id = v_tx.id
      AND type            = 'fund'
      AND status          = 'locked';

    -- Advance to released
    UPDATE transactions
      SET status      = 'released',
          released_at = NOW(),
          updated_at  = NOW()
    WHERE id = v_tx.id;

    v_released_count := v_released_count + 1;
  END LOOP;

  -- 3. Mark expired delivery tokens
  UPDATE delivery_tokens
    SET is_used = TRUE,
        used_at = NOW()
  WHERE is_used = FALSE
    AND expires_at < NOW();

  GET DIAGNOSTICS v_tokens_count = ROW_COUNT;

  RETURN json_build_object(
    'expired_transactions', v_expired_count,
    'auto_released', v_released_count,
    'expired_tokens', v_tokens_count,
    'ran_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
