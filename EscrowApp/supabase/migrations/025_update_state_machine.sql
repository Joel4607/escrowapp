-- ============================================
-- 025: Update State Machine for Return States
-- Extends the enforce_status_transition trigger
-- to allow return-related transitions.
-- ============================================

CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    -- Original transitions
    (OLD.status = 'created'            AND NEW.status IN ('seller_invited', 'accepted', 'rejected'))
    OR (OLD.status = 'seller_invited'  AND NEW.status IN ('accepted', 'rejected'))
    OR (OLD.status = 'accepted'        AND NEW.status = 'funded')
    OR (OLD.status = 'funded'          AND NEW.status IN ('in_delivery', 'cancelled'))
    OR (OLD.status = 'in_delivery'     AND NEW.status = 'delivered')
    OR (OLD.status = 'delivered'       AND NEW.status IN ('under_inspection', 'released', 'disputed'))
    OR (OLD.status = 'under_inspection' AND NEW.status IN ('released', 'disputed'))
    -- Dispute transitions
    OR (OLD.status = 'disputed'        AND NEW.status IN ('admin_review', 'refunded', 'partially_refunded', 'released'))
    OR (OLD.status = 'admin_review'    AND NEW.status IN ('refunded', 'partially_refunded', 'released', 'return_approved'))
    -- Return transitions
    OR (OLD.status = 'return_approved'    AND NEW.status IN ('return_in_progress', 'released'))
    OR (OLD.status = 'return_in_progress' AND NEW.status IN ('return_delivered', 'released'))
    OR (OLD.status = 'return_delivered'   AND NEW.status = 'return_inspection')
    OR (OLD.status = 'return_inspection'  AND NEW.status IN ('refunded', 'partially_refunded', 'released'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
