# Dispute Resolution Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a structured return-and-dispute workflow for the escrow platform that requires physical goods to be returned before refunds, with phased evidence collection, counter-disputes, and automatic deadline enforcement.

**Architecture:** A new `return_transactions` table linked to the original transaction tracks the return lifecycle. The existing `transaction_status` enum is extended with 4 new return states. New RPC functions handle return approval, delivery token generation, receipt confirmation, and counter-disputes. The evidence system is extended with `phase` and `category` columns plus a configurable `evidence_requirements` table. The admin dashboard gets a phase-tabbed evidence viewer and return management UI.

**Tech Stack:** PostgreSQL (Supabase), Deno edge functions, React Native (Expo Router), React (admin dashboard with React Router), NativeWind/Tailwind CSS, TanStack Query

**Spec:** `docs/superpowers/specs/2026-06-04-dispute-resolution-redesign.md`

---

## Phase 1: Database Foundation

All database changes — enums, tables, columns, state machine, RPC functions, RLS policies. This phase produces a fully functional backend with no UI changes.

---

### Task 1: New Enums and Tables Migration

**Files:**
- Create: `EscrowApp/supabase/migrations/024_dispute_return_schema.sql`

- [ ] **Step 1: Write the migration SQL**

Create `EscrowApp/supabase/migrations/024_dispute_return_schema.sql`:

```sql
-- ============================================
-- 024: Dispute Return Schema
-- Adds return_transactions, counter_disputes,
-- evidence_requirements tables, extends enums,
-- and adds columns to existing tables.
-- ============================================

-- 1. New enum: return_status
CREATE TYPE return_status AS ENUM (
  'created',
  'awaiting_shipment',
  'in_transit',
  'delivered',
  'inspection',
  'approved',
  'counter_disputed',
  'resolved',
  'expired'
);

-- 2. Extend transaction_status with return states
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'return_approved' AFTER 'admin_review';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'return_in_progress' AFTER 'return_approved';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'return_delivered' AFTER 'return_in_progress';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'return_inspection' AFTER 'return_delivered';

-- 3. Add columns to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS buyer_location TEXT,
  ADD COLUMN IF NOT EXISTS seller_location TEXT,
  ADD COLUMN IF NOT EXISTS seller_return_conditions TEXT;

-- 4. Add columns to evidence table
ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

-- 5. Create return_transactions table
CREATE TABLE return_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_transaction_id UUID NOT NULL REFERENCES transactions(id),
  dispute_id UUID NOT NULL REFERENCES disputes(id),
  return_deadline TIMESTAMPTZ NOT NULL,
  buyer_location TEXT,
  seller_location TEXT,
  seller_return_conditions TEXT,
  status return_status NOT NULL DEFAULT 'created',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  inspection_deadline TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  admin_notes TEXT
);

CREATE INDEX idx_return_tx_original ON return_transactions(original_transaction_id);
CREATE INDEX idx_return_tx_dispute ON return_transactions(dispute_id);
CREATE INDEX idx_return_tx_status ON return_transactions(status);

-- 6. Create counter_disputes table
CREATE TABLE counter_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_transaction_id UUID NOT NULL REFERENCES return_transactions(id),
  original_dispute_id UUID NOT NULL REFERENCES disputes(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  description TEXT,
  status dispute_status NOT NULL DEFAULT 'open',
  admin_decision TEXT,
  admin_notes TEXT,
  resolution_type TEXT,
  refund_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_counter_dispute_return ON counter_disputes(return_transaction_id);

-- 7. Create evidence_requirements table
CREATE TABLE evidence_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 8. Seed evidence requirements
INSERT INTO evidence_requirements (phase, category, label, description, is_required, sort_order) VALUES
  -- Original (seller pre-delivery)
  ('original', 'front', 'Front view', 'Take a clear photo of the front of the item', true, 1),
  ('original', 'back', 'Back view', 'Take a clear photo of the back of the item', true, 2),
  ('original', 'serial_number', 'Serial number', 'Photograph the serial number, IMEI, or model label', false, 3),
  ('original', 'accessories', 'Accessories', 'Show all included accessories (charger, cables, etc.)', false, 4),
  ('original', 'packaging', 'Packaging', 'Photo of the original packaging', false, 5),
  ('original', 'unique_identifier', 'Unique feature', 'Any distinguishing mark, scratch, or unique feature', false, 6),
  -- Dispute (buyer)
  ('dispute', 'defect', 'Defect area', 'Photograph the specific defect or issue', true, 1),
  ('dispute', 'front', 'Front view', 'Clear photo of the front of the item as received', true, 2),
  ('dispute', 'back', 'Back view', 'Clear photo of the back of the item as received', true, 3),
  ('dispute', 'serial_number', 'Serial number', 'Photograph the serial number to verify identity', false, 4),
  ('dispute', 'accessories', 'Accessories', 'Show the condition of included accessories', false, 5),
  ('dispute', 'unique_identifier', 'Unique feature', 'Any distinguishing mark for product identification', false, 6),
  -- Return shipment (buyer packing to return)
  ('return_shipment', 'seal', 'Sealed package', 'Photo of the sealed package with your signature across the seal', true, 1),
  ('return_shipment', 'front', 'Front view', 'Front of the item before packaging', true, 2),
  ('return_shipment', 'back', 'Back view', 'Back of the item before packaging', true, 3),
  ('return_shipment', 'serial_number', 'Serial number', 'Serial number visible for identity verification', false, 4),
  ('return_shipment', 'accessories', 'Accessories', 'All accessories being returned', false, 5),
  ('return_shipment', 'packaging', 'Packaging', 'The packaging being used for return', false, 6),
  -- Return receipt (seller receiving return)
  ('return_receipt', 'seal_condition', 'Seal condition', 'Photograph the seal BEFORE opening to prove it arrived intact or tampered', true, 1),
  ('return_receipt', 'front', 'Front view', 'Front of the returned item after opening', true, 2),
  ('return_receipt', 'back', 'Back view', 'Back of the returned item after opening', true, 3),
  ('return_receipt', 'defect', 'Defect area', 'Any damage or defects found on the returned item', false, 4),
  ('return_receipt', 'serial_number', 'Serial number', 'Verify the serial number matches the original', false, 5),
  ('return_receipt', 'accessories', 'Accessories', 'Check all accessories were returned', false, 6),
  ('return_receipt', 'unique_identifier', 'Unique feature', 'Verify unique identifying features match', false, 7),
  -- Counter dispute (seller)
  ('counter_dispute', 'defect', 'Damage evidence', 'Photograph the damage or issue with the returned item', true, 1),
  ('counter_dispute', 'front', 'Front view', 'Front of the item showing its current condition', true, 2),
  ('counter_dispute', 'back', 'Back view', 'Back of the item showing its current condition', true, 3),
  ('counter_dispute', 'serial_number', 'Serial number', 'Verify the serial number matches', false, 4),
  ('counter_dispute', 'unique_identifier', 'Unique feature', 'Compare unique features against original photos', false, 5);

-- 9. RLS policies for new tables
ALTER TABLE return_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_requirements ENABLE ROW LEVEL SECURITY;

-- Return transactions: parties can read their own, admins can read all
CREATE POLICY "Transaction parties can read return transactions"
  ON return_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = return_transactions.original_transaction_id
        AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert return transactions"
  ON return_transactions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "Admins can update return transactions"
  ON return_transactions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = return_transactions.original_transaction_id
        AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
  );

-- Counter disputes: parties can read, seller can insert, admin can update
CREATE POLICY "Transaction parties can read counter disputes"
  ON counter_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM return_transactions rt
        JOIN transactions t ON t.id = rt.original_transaction_id
      WHERE rt.id = counter_disputes.return_transaction_id
        AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "Sellers can insert counter disputes"
  ON counter_disputes FOR INSERT
  WITH CHECK (auth.uid() = opened_by);

CREATE POLICY "Admins can update counter disputes"
  ON counter_disputes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Evidence requirements: everyone can read (public config)
CREATE POLICY "Anyone can read evidence requirements"
  ON evidence_requirements FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage evidence requirements"
  ON evidence_requirements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Grant access to authenticated users
GRANT SELECT ON return_transactions TO authenticated;
GRANT SELECT ON counter_disputes TO authenticated;
GRANT SELECT ON evidence_requirements TO authenticated;
GRANT INSERT ON counter_disputes TO authenticated;
```

