-- ============================================
-- ESCROW APP: Initial Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. ENUMS
-- ============================================

CREATE TYPE transaction_status AS ENUM (
  'created',
  'seller_invited',
  'accepted',
  'rejected',
  'funded',
  'in_delivery',
  'delivered',
  'under_inspection',
  'released',
  'disputed',
  'refunded',
  'partially_refunded',
  'cancelled',
  'expired',
  'admin_review'
);

CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');

CREATE TYPE ledger_type AS ENUM ('fund', 'release', 'refund', 'partial_refund');

CREATE TYPE ledger_status AS ENUM ('pending', 'locked', 'completed', 'failed');

CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved');

CREATE TYPE resolution_type AS ENUM ('release', 'refund', 'partial_refund', 'return_required');

CREATE TYPE fraud_risk_level AS ENUM ('low', 'medium', 'high');

CREATE TYPE fraud_flag_status AS ENUM ('active', 'dismissed', 'confirmed');


-- 2. TABLES
-- ============================================

-- Users (linked to Supabase Auth via id)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  role user_role NOT NULL DEFAULT 'buyer',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  trust_score NUMERIC(4,2) NOT NULL DEFAULT 100.00,
  pin_hash TEXT,
  wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  locked_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code TEXT UNIQUE NOT NULL DEFAULT 'TXN-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0'),
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  seller_contact TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_description TEXT,
  item_condition TEXT,
  item_category TEXT,
  item_image_url TEXT,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL,
  delivery_deadline TIMESTAMPTZ NOT NULL,
  inspection_period INT NOT NULL DEFAULT 48, -- hours
  status transaction_status NOT NULL DEFAULT 'created',
  terms_accepted_by_buyer BOOLEAN NOT NULL DEFAULT TRUE,
  terms_accepted_by_seller BOOLEAN NOT NULL DEFAULT FALSE,
  funded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escrow Ledger
CREATE TABLE escrow_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL,
  type ledger_type NOT NULL,
  status ledger_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery Tokens (QR-based verification)
CREATE TABLE delivery_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence (Proof Mode)
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  user_role user_role NOT NULL,
  evidence_type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_hash TEXT,
  notes TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disputes
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  description TEXT,
  status dispute_status NOT NULL DEFAULT 'open',
  admin_decision TEXT,
  resolution_type resolution_type,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  user_role user_role NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fraud Flags
CREATE TABLE fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  flag_type TEXT NOT NULL,
  risk_level fraud_risk_level NOT NULL,
  reason TEXT NOT NULL,
  status fraud_flag_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ratings
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  rated_by UUID NOT NULL REFERENCES users(id),
  rated_user UUID NOT NULL REFERENCES users(id),
  score INT NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id, rated_by)
);


-- 3. INDEXES
-- ============================================

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller ON transactions(seller_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_code ON transactions(transaction_code);
CREATE INDEX idx_escrow_ledger_transaction ON escrow_ledger(transaction_id);
CREATE INDEX idx_delivery_tokens_transaction ON delivery_tokens(transaction_id);
CREATE INDEX idx_delivery_tokens_hash ON delivery_tokens(token_hash);
CREATE INDEX idx_evidence_transaction ON evidence(transaction_id);
CREATE INDEX idx_disputes_transaction ON disputes(transaction_id);
CREATE INDEX idx_audit_logs_transaction ON audit_logs(transaction_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_fraud_flags_user ON fraud_flags(user_id);
CREATE INDEX idx_ratings_rated_user ON ratings(rated_user);


-- 4. AUTO-UPDATE TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- 5. TRANSACTION CODE GENERATOR
-- ============================================

CREATE OR REPLACE FUNCTION generate_transaction_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.transaction_code = 'TXN-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_transaction_code
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION generate_transaction_code();


-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- USERS
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  USING (is_admin());

CREATE POLICY "Allow insert own user row on signup"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- TRANSACTIONS
CREATE POLICY "Buyers can read own transactions"
  ON transactions FOR SELECT
  USING (buyer_id = auth.uid());

CREATE POLICY "Sellers can read assigned transactions"
  ON transactions FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY "Buyers can create transactions"
  ON transactions FOR INSERT
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Buyers can update own transactions"
  ON transactions FOR UPDATE
  USING (buyer_id = auth.uid());

CREATE POLICY "Sellers can update assigned transactions"
  ON transactions FOR UPDATE
  USING (seller_id = auth.uid());

CREATE POLICY "Admins can read all transactions"
  ON transactions FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all transactions"
  ON transactions FOR UPDATE
  USING (is_admin());

-- ESCROW LEDGER
CREATE POLICY "Users can read own ledger entries"
  ON escrow_ledger FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "Users can insert ledger entries"
  ON escrow_ledger FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Admins can read all ledger entries"
  ON escrow_ledger FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update ledger entries"
  ON escrow_ledger FOR UPDATE
  USING (is_admin());

-- DELIVERY TOKENS
CREATE POLICY "Buyer or seller can read delivery tokens"
  ON delivery_tokens FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "Sellers can create delivery tokens"
  ON delivery_tokens FOR INSERT
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Buyers can mark token as used"
  ON delivery_tokens FOR UPDATE
  USING (buyer_id = auth.uid());

-- EVIDENCE
CREATE POLICY "Transaction parties can read evidence"
  ON evidence FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = evidence.transaction_id
      AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
  );

CREATE POLICY "Users can upload evidence"
  ON evidence FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Admins can read all evidence"
  ON evidence FOR SELECT
  USING (is_admin());

-- DISPUTES
CREATE POLICY "Transaction parties can read disputes"
  ON disputes FOR SELECT
  USING (
    opened_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = disputes.transaction_id
      AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
  );

CREATE POLICY "Users can open disputes"
  ON disputes FOR INSERT
  WITH CHECK (opened_by = auth.uid());

CREATE POLICY "Admins can read all disputes"
  ON disputes FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update disputes"
  ON disputes FOR UPDATE
  USING (is_admin());

-- AUDIT LOGS
CREATE POLICY "Users can read own audit logs"
  ON audit_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all audit logs"
  ON audit_logs FOR SELECT
  USING (is_admin());

-- FRAUD FLAGS
CREATE POLICY "Admins can read fraud flags"
  ON fraud_flags FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert fraud flags"
  ON fraud_flags FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update fraud flags"
  ON fraud_flags FOR UPDATE
  USING (is_admin());

-- RATINGS
CREATE POLICY "Anyone can read ratings"
  ON ratings FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can insert ratings"
  ON ratings FOR INSERT
  WITH CHECK (rated_by = auth.uid());


-- 7. STORAGE BUCKET FOR EVIDENCE
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', FALSE);

CREATE POLICY "Users can upload evidence images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can read evidence images from their transactions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
