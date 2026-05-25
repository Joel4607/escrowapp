-- ============================================
-- Enable Supabase Realtime on key tables
-- Run this in the Supabase SQL Editor
-- ============================================

-- Transactions (for live status updates between buyer/seller)
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;

-- Users (for live wallet balance updates)
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Delivery tokens (for live delivery confirmation)
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_tokens;

-- Escrow ledger (for live wallet activity)
ALTER PUBLICATION supabase_realtime ADD TABLE escrow_ledger;
