-- ============================================
-- Migration: WhatsApp Improvements + Roles
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add WhatsApp instance to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS whatsapp_instance TEXT;

-- 2. Add batch interval + aliases to whatsapp_settings
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS batch_send_interval_seconds INTEGER DEFAULT 30;
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS instance_1_alias TEXT DEFAULT 'Número 1';
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS instance_2_alias TEXT DEFAULT 'Número 2';

-- 3. Update existing row if any
UPDATE whatsapp_settings 
SET batch_send_interval_seconds = COALESCE(batch_send_interval_seconds, 30),
    instance_1_alias = COALESCE(instance_1_alias, 'Número 1'),
    instance_2_alias = COALESCE(instance_2_alias, 'Número 2');
