-- Migration: Add panel_disabled to customers table
-- Date: 2026-03-24
-- Purpose: Allow admins to disable a customer's portal panel (shows "Plan vencido" screen)

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS panel_disabled boolean DEFAULT false;

COMMENT ON COLUMN customers.panel_disabled IS 'When true, the customer sees a "Tu plan ha vencido" screen instead of their services panel';
