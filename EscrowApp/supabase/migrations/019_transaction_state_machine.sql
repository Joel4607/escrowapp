-- ============================================
-- TRANSACTION STATE MACHINE
-- Enforces valid status transitions at the database level.
-- Any UPDATE that attempts an invalid transition is rejected
-- with a descriptive error, regardless of whether it comes
-- from an RPC, edge function, or (hypothetical) direct write.
-- ============================================

CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'created'          AND NEW.status IN ('seller_invited', 'accepted', 'rejected'))
    OR (OLD.status = 'seller_invited' AND NEW.status IN ('accepted', 'rejected'))
    OR (OLD.status = 'accepted'       AND NEW.status = 'funded')
    OR (OLD.status = 'funded'         AND NEW.status IN ('in_delivery', 'cancelled'))
    OR (OLD.status = 'in_delivery'    AND NEW.status = 'delivered')
    OR (OLD.status = 'delivered'      AND NEW.status IN ('under_inspection', 'released', 'disputed'))
    OR (OLD.status = 'under_inspection' AND NEW.status IN ('released', 'disputed'))
    OR (OLD.status = 'disputed'       AND NEW.status IN ('admin_review', 'refunded', 'partially_refunded', 'released'))
    OR (OLD.status = 'admin_review'   AND NEW.status IN ('refunded', 'partially_refunded', 'released'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_transaction_status_transition
  BEFORE UPDATE OF status ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_status_transition();
