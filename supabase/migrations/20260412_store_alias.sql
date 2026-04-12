-- ============================================
-- MIGRACIÓN: Agregar store_alias a platforms
-- Ejecutar en Supabase SQL Editor
-- ============================================

ALTER TABLE platforms ADD COLUMN IF NOT EXISTS store_alias TEXT DEFAULT NULL;

COMMENT ON COLUMN platforms.store_alias IS 'Alias visible en la tienda del portal de clientes. Si es NULL, se muestra el nombre real.';