- [ ] **Step 2: Apply migration to remote database**

Run:
```bash
cd EscrowApp && npx supabase db query --linked -f supabase/migrations/024_dispute_return_schema.sql
```

Expected: Empty rows result (success).

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/supabase/migrations/024_dispute_return_schema.sql
git commit -m "feat: add return_transactions, counter_disputes, evidence_requirements schema"
```

---

### Task 2: Update State Machine Trigger

**Files:**
- Create: `EscrowApp/supabase/migrations/025_update_state_machine.sql`

- [ ] **Step 1: Write the migration**

Create `EscrowApp/supabase/migrations/025_update_state_machine.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run:
```bash
cd EscrowApp && npx supabase db query --linked -f supabase/migrations/025_update_state_machine.sql
```

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/supabase/migrations/025_update_state_machine.sql
git commit -m "feat: extend state machine trigger with return transitions"
```

---

### Task 3: Admin Approve Return RPC

**Files:**
- Create: `EscrowApp/supabase/migrations/026_return_rpc_functions.sql`

- [ ] **Step 1: Write the RPC functions**

Create `EscrowApp/supabase/migrations/026_return_rpc_functions.sql`:

```sql
-- ============================================
-- 026: Return RPC Functions
-- All server-side functions for the return workflow.
-- ============================================


-- ============================================
-- admin_approve_return(p_dispute_id, p_deadline_days, p_admin_notes)
-- Called by admin. Creates a return_transaction, updates
-- dispute and transaction statuses.
-- ============================================

CREATE OR REPLACE FUNCTION admin_approve_return(
  p_dispute_id UUID,
  p_deadline_days INTEGER,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_dispute disputes%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
  v_return_id UUID;
  v_deadline TIMESTAMPTZ;
BEGIN
  -- Verify admin
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can approve returns';
  END IF;

  -- Validate deadline
  IF p_deadline_days < 1 OR p_deadline_days > 30 THEN
    RAISE EXCEPTION 'Deadline must be between 1 and 30 days';
  END IF;

  -- Get dispute
  SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  IF v_dispute.status = 'resolved' THEN RAISE EXCEPTION 'Dispute is already resolved'; END IF;

  -- Get transaction
  SELECT * INTO v_tx FROM transactions WHERE id = v_dispute.transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  -- Check no existing active return
  IF EXISTS (
    SELECT 1 FROM return_transactions
    WHERE original_transaction_id = v_tx.id
      AND status NOT IN ('expired', 'resolved', 'approved')
  ) THEN
    RAISE EXCEPTION 'An active return already exists for this transaction';
  END IF;

  v_deadline := NOW() + (p_deadline_days || ' days')::INTERVAL;

  -- Create return transaction
  INSERT INTO return_transactions (
    original_transaction_id, dispute_id, return_deadline,
    buyer_location, seller_location, seller_return_conditions,
    status, created_by, admin_notes
  ) VALUES (
    v_tx.id, p_dispute_id, v_deadline,
    v_tx.buyer_location, v_tx.seller_location, v_tx.seller_return_conditions,
    'created', v_admin_id, p_admin_notes
  ) RETURNING id INTO v_return_id;

  -- Update dispute status
  UPDATE disputes
    SET status = 'under_review',
        admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_dispute_id;

  -- Update transaction status
  UPDATE transactions
    SET status = 'return_approved'
  WHERE id = v_tx.id;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, v_admin_id, 'admin', 'RETURN_APPROVED',
    COALESCE(p_admin_notes, 'Admin approved product return'),
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'return_transaction_id', v_return_id,
      'deadline_days', p_deadline_days,
      'deadline', v_deadline
    )
  );

  RETURN json_build_object(
    'success', true,
    'return_transaction_id', v_return_id,
    'deadline', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- generate_return_delivery_token(p_return_transaction_id)
-- Called by the buyer. Generates a return token and
-- updates the return transaction to 'in_transit'.
-- ============================================

CREATE OR REPLACE FUNCTION generate_return_delivery_token(
  p_return_transaction_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  -- Only buyer can generate return token
  IF v_tx.buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can generate a return delivery token';
  END IF;

  -- Must be in created or awaiting_shipment status
  IF v_rt.status NOT IN ('created', 'awaiting_shipment') THEN
    RAISE EXCEPTION 'Return is not awaiting shipment';
  END IF;

  -- Check deadline hasn't passed
  IF v_rt.return_deadline < NOW() THEN
    RAISE EXCEPTION 'Return deadline has passed';
  END IF;

  -- Generate token
  v_token := upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));
  v_expires_at := v_rt.return_deadline;

  -- Store in delivery_tokens (reuse existing table)
  INSERT INTO delivery_tokens (transaction_id, seller_id, buyer_id, token_hash, expires_at)
  VALUES (v_rt.original_transaction_id, v_tx.seller_id, v_tx.buyer_id, v_token, v_expires_at);

  -- Update return transaction
  UPDATE return_transactions
    SET status = 'in_transit',
        shipped_at = NOW()
  WHERE id = p_return_transaction_id;

  -- Update original transaction
  UPDATE transactions
    SET status = 'return_in_progress'
  WHERE id = v_rt.original_transaction_id;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_rt.original_transaction_id, auth.uid(), 'buyer', 'RETURN_SHIPPED',
    'Buyer generated return delivery token and shipped item',
    jsonb_build_object('return_transaction_id', p_return_transaction_id)
  );

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- confirm_return_delivery(p_return_transaction_id, p_token)
-- Called by the seller. Validates the return token,
-- confirms receipt, starts inspection period.
-- ============================================

CREATE OR REPLACE FUNCTION confirm_return_delivery(
  p_return_transaction_id UUID,
  p_token TEXT
)
RETURNS void AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_token delivery_tokens%ROWTYPE;
  v_trimmed TEXT;
  v_inspection_deadline TIMESTAMPTZ;
BEGIN
  v_trimmed := upper(trim(p_token));

  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  -- Only seller can confirm
  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can confirm return delivery';
  END IF;

  IF v_rt.status != 'in_transit' THEN
    RAISE EXCEPTION 'Return is not in transit';
  END IF;

  -- Validate token (reuse delivery_tokens table)
  SELECT * INTO v_token
  FROM delivery_tokens
  WHERE transaction_id = v_rt.original_transaction_id
    AND token_hash = v_trimmed
    AND is_used = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used return token';
  END IF;

  -- Mark token used
  UPDATE delivery_tokens
    SET is_used = true, used_at = NOW()
  WHERE id = v_token.id;

  -- Set inspection deadline (same as original inspection period)
  v_inspection_deadline := NOW() + (v_tx.inspection_period || ' hours')::INTERVAL;

  -- Update return transaction
  UPDATE return_transactions
    SET status = 'inspection',
        delivered_at = NOW(),
        inspection_deadline = v_inspection_deadline
  WHERE id = p_return_transaction_id;

  -- Update original transaction
  UPDATE transactions
    SET status = 'return_delivered'
  WHERE id = v_rt.original_transaction_id;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_rt.original_transaction_id, auth.uid(), 'seller', 'RETURN_RECEIVED',
    'Seller confirmed receipt of returned item',
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'inspection_deadline', v_inspection_deadline
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- approve_return(p_return_transaction_id)
-- Called by the seller. Approves the return condition,
-- triggers full refund to buyer.
-- ============================================

CREATE OR REPLACE FUNCTION approve_return(p_return_transaction_id UUID)
RETURNS void AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can approve a return';
  END IF;

  IF v_rt.status != 'inspection' THEN
    RAISE EXCEPTION 'Return is not under inspection';
  END IF;

  -- Refund buyer
  UPDATE users SET wallet_balance = wallet_balance + v_tx.price
  WHERE id = v_tx.buyer_id;

  UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price)
  WHERE id = v_tx.buyer_id;

  -- Update ledger
  UPDATE escrow_ledger SET status = 'failed'
  WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

  INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
  VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');

  -- Update return transaction
  UPDATE return_transactions
    SET status = 'approved',
        resolved_at = NOW(),
        resolution = 'approved'
  WHERE id = p_return_transaction_id;

  -- Update original transaction
  UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

  -- Resolve the original dispute
  UPDATE disputes
    SET status = 'resolved',
        admin_decision = 'return_approved_by_seller',
        resolution_type = 'refund',
        resolved_at = NOW()
  WHERE id = v_rt.dispute_id;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, auth.uid(), 'seller', 'RETURN_APPROVED_BY_SELLER',
    'Seller approved return. Full refund issued to buyer.',
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'refund_amount', v_tx.price
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- raise_counter_dispute(p_return_transaction_id, p_reason, p_description)
-- Called by the seller during return inspection.
-- ============================================

