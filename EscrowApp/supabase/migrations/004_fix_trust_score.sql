-- ============================================
-- Fix trust_score: widen from NUMERIC(4,2) to NUMERIC(5,2)
-- NUMERIC(4,2) max is 99.99 but default is 100.00
-- Run this in the Supabase SQL Editor
-- ============================================

ALTER TABLE users ALTER COLUMN trust_score TYPE NUMERIC(5,2);
