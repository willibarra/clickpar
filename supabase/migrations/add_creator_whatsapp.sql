-- Add creator_whatsapp column to customers table
-- This allows each creator to have a custom WhatsApp redirect number for their link

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS creator_whatsapp TEXT;

COMMENT ON COLUMN customers.creator_whatsapp IS 'Número de WhatsApp personalizado para redirección del link del creador (ej: 595981234567). Si es nulo, se usa el número global del sistema.';
