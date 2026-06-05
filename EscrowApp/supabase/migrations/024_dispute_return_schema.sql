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
