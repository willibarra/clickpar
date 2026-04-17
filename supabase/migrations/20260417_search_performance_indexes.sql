-- ============================================================
-- Search Performance Optimization - 2026-04-17
-- Adds missing trigram index on sale_slots.slot_identifier
-- to accelerate family account searches (YouTube, Spotify, etc.)
-- ============================================================

-- Ensure pg_trgm extension is active (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on slot_identifier
-- This fixes the full table scan that happens when searching
-- by customer email in family-type accounts
CREATE INDEX IF NOT EXISTS idx_sale_slots_identifier_trgm
    ON sale_slots USING gin (slot_identifier gin_trgm_ops);

-- Verify the index on mother_accounts.email also exists (from migration_phase2)
-- If it doesn't exist, this creates it:
CREATE INDEX IF NOT EXISTS idx_mother_accounts_email_trgm
    ON mother_accounts USING gin (email gin_trgm_ops);

-- Composite index to speed up the most common sales filter:
-- "get active sales for these slot_ids"
CREATE INDEX IF NOT EXISTS idx_sales_slot_active
    ON sales (slot_id, is_active)
    WHERE is_active = true;

-- Composite index for customer sales lookup
CREATE INDEX IF NOT EXISTS idx_sales_customer_active
    ON sales (customer_id, is_active)
    WHERE is_active = true;