CREATE OR REPLACE FUNCTION raise_counter_dispute(
  p_return_transaction_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_counter_id UUID;
BEGIN
  IF trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_rt FROM return_transactions WHERE id = p_return_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;

  IF v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the seller can raise a counter-dispute';
  END IF;

  IF v_rt.status != 'inspection' THEN
    RAISE EXCEPTION 'Counter-disputes can only be raised during return inspection';
  END IF;

  -- Check no existing active counter-dispute
  IF EXISTS (
    SELECT 1 FROM counter_disputes
    WHERE return_transaction_id = p_return_transaction_id
      AND status != 'resolved'
  ) THEN
    RAISE EXCEPTION 'An active counter-dispute already exists for this return';
  END IF;

  -- Create counter-dispute
  INSERT INTO counter_disputes (
    return_transaction_id, original_dispute_id, opened_by,
    reason, description, status
  ) VALUES (
    p_return_transaction_id, v_rt.dispute_id, auth.uid(),
    trim(p_reason), nullif(trim(p_description), ''), 'open'
  ) RETURNING id INTO v_counter_id;

  -- Update return transaction status
  UPDATE return_transactions
    SET status = 'counter_disputed'
  WHERE id = p_return_transaction_id;

  -- Keep original transaction at return_inspection
  -- (admin will resolve from here)

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, auth.uid(), 'seller', 'COUNTER_DISPUTE_RAISED',
    'Seller raised counter-dispute on returned item: ' || trim(p_reason),
    jsonb_build_object(
      'return_transaction_id', p_return_transaction_id,
      'counter_dispute_id', v_counter_id,
      'reason', trim(p_reason)
    )
  );

  RETURN v_counter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- admin_resolve_counter_dispute(p_counter_dispute_id, p_decision, p_admin_notes, p_refund_amount)
-- Admin resolves a counter-dispute on a return.
-- ============================================

CREATE OR REPLACE FUNCTION admin_resolve_counter_dispute(
  p_counter_dispute_id UUID,
  p_decision TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_cd counter_disputes%ROWTYPE;
  v_rt return_transactions%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_admin_id UUID := auth.uid();
  v_admin_role TEXT;
  v_seller_amount NUMERIC;
BEGIN
  -- Verify admin
  SELECT role INTO v_admin_role FROM users WHERE id = v_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can resolve counter-disputes';
  END IF;

  IF p_decision NOT IN ('refund_buyer', 'release_to_seller', 'partial_refund') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_cd FROM counter_disputes WHERE id = p_counter_dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Counter-dispute not found'; END IF;
  IF v_cd.status = 'resolved' THEN RAISE EXCEPTION 'Counter-dispute already resolved'; END IF;

  SELECT * INTO v_rt FROM return_transactions WHERE id = v_cd.return_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return transaction not found'; END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  -- Handle fund movements based on decision
  IF p_decision = 'refund_buyer' THEN
    -- Full refund to buyer
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.buyer_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET status = 'failed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');
    UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

  ELSIF p_decision = 'release_to_seller' THEN
    -- Full release to seller
    UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.seller_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET to_user_id = v_tx.seller_id, status = 'completed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    UPDATE transactions SET status = 'released', released_at = NOW() WHERE id = v_tx.id;

  ELSIF p_decision = 'partial_refund' THEN
    IF p_refund_amount <= 0 OR p_refund_amount >= v_tx.price THEN
      RAISE EXCEPTION 'Refund amount must be between 0 and %', v_tx.price;
    END IF;
    v_seller_amount := v_tx.price - p_refund_amount;

    UPDATE users SET wallet_balance = wallet_balance + p_refund_amount WHERE id = v_tx.buyer_id;
    UPDATE users SET wallet_balance = wallet_balance + v_seller_amount WHERE id = v_tx.seller_id;
    UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
    UPDATE escrow_ledger SET status = 'completed'
      WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.buyer_id, v_tx.buyer_id, p_refund_amount, 'partial_refund', 'completed');
    INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
      VALUES (v_tx.id, v_tx.buyer_id, v_tx.seller_id, v_seller_amount, 'release', 'completed');
    UPDATE transactions SET status = 'partially_refunded' WHERE id = v_tx.id;
  END IF;

  -- Resolve counter-dispute
  UPDATE counter_disputes
    SET status = 'resolved',
        admin_decision = p_decision,
        admin_notes = p_admin_notes,
        resolution_type = p_decision,
        refund_amount = p_refund_amount,
        resolved_at = NOW()
  WHERE id = p_counter_dispute_id;

  -- Resolve return transaction
  UPDATE return_transactions
    SET status = 'resolved',
        resolved_at = NOW(),
        resolution = 'counter_disputed'
  WHERE id = v_cd.return_transaction_id;

  -- Resolve original dispute
  UPDATE disputes
    SET status = 'resolved',
        admin_decision = 'counter_dispute_' || p_decision,
        resolution_type = CASE p_decision
          WHEN 'refund_buyer' THEN 'refund'
          WHEN 'release_to_seller' THEN 'release'
          WHEN 'partial_refund' THEN 'partial_refund'
        END,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
  WHERE id = v_rt.dispute_id;

  -- Audit log
  INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
  VALUES (
    v_tx.id, v_admin_id, 'admin',
    'COUNTER_DISPUTE_RESOLVED_' || UPPER(p_decision),
    COALESCE(p_admin_notes, 'Admin resolved counter-dispute: ' || p_decision),
    jsonb_build_object(
      'counter_dispute_id', p_counter_dispute_id,
      'return_transaction_id', v_cd.return_transaction_id,
      'decision', p_decision,
      'refund_amount', p_refund_amount,
      'transaction_price', v_tx.price
    )
  );

  RETURN json_build_object(
    'success', true,
    'decision', p_decision,
    'counter_dispute_id', p_counter_dispute_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- expire_overdue_returns()
-- Called by cron. Expires returns past deadline
-- where buyer hasn't shipped, releasing funds to seller.
-- ============================================

CREATE OR REPLACE FUNCTION expire_overdue_returns()
RETURNS JSON AS $$
DECLARE
  v_rt RECORD;
  v_tx transactions%ROWTYPE;
  v_expired_count INTEGER := 0;
BEGIN
  FOR v_rt IN
    SELECT * FROM return_transactions
    WHERE status IN ('created', 'awaiting_shipment')
      AND return_deadline < NOW()
    FOR UPDATE
  LOOP
    SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;

    IF FOUND THEN
      -- Release funds to seller
      UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.seller_id;
      UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
      UPDATE escrow_ledger SET to_user_id = v_tx.seller_id, status = 'completed'
        WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';

      -- Update statuses
      UPDATE return_transactions
        SET status = 'expired', resolved_at = NOW(), resolution = 'expired'
      WHERE id = v_rt.id;

      UPDATE transactions SET status = 'released', released_at = NOW()
      WHERE id = v_tx.id;

      UPDATE disputes
        SET status = 'resolved',
            admin_decision = 'return_expired',
            resolution_type = 'release',
            resolved_at = NOW()
      WHERE id = v_rt.dispute_id;

      INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
      VALUES (
        v_tx.id, v_tx.buyer_id, 'system', 'RETURN_EXPIRED',
        'Return deadline expired. Funds released to seller.',
        jsonb_build_object('return_transaction_id', v_rt.id)
      );

      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  -- Also auto-approve returns where seller inspection period expired
  FOR v_rt IN
    SELECT * FROM return_transactions
    WHERE status = 'inspection'
      AND inspection_deadline IS NOT NULL
      AND inspection_deadline < NOW()
    FOR UPDATE
  LOOP
    SELECT * INTO v_tx FROM transactions WHERE id = v_rt.original_transaction_id FOR UPDATE;

    IF FOUND THEN
      -- Refund buyer (auto-approved)
      UPDATE users SET wallet_balance = wallet_balance + v_tx.price WHERE id = v_tx.buyer_id;
      UPDATE users SET locked_balance = GREATEST(0, locked_balance - v_tx.price) WHERE id = v_tx.buyer_id;
      UPDATE escrow_ledger SET status = 'failed'
        WHERE transaction_id = v_tx.id AND type = 'fund' AND status = 'locked';
      INSERT INTO escrow_ledger (transaction_id, from_user_id, to_user_id, amount, type, status)
        VALUES (v_tx.id, v_tx.seller_id, v_tx.buyer_id, v_tx.price, 'refund', 'completed');

      UPDATE return_transactions
        SET status = 'approved', resolved_at = NOW(), resolution = 'auto_approved'
      WHERE id = v_rt.id;

      UPDATE transactions SET status = 'refunded' WHERE id = v_tx.id;

      UPDATE disputes
        SET status = 'resolved',
            admin_decision = 'return_auto_approved',
            resolution_type = 'refund',
            resolved_at = NOW()
      WHERE id = v_rt.dispute_id;

      INSERT INTO audit_logs (transaction_id, user_id, user_role, action, description, metadata)
      VALUES (
        v_tx.id, v_tx.seller_id, 'system', 'RETURN_AUTO_APPROVED',
        'Seller inspection period expired. Return auto-approved. Buyer refunded.',
        jsonb_build_object('return_transaction_id', v_rt.id)
      );

      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('expired_count', v_expired_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_approve_return(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_return_delivery_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_return_delivery(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_return(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION raise_counter_dispute(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_counter_dispute(UUID, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_overdue_returns() TO authenticated;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
cd EscrowApp && npx supabase db query --linked -f supabase/migrations/026_return_rpc_functions.sql
```

- [ ] **Step 3: Update the cron-expire edge function to also call expire_overdue_returns**

Modify `EscrowApp/supabase/functions/cron-expire/index.ts` — after the existing `expire_stale_transactions` call, add:

```typescript
    const { data: returnData, error: returnError } = await supabase.rpc("expire_overdue_returns");

    if (returnError) {
      return new Response(
        JSON.stringify({ error: returnError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, transactions: data, returns: returnData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
```

- [ ] **Step 4: Deploy cron-expire**

Run:
```bash
cd EscrowApp && npx supabase functions deploy cron-expire --no-verify-jwt
```

- [ ] **Step 5: Commit**

```bash
git add EscrowApp/supabase/migrations/026_return_rpc_functions.sql EscrowApp/supabase/functions/cron-expire/index.ts
git commit -m "feat: add all return workflow RPC functions and expiry logic"
```

---

### Task 4: Regenerate Database Types

**Files:**
- Modify: `EscrowApp/lib/database.types.ts`

- [ ] **Step 1: Regenerate types**

Run:
```bash
cd EscrowApp && npx supabase gen types typescript --project-id ktyvdgwdnhgilstuvdtl > lib/database.types.ts
```

- [ ] **Step 2: Verify the new types include return_transactions, counter_disputes, evidence_requirements**

Open `lib/database.types.ts` and search for `return_transactions`, `counter_disputes`, and `evidence_requirements`. Verify the new enums `return_status` and updated `transaction_status` are present.

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/lib/database.types.ts
git commit -m "chore: regenerate database types with return schema"
```

---

## Phase 2: Mobile App — Buyer & Seller Return Flows

New screens for the return workflow and updates to existing screens.

---

### Task 5: Return Transaction Hook

**Files:**
- Create: `EscrowApp/features/returns/use-return-transaction.ts`

- [ ] **Step 1: Create the hook**

Create `EscrowApp/features/returns/use-return-transaction.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useCallback } from "react";

type ReturnTransaction = Database["public"]["Tables"]["return_transactions"]["Row"];

export function useReturnTransaction(originalTransactionId: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery<ReturnTransaction | null>({
    queryKey: ["return-transaction", originalTransactionId],
    queryFn: async () => {
      if (!originalTransactionId) return null;

      const { data: rows, error: queryError } = await supabase
        .from("return_transactions")
        .select("*")
        .eq("original_transaction_id", originalTransactionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) throw queryError;
      return rows;
    },
    enabled: !!originalTransactionId,
  });

  const generateReturnToken = useCallback(
    async (returnTransactionId: string) => {
      const { data: token, error } = await supabase.rpc(
        "generate_return_delivery_token",
        { p_return_transaction_id: returnTransactionId },
      );
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const, token: token as string };
    },
    [originalTransactionId],
  );

  const confirmReturnDelivery = useCallback(
    async (returnTransactionId: string, token: string) => {
      const { error } = await supabase.rpc("confirm_return_delivery", {
        p_return_transaction_id: returnTransactionId,
        p_token: token,
      });
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const };
    },
    [originalTransactionId],
  );

  const approveReturn = useCallback(
    async (returnTransactionId: string) => {
      const { error } = await supabase.rpc("approve_return", {
        p_return_transaction_id: returnTransactionId,
      });
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const };
    },
    [originalTransactionId],
  );

  const raiseCounterDispute = useCallback(
    async (returnTransactionId: string, reason: string, description?: string) => {
      const { data: counterDisputeId, error } = await supabase.rpc(
        "raise_counter_dispute",
        {
          p_return_transaction_id: returnTransactionId,
          p_reason: reason,
          p_description: description,
        },
      );
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const, counterDisputeId: counterDisputeId as string };
    },
    [originalTransactionId],
  );

  return {
    returnTransaction: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    generateReturnToken,
    confirmReturnDelivery,
    approveReturn,
    raiseCounterDispute,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/features/returns/use-return-transaction.ts
git commit -m "feat: add useReturnTransaction hook with all return actions"
```

---

### Task 6: Evidence Requirements Hook

**Files:**
- Create: `EscrowApp/features/evidence/use-evidence-requirements.ts`

- [ ] **Step 1: Create the hook**

Create `EscrowApp/features/evidence/use-evidence-requirements.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useQuery } from "@tanstack/react-query";

type EvidenceRequirement = Database["public"]["Tables"]["evidence_requirements"]["Row"];

export function useEvidenceRequirements(phase: string | undefined) {
  const { data, isLoading } = useQuery<EvidenceRequirement[]>({
    queryKey: ["evidence-requirements", phase],
    queryFn: async () => {
      if (!phase) return [];
      const { data: rows, error } = await supabase
        .from("evidence_requirements")
        .select("*")
        .eq("phase", phase)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!phase,
    staleTime: 1000 * 60 * 30, // cache 30 min — these rarely change
  });

  return {
    requirements: data ?? [],
    isLoading,
    requiredCategories: (data ?? []).filter((r) => r.is_required).map((r) => r.category),
    optionalCategories: (data ?? []).filter((r) => !r.is_required).map((r) => r.category),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/features/evidence/use-evidence-requirements.ts
git commit -m "feat: add useEvidenceRequirements hook"
```

---

### Task 7: Guided Evidence Capture Component

**Files:**
- Create: `EscrowApp/features/evidence/components/guided-evidence-capture.tsx`

- [ ] **Step 1: Create the component**

Create `EscrowApp/features/evidence/components/guided-evidence-capture.tsx`:

```typescript
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useEvidenceRequirements } from "@/features/evidence/use-evidence-requirements";
import { EvidenceUploadButton } from "./evidence-upload-button";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import type { Database } from "@/lib/database.types";
import { Camera, CheckCircle, Circle } from "lucide-react-native";
import { useState, useMemo } from "react";
import { Image, ScrollView, View, Pressable } from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

type Props = {
  phase: string;
  evidenceType: EvidenceType;
  existingEvidence: Evidence[];
  onImageSelected: (uri: string, type: EvidenceType, category: string) => void;
  uploading: boolean;
  disabled?: boolean;
};

export function GuidedEvidenceCapture({
  phase,
  evidenceType,
  existingEvidence,
  onImageSelected,
  uploading,
  disabled = false,
}: Props) {
  const { requirements, isLoading } = useEvidenceRequirements(phase);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Check which categories already have photos
  const completedCategories = useMemo(() => {
    const completed = new Set<string>();
    for (const ev of existingEvidence) {
      if (ev.phase === phase && ev.category) {
        completed.add(ev.category);
      }
    }
    return completed;
  }, [existingEvidence, phase]);

  const requiredComplete = useMemo(() => {
    return requirements
      .filter((r) => r.is_required)
      .every((r) => completedCategories.has(r.category));
  }, [requirements, completedCategories]);

  if (isLoading) return null;

  const required = requirements.filter((r) => r.is_required);
  const optional = requirements.filter((r) => !r.is_required);

  return (
    <View className="gap-3">
      {/* Required photos */}
      {required.length > 0 && (
        <View className="gap-2">
          <Text className="text-foreground text-sm font-semibold">
            Required Photos
          </Text>
          {required.map((req) => {
            const done = completedCategories.has(req.category);
            return (
              <View
                key={req.id}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  done ? "bg-primary/5 border-primary/30" : "bg-secondary border-border"
                }`}
              >
                <Icon
                  as={done ? CheckCircle : Circle}
                  className={done ? "text-primary" : "text-muted-foreground"}
                  size={20}
                />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-medium">
                    {req.label}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {req.description}
                  </Text>
                </View>
                {!done && !disabled && (
                  <EvidenceUploadButton
                    onImageSelected={(uri) =>
                      onImageSelected(uri, evidenceType, req.category)
                    }
                    evidenceType={evidenceType}
                    label="Add"
                    uploading={uploading}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Optional photos */}
      {optional.length > 0 && (
        <View className="gap-2">
          <Text className="text-foreground text-sm font-semibold">
            Optional Photos
          </Text>
          {optional.map((req) => {
            const done = completedCategories.has(req.category);
            return (
              <View
                key={req.id}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  done ? "bg-primary/5 border-primary/30" : "bg-secondary border-border"
                }`}
              >
                <Icon
                  as={done ? CheckCircle : Circle}
                  className={done ? "text-primary" : "text-muted-foreground"}
                  size={20}
                />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-medium">
                    {req.label}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {req.description}
                  </Text>
                </View>
                {!done && !disabled && (
                  <EvidenceUploadButton
                    onImageSelected={(uri) =>
                      onImageSelected(uri, evidenceType, req.category)
                    }
                    evidenceType={evidenceType}
                    label="Add"
                    uploading={uploading}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Completion status */}
      {!requiredComplete && required.length > 0 && (
        <Text className="text-destructive text-xs text-center">
          Complete all required photos before proceeding
        </Text>
      )}
    </View>
  );
}

export { type Props as GuidedEvidenceCaptureProps };
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/features/evidence/components/guided-evidence-capture.tsx
git commit -m "feat: add GuidedEvidenceCapture component with required/optional checklist"
```

---

### Task 8: Update Evidence Hook to Support Phase and Category

**Files:**
- Modify: `EscrowApp/features/evidence/use-evidence.ts`

- [ ] **Step 1: Update the uploadEvidence function signature**

In `EscrowApp/features/evidence/use-evidence.ts`, update the `uploadEvidence` function to accept `phase` and `category` parameters:

Find the type definition of the upload params and add `phase` and `category`:

```typescript
    async ({
      imageUri,
      evidenceType,
      notes,
      phase,
      category,
    }: {
      imageUri: string;
      evidenceType: EvidenceType;
      notes?: string;
      phase?: string;
      category?: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
```

Then in the INSERT statement, add the new columns:

```typescript
        const { error: insertError } = await supabase.from("evidence").insert({
          transaction_id: transactionId,
          uploaded_by: userId,
          user_role: userRole as "buyer" | "seller" | "admin",
          evidence_type: evidenceType,
          image_url: storagePath,
          notes: notes ?? null,
          timestamp: new Date().toISOString(),
          phase: phase ?? "original",
          category: category ?? "other",
        });
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/features/evidence/use-evidence.ts
git commit -m "feat: add phase and category params to evidence upload"
```

---

### Task 9: Buyer Return Shipment Screen

**Files:**
- Create: `EscrowApp/app/transaction/return-shipment.tsx`

- [ ] **Step 1: Create the return shipment screen**

Create `EscrowApp/app/transaction/return-shipment.tsx`:

```typescript
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScreenLoader, ScreenError } from "@/components/screen-state";
import { useAuth } from "@/features/auth/auth-context";
import { useReturnTransaction } from "@/features/returns/use-return-transaction";
import { useEvidence } from "@/features/evidence/use-evidence";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import { GuidedEvidenceCapture } from "@/features/evidence/components/guided-evidence-capture";
import { EvidenceGallery } from "@/features/evidence/components/evidence-gallery";
import { formatRelativeDate } from "@/lib/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReturnShipmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const {
    returnTransaction,
    isLoading,
    error,
    generateReturnToken,
    refetch,
  } = useReturnTransaction(id);
  const {
    evidence,
    isLoading: evidenceLoading,
    uploadEvidence,
    deleteEvidence,
  } = useEvidence(id);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const returnEvidence = useMemo(
    () => evidence.filter((e) => e.phase === "return_shipment"),
    [evidence],
  );

  // Check if all required photos are uploaded
  const requiredCategories = ["seal", "front", "back"];
  const completedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of returnEvidence) {
      if (e.category) cats.add(e.category);
    }
    return cats;
  }, [returnEvidence]);
  const allRequiredDone = requiredCategories.every((c) => completedCategories.has(c));

  const handleImageSelected = async (uri: string, type: EvidenceType, category: string) => {
    setUploading(true);
    const result = await uploadEvidence({
      imageUri: uri,
      evidenceType: type,
      phase: "return_shipment",
      category,
    });
    setUploading(false);
    if (!result.ok) {
      Alert.alert("Upload Failed", result.error);
    }
  };

  const handleGenerateToken = async () => {
    if (!returnTransaction) return;

    if (!allRequiredDone) {
      Alert.alert("Required Photos", "Please upload all required photos before generating the return token.");
      return;
    }

    setGenerating(true);
    const result = await generateReturnToken(returnTransaction.id);
    setGenerating(false);

    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      refetch();
      router.push({
        pathname: "/transaction/token-qr",
        params: { token: result.token },
      });
    }
  };

  if (isLoading) return <ScreenLoader message="Loading return details..." />;
  if (error || !returnTransaction) {
    return <ScreenError message={error ?? "Return not found."} onRetry={refetch} />;
  }

  const deadlineDate = new Date(returnTransaction.return_deadline);
  const isExpired = deadlineDate < new Date();
  const canGenerateToken = returnTransaction.status === "created" || returnTransaction.status === "awaiting_shipment";

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Deadline banner */}
        <Card className="p-4 gap-2">
          <Text className="text-foreground font-semibold">Return Deadline</Text>
          <Text className={`text-lg font-bold ${isExpired ? "text-destructive" : "text-primary"}`}>
            {deadlineDate.toLocaleDateString()} ({isExpired ? "EXPIRED" : formatRelativeDate(returnTransaction.return_deadline)})
          </Text>
          {isExpired && (
            <Text className="text-destructive text-sm">
              The return deadline has passed. Funds will be released to the seller.
            </Text>
          )}
        </Card>

        {/* Seller return conditions */}
        {returnTransaction.seller_return_conditions && (
          <Card className="p-4 gap-2">
            <Text className="text-foreground font-semibold">Seller Return Conditions</Text>
            <Text className="text-muted-foreground text-sm">
              {returnTransaction.seller_return_conditions}
            </Text>
          </Card>
        )}

        {/* Instructions */}
        {canGenerateToken && !isExpired && (
          <Card className="p-4 gap-2">
            <Text className="text-foreground font-semibold">Instructions</Text>
            <Text className="text-muted-foreground text-sm">
              1. Package the item securely{"\n"}
              2. Seal the package and sign across the seal{"\n"}
              3. Upload the required photos below{"\n"}
              4. Generate the return delivery token{"\n"}
              5. Include the token with the package or share with the dispatch rider
            </Text>
          </Card>
        )}

        {/* Guided evidence capture */}
        {canGenerateToken && !isExpired && (
          <View className="gap-3">
            <Text className="text-foreground text-base font-semibold">Return Evidence</Text>
            <GuidedEvidenceCapture
              phase="return_shipment"
              evidenceType="delivery_proof"
              existingEvidence={evidence}
              onImageSelected={handleImageSelected}
              uploading={uploading}
            />
          </View>
        )}

        {/* Existing evidence gallery */}
        {returnEvidence.length > 0 && (
          <View className="gap-3">
            <Text className="text-foreground text-base font-semibold">Uploaded Photos</Text>
            <EvidenceGallery
              evidence={returnEvidence}
              isLoading={evidenceLoading}
              currentUserId={session?.user?.id}
              onDelete={deleteEvidence}
            />
          </View>
        )}

        {/* Generate token button */}
        {canGenerateToken && !isExpired && (
          <Button
            onPress={handleGenerateToken}
            disabled={generating || !allRequiredDone}
          >
            <Text className="text-primary-foreground font-semibold">
              {generating ? "Generating..." : "Generate Return Delivery Token"}
            </Text>
          </Button>
        )}

        {/* Already shipped status */}
        {returnTransaction.status === "in_transit" && (
          <Card className="p-4 gap-2 items-center">
            <Text className="text-primary text-lg font-bold">Item Shipped</Text>
            <Text className="text-muted-foreground text-sm text-center">
              Waiting for the seller to confirm receipt of the returned item.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/app/transaction/return-shipment.tsx
git commit -m "feat: add buyer return shipment screen with guided evidence capture"
```

---

### Task 10: Seller Return Inspection Screen

**Files:**
- Create: `EscrowApp/app/transaction/return-inspection.tsx`

- [ ] **Step 1: Create the return inspection screen**

Create `EscrowApp/app/transaction/return-inspection.tsx`:

```typescript
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScreenLoader, ScreenError } from "@/components/screen-state";
import { useAuth } from "@/features/auth/auth-context";
import { useReturnTransaction } from "@/features/returns/use-return-transaction";
import { useEvidence } from "@/features/evidence/use-evidence";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import { GuidedEvidenceCapture } from "@/features/evidence/components/guided-evidence-capture";
import { EvidenceGallery } from "@/features/evidence/components/evidence-gallery";
import { formatRelativeDate, formatCurrency } from "@/lib/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Alert, ScrollView, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COUNTER_DISPUTE_REASONS = [
  "Product returned damaged",
  "Parts removed or swapped",
  "Accessories missing",
  "Product condition differs from return photos",
  "Wrong item returned",
  "Other",
] as const;

export default function ReturnInspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const {
    returnTransaction,
    isLoading,
    error,
    confirmReturnDelivery,
    approveReturn,
    raiseCounterDispute,
    refetch,
  } = useReturnTransaction(id);
  const {
    evidence,
    isLoading: evidenceLoading,
    uploadEvidence,
    deleteEvidence,
  } = useEvidence(id);
  const [uploading, setUploading] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCounterDispute, setShowCounterDispute] = useState(false);
  const [counterReason, setCounterReason] = useState("");
  const [counterDescription, setCounterDescription] = useState("");

  const receiptEvidence = useMemo(
    () => evidence.filter((e) => e.phase === "return_receipt"),
    [evidence],
  );

  const handleImageSelected = async (uri: string, type: EvidenceType, category: string) => {
    setUploading(true);
    const result = await uploadEvidence({
      imageUri: uri,
      evidenceType: type,
      phase: "return_receipt",
      category,
    });
    setUploading(false);
    if (!result.ok) Alert.alert("Upload Failed", result.error);
  };

  const handleConfirmReceipt = async () => {
    if (!returnTransaction || !tokenInput.trim()) return;
    setConfirming(true);
    const result = await confirmReturnDelivery(returnTransaction.id, tokenInput.trim());
    setConfirming(false);
    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      refetch();
    }
  };

  const handleApprove = () => {
    if (!returnTransaction) return;
    Alert.alert(
      "Approve Return",
      "Confirm that the returned item is in acceptable condition? The buyer will receive a full refund.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve & Refund",
          onPress: async () => {
            setProcessing(true);
            const result = await approveReturn(returnTransaction.id);
            setProcessing(false);
            if (!result.ok) Alert.alert("Error", result.error);
            else {
              Alert.alert("Return Approved", "The buyer has been refunded.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            }
          },
        },
      ],
    );
  };

  const handleCounterDispute = async () => {
    if (!returnTransaction || !counterReason) return;
    setProcessing(true);
    const result = await raiseCounterDispute(
      returnTransaction.id,
      counterReason,
      counterDescription.trim() || undefined,
    );
    setProcessing(false);
    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      Alert.alert(
        "Counter-Dispute Raised",
        "An admin will review both parties' evidence and make a decision.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  };

  if (isLoading) return <ScreenLoader message="Loading return details..." />;
  if (error || !returnTransaction) {
    return <ScreenError message={error ?? "Return not found."} onRetry={refetch} />;
  }

  const isInTransit = returnTransaction.status === "in_transit";
  const isInspection = returnTransaction.status === "inspection";

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Token entry — when return is in transit */}
        {isInTransit && (
          <Card className="p-4 gap-3">
            <Text className="text-foreground font-semibold">Confirm Return Receipt</Text>
            <Text className="text-muted-foreground text-sm">
              Enter the return delivery token from the buyer to confirm you received the package.
            </Text>
            <Input
              className="h-14 rounded-xl text-center text-xl tracking-widest"
              placeholder="ENTER TOKEN"
              autoCapitalize="characters"
              value={tokenInput}
              onChangeText={setTokenInput}
            />
            <Button onPress={handleConfirmReceipt} disabled={confirming || !tokenInput.trim()}>
              <Text className="text-primary-foreground font-semibold">
                {confirming ? "Confirming..." : "Confirm Receipt"}
              </Text>
            </Button>
          </Card>
        )}

        {/* Inspection flow */}
        {isInspection && (
          <>
            {/* Deadline */}
            {returnTransaction.inspection_deadline && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold">Inspection Deadline</Text>
                <Text className="text-primary text-lg font-bold">
                  {formatRelativeDate(returnTransaction.inspection_deadline)}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  If you do not approve or raise a counter-dispute before the deadline, the return will be auto-approved and the buyer refunded.
                </Text>
              </Card>
            )}

            {/* Return conditions reminder */}
            {returnTransaction.seller_return_conditions && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold">Your Return Conditions</Text>
                <Text className="text-muted-foreground text-sm">
                  {returnTransaction.seller_return_conditions}
                </Text>
              </Card>
            )}

            {/* Guided evidence capture */}
            <View className="gap-3">
              <Text className="text-foreground text-base font-semibold">Inspect & Photograph</Text>
              <Text className="text-muted-foreground text-sm">
                Photograph the seal BEFORE opening, then inspect the item and capture evidence.
              </Text>
              <GuidedEvidenceCapture
                phase="return_receipt"
                evidenceType="received_item"
                existingEvidence={evidence}
                onImageSelected={handleImageSelected}
                uploading={uploading}
              />
            </View>

            {/* Evidence gallery */}
            {receiptEvidence.length > 0 && (
              <View className="gap-3">
                <Text className="text-foreground text-base font-semibold">Your Photos</Text>
                <EvidenceGallery
                  evidence={receiptEvidence}
                  isLoading={evidenceLoading}
                  currentUserId={session?.user?.id}
                  onDelete={deleteEvidence}
                />
              </View>
            )}

            {/* Decision buttons */}
            {!showCounterDispute && (
              <View className="gap-3">
                <Button onPress={handleApprove} disabled={processing}>
                  <Text className="text-primary-foreground font-semibold">
                    {processing ? "Processing..." : "Approve Return"}
                  </Text>
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setShowCounterDispute(true)}
                  disabled={processing}
                >
                  <Text className="text-destructive font-semibold">
                    Raise Counter-Dispute
                  </Text>
                </Button>
              </View>
            )}

            {/* Counter-dispute form */}
            {showCounterDispute && (
              <Card className="p-4 gap-4">
                <Text className="text-foreground font-semibold">Counter-Dispute</Text>
                <View className="gap-2">
                  <Label nativeID="counter-reason">Reason *</Label>
                  {COUNTER_DISPUTE_REASONS.map((r) => (
                    <Pressable
                      key={r}
                      className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                        counterReason === r
                          ? "bg-destructive/10 border-destructive"
                          : "bg-secondary border-border"
                      }`}
                      onPress={() => setCounterReason(r)}
                    >
                      <View
                        className={`h-4 w-4 rounded-full border ${
                          counterReason === r
                            ? "bg-destructive border-destructive"
                            : "border-muted-foreground"
                        }`}
                      />
                      <Text className="text-foreground text-sm">{r}</Text>
                    </Pressable>
                  ))}
                </View>
                <View className="gap-2">
                  <Label nativeID="counter-desc">Description</Label>
                  <Input
                    aria-labelledby="counter-desc"
                    className="h-24 rounded-xl"
                    placeholder="Describe the issue in detail..."
                    multiline
                    textAlignVertical="top"
                    value={counterDescription}
                    onChangeText={setCounterDescription}
                  />
                </View>
                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={() => setShowCounterDispute(false)}
                  >
                    <Text className="text-foreground font-medium">Cancel</Text>
                  </Button>
                  <Button
                    className="flex-1 bg-destructive"
                    onPress={handleCounterDispute}
                    disabled={processing || !counterReason}
                  >
                    <Text className="text-destructive-foreground font-semibold">
                      {processing ? "Submitting..." : "Submit"}
                    </Text>
                  </Button>
                </View>
              </Card>
            )}
          </>
        )}

        {/* Counter-disputed status */}
        {returnTransaction.status === "counter_disputed" && (
          <Card className="p-4 gap-2 items-center">
            <Text className="text-destructive text-lg font-bold">Counter-Dispute Filed</Text>
            <Text className="text-muted-foreground text-sm text-center">
              Your counter-dispute is under review. An admin will compare all evidence and make a decision.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add EscrowApp/app/transaction/return-inspection.tsx
git commit -m "feat: add seller return inspection screen with counter-dispute support"
```

---

### Task 11: Update Transaction Detail Screen with Return Panels

**Files:**
- Modify: `EscrowApp/app/transaction/[id].tsx`

- [ ] **Step 1: Add return-related imports at the top of the file**

Add after the existing imports:

```typescript
import { useReturnTransaction } from "@/features/returns/use-return-transaction";
```

- [ ] **Step 2: Add return action panels**

Add these new panel components before the `ActionPanel` function:

```typescript
function ReturnApprovedPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Admin has approved a return. Package the item and ship it back to the seller.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-shipment", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Start Return Process
            </Text>
          </Button>
        </>
      ) : (
        <Text className="text-muted-foreground text-sm text-center">
          A return has been approved. Waiting for the buyer to ship the item back.
        </Text>
      )}
    </View>
  );
}

function ReturnInProgressPanel({ transaction }: { transaction: Transaction }) {
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <Text className="text-muted-foreground text-sm text-center">
      {isBuyer
        ? "Item shipped. Waiting for the seller to confirm receipt."
        : "The buyer has shipped the return. You will need to enter the return delivery token when you receive it."}
    </Text>
  );
}

function ReturnDeliveredPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <Text className="text-muted-foreground text-sm text-center">
          Seller has received the return. Waiting for inspection.
        </Text>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Inspect the returned item and approve or raise a counter-dispute.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-inspection", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Inspect Return
            </Text>
          </Button>
        </>
      )}
    </View>
  );
}

function ReturnInspectionPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <Text className="text-muted-foreground text-sm text-center">
          Seller is inspecting the returned item. You will be notified of the outcome.
        </Text>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Complete your inspection and make a decision.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-inspection", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Continue Inspection
            </Text>
          </Button>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Add the new statuses to the ActionPanel switch statement**

In the `ActionPanel` function's switch statement, add these cases before the `default`:

```typescript
    case "return_approved":
      return <ReturnApprovedPanel transaction={transaction} />;

    case "return_in_progress":
      return <ReturnInProgressPanel transaction={transaction} />;

    case "return_delivered":
      return <ReturnDeliveredPanel transaction={transaction} />;

    case "return_inspection":
      return <ReturnInspectionPanel transaction={transaction} />;
```

- [ ] **Step 4: Update the StatusTimeline TIMELINE_STATUSES to include return states**

Update the `TIMELINE_STATUSES` array to include the new states conditionally. Replace the `StatusTimeline` rendering to handle return states when the transaction is in a return flow. Add after `"released"` in the array when the transaction status includes a return state.

- [ ] **Step 5: Commit**

```bash
git add EscrowApp/app/transaction/[id].tsx
git commit -m "feat: add return action panels to transaction detail screen"
```

---

### Task 12: Add Location Fields to Transaction Creation and Acceptance

**Files:**
- Modify: `EscrowApp/app/transaction/create.tsx`
- Modify: `EscrowApp/supabase/migrations/016_remaining_escrow_rpcs.sql` (reference only — we create a new migration)
- Create: `EscrowApp/supabase/migrations/027_add_location_to_accept.sql`

- [ ] **Step 1: Add buyer_location to create transaction form**

In `EscrowApp/app/transaction/create.tsx`, add a `buyer_location` field to the schema:

```typescript
  buyer_location: z.string().min(1, "Your location is required").max(100),
```

Add a text input for buyer location in the form JSX (after seller_contact):

```typescript
        <View className="gap-2">
          <Label nativeID="location-label">Your Location (City/Area) *</Label>
          <Controller
            control={control}
            name="buyer_location"
            render={({ field: { onChange, value } }) => (
              <Input
                aria-labelledby="location-label"
                className="h-14 rounded-xl"
                placeholder="e.g. Lagos, Ikeja"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.buyer_location && (
            <Text className="text-destructive text-xs">
              {errors.buyer_location.message}
            </Text>
          )}
        </View>
```

Then include `buyer_location` in the insert statement where the transaction is created.

- [ ] **Step 2: Add seller_location and return_conditions to accept_transaction**

Create `EscrowApp/supabase/migrations/027_add_location_to_accept.sql`:

```sql
-- Update accept_transaction to accept location and return conditions
CREATE OR REPLACE FUNCTION accept_transaction(
  p_transaction_id UUID,
  p_seller_location TEXT DEFAULT NULL,
  p_return_conditions TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.buyer_id = auth.uid() THEN
    RAISE EXCEPTION 'Buyer cannot accept their own transaction';
  END IF;

  IF v_tx.status NOT IN ('created', 'seller_invited') THEN
    RAISE EXCEPTION 'Transaction is not awaiting a seller';
  END IF;

  IF v_tx.seller_id IS NOT NULL AND v_tx.seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Another seller is already assigned';
  END IF;

  UPDATE transactions
    SET seller_id = auth.uid(),
        status = 'accepted',
        terms_accepted_by_seller = true,
        accepted_at = NOW(),
        seller_location = COALESCE(p_seller_location, seller_location),
        seller_return_conditions = COALESCE(p_return_conditions, seller_return_conditions)
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: Apply migration**

Run:
```bash
cd EscrowApp && npx supabase db query --linked -f supabase/migrations/027_add_location_to_accept.sql
```

- [ ] **Step 4: Update the seller accept flow in the mobile app**

In `EscrowApp/app/transaction/[id].tsx`, update `SellerRespondPanel` to include location and return conditions inputs, and pass them to the `accept_transaction` RPC call:

```typescript
const { error } = await supabase.rpc("accept_transaction", {
  p_transaction_id: transaction.id,
  p_seller_location: sellerLocation,
  p_return_conditions: returnConditions || undefined,
});
```

- [ ] **Step 5: Commit**

```bash
git add EscrowApp/app/transaction/create.tsx EscrowApp/app/transaction/[id].tsx EscrowApp/supabase/migrations/027_add_location_to_accept.sql
git commit -m "feat: add location and return conditions to transaction creation and acceptance"
```

---

## Phase 3: Admin Dashboard

Updates to the admin dashboard for return management and phase-tabbed evidence.

---

### Task 13: Admin Dispute Detail — Return Approval and Phase Tabs

**Files:**
- Modify: `admin-dashboard/app/routes/dispute-detail.tsx`

- [ ] **Step 1: Add "Approve Return" action to the admin decision panel**

In the admin decision buttons section, add an "Approve Return" button that opens a dialog with:
- Deadline in days (number input)
- Buyer location and seller location displayed
- Suggested deadline based on locations
- Admin notes textarea
- Confirm button that calls `supabase.rpc("admin_approve_return", { p_dispute_id, p_deadline_days, p_admin_notes })`

- [ ] **Step 2: Add phase-tabbed evidence display**

Replace the existing side-by-side evidence comparison with a tabbed interface:
- Tabs: "Original", "Dispute", "Return", "Counter-Dispute"
- Each tab filters evidence by `phase` column
- Within each tab, show buyer vs seller evidence side-by-side
- Add the `phase` filter to the evidence query

- [ ] **Step 3: Add return tracking section**

When a return_transaction exists for the dispute, show:
- Return status timeline
- Return deadline with countdown
- Return evidence (buyer shipment vs seller receipt)
- Counter-dispute details if raised

- [ ] **Step 4: Add counter-dispute resolution panel**

When a counter-dispute is active:
- Show counter-dispute reason and description
- Show admin decision buttons: Refund Buyer, Release to Seller, Partial Refund
- Confirmation dialog with notes and optional refund amount
- Call `supabase.rpc("admin_resolve_counter_dispute", { ... })`

- [ ] **Step 5: Commit**

```bash
git add admin-dashboard/app/routes/dispute-detail.tsx
git commit -m "feat: add return approval, phase tabs, and counter-dispute resolution to admin"
```

---

### Task 14: Admin Types Update

**Files:**
- Modify: `admin-dashboard/app/lib/types.ts`

- [ ] **Step 1: Add return transaction and counter-dispute types**

Add to `admin-dashboard/app/lib/types.ts`:

```typescript
export type ReturnTransaction = {
  id: string
  original_transaction_id: string
  dispute_id: string
  return_deadline: string
  buyer_location: string | null
  seller_location: string | null
  seller_return_conditions: string | null
  status: string
  shipped_at: string | null
  delivered_at: string | null
  inspection_deadline: string | null
  resolved_at: string | null
  resolution: string | null
  created_at: string
  created_by: string | null
  admin_notes: string | null
}

export type CounterDispute = {
  id: string
  return_transaction_id: string
  original_dispute_id: string
  opened_by: string
  reason: string
  description: string | null
  status: string
  admin_decision: string | null
  admin_notes: string | null
  resolution_type: string | null
  refund_amount: number
  created_at: string
  resolved_at: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add admin-dashboard/app/lib/types.ts
git commit -m "feat: add ReturnTransaction and CounterDispute types to admin dashboard"
```

---

## Phase 4: Web Seller Return Flow

Extend the web invite page and edge function for seller return actions.

---

### Task 15: Extend seller-web-action Edge Function with Return Actions

**Files:**
- Modify: `EscrowApp/supabase/functions/seller-web-action/index.ts`

- [ ] **Step 1: Add return-related actions**

Add these new action handlers to the edge function (after the existing evidence actions):

- `get_return_details` — fetch return transaction, counter-dispute, and return evidence
- `confirm_return_receipt` — validate return token, confirm delivery
- `upload_return_evidence` — upload return receipt evidence (phase: return_receipt)
- `approve_return` — seller approves the return
- `raise_counter_dispute` — seller raises counter-dispute with reason and description

Each action authenticates via the existing invite token mechanism and uses the service role client for database operations.

- [ ] **Step 2: Deploy the edge function**

Run:
```bash
cd EscrowApp && npx supabase functions deploy seller-web-action --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/supabase/functions/seller-web-action/index.ts
git commit -m "feat: extend seller-web-action with return delivery, inspection, and counter-dispute actions"
```

---

### Task 16: Web Invite Page — Return Sections

**Files:**
- Modify: `EscrowApp/app/invite/[id].tsx`

- [ ] **Step 1: Add return tracking section to web invite page**

In the tracking view, when the transaction is in a return state, show:
- Return status card with deadline
- Return conditions reminder
- Token entry field (for confirming return receipt)
- Guided evidence upload for return receipt phase
- Approve return / raise counter-dispute buttons during inspection
- Counter-dispute form with reason selection and description

The component should fetch return details via the `get_return_details` action and poll alongside the existing status polling.

- [ ] **Step 2: Deploy to Cloudflare**

Push changes to trigger Cloudflare auto-deploy:
```bash
git push
```

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/app/invite/[id].tsx
git commit -m "feat: add return tracking, inspection, and counter-dispute to web seller page"
```

---

## Phase 5: Evidence Feed and Polish

Live evidence feed, status label updates, and final integration.

---

### Task 17: Real-Time Evidence Feed Component

**Files:**
- Create: `EscrowApp/features/evidence/components/evidence-feed.tsx`

- [ ] **Step 1: Create the evidence feed component**

Create `EscrowApp/features/evidence/components/evidence-feed.tsx`:

```typescript
import { Text } from "@/components/ui/text";
import type { Database } from "@/lib/database.types";
import { formatRelativeDate } from "@/lib/format";
import { View, Pressable } from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

const PHASE_COLORS: Record<string, string> = {
  original: "bg-primary",
  dispute: "bg-destructive",
  counter_dispute: "bg-destructive",
  return_shipment: "bg-blue-500",
  return_receipt: "bg-blue-500",
};

const PHASE_LABELS: Record<string, string> = {
  original: "Pre-Delivery",
  dispute: "Dispute",
  return_shipment: "Return Shipment",
  return_receipt: "Return Receipt",
  counter_dispute: "Counter-Dispute",
};

const CATEGORY_LABELS: Record<string, string> = {
  front: "Front view",
  back: "Back view",
  left: "Left side",
  right: "Right side",
  top: "Top",
  bottom: "Bottom",
  serial_number: "Serial number",
  seal: "Sealed package",
  seal_condition: "Seal condition",
  defect: "Defect area",
  packaging: "Packaging",
  accessories: "Accessories",
  unique_identifier: "Unique feature",
  other: "Photo",
};

type Props = {
  evidence: Evidence[];
  onPress?: (evidence: Evidence) => void;
};

export function EvidenceFeed({ evidence, onPress }: Props) {
  if (evidence.length === 0) return null;

  // Sort by most recent first
  const sorted = [...evidence].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <View className="gap-2">
      {sorted.map((item) => {
        const phase = (item.phase as string) || "original";
        const category = (item.category as string) || "other";
        const dotColor = PHASE_COLORS[phase] || "bg-muted-foreground";
        const roleLabel = item.user_role === "buyer" ? "Buyer" : "Seller";
        const phaseLabel = PHASE_LABELS[phase] || phase;
        const categoryLabel = CATEGORY_LABELS[category] || category;

        return (
          <Pressable
            key={item.id}
            className="flex-row items-center gap-3 py-1.5"
            onPress={() => onPress?.(item)}
          >
            <View className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
            <View className="flex-1">
              <Text className="text-foreground text-sm">
                {roleLabel} · {phaseLabel}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {categoryLabel} · {formatRelativeDate(item.created_at)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Add evidence feed to transaction detail screen**

In `EscrowApp/app/transaction/[id].tsx`, import `EvidenceFeed` and add it as a new section after the Evidence section:

```typescript
<SectionCard title="Evidence Timeline">
  <EvidenceFeed evidence={evidence} />
</SectionCard>
```

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/features/evidence/components/evidence-feed.tsx EscrowApp/app/transaction/[id].tsx
git commit -m "feat: add real-time evidence feed with phase color coding"
```

---

### Task 18: Update Format Helpers and Status Labels

**Files:**
- Modify: `EscrowApp/lib/format.ts`

- [ ] **Step 1: Add new status labels**

In the `getStatusLabel` function in `EscrowApp/lib/format.ts`, add:

```typescript
  return_approved: "Return Approved",
  return_in_progress: "Return In Transit",
  return_delivered: "Return Received",
  return_inspection: "Return Inspection",
```

- [ ] **Step 2: Update the admin dashboard status labels**

In `admin-dashboard/app/components/status-badge.tsx`, add the same new status labels.

- [ ] **Step 3: Commit**

```bash
git add EscrowApp/lib/format.ts admin-dashboard/app/components/status-badge.tsx
git commit -m "feat: add return status labels to format helpers"
```

---

### Task 19: Final Integration — Push and Deploy

- [ ] **Step 1: Push all changes to GitHub**

```bash
git push
```

This triggers Cloudflare auto-deploy for the web app.

- [ ] **Step 2: Deploy any remaining edge functions**

```bash
cd EscrowApp && npx supabase functions deploy seller-web-action --no-verify-jwt
cd EscrowApp && npx supabase functions deploy cron-expire --no-verify-jwt
```

- [ ] **Step 3: Regenerate types one final time**

```bash
cd EscrowApp && npx supabase gen types typescript --project-id ktyvdgwdnhgilstuvdtl > lib/database.types.ts
git add EscrowApp/lib/database.types.ts
git commit -m "chore: final type regeneration"
git push
```

- [ ] **Step 4: Test the full flow end-to-end**

1. Create a transaction (buyer sets location)
2. Seller accepts (sets location and return conditions)
3. Buyer funds escrow
4. Seller uploads pre-delivery evidence and generates token
5. Buyer confirms delivery
6. Buyer raises dispute with guided evidence
7. Admin reviews and approves return (sets deadline)
8. Buyer uploads return evidence and generates return token
9. Seller confirms return receipt
10. Seller inspects — either approves (buyer refunded) or counter-disputes
11. If counter-disputed: admin resolves
12. Test auto-expiry by letting deadline pass
