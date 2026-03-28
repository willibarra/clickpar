-- ============================================================
-- CLICKPAR - Migración PagoPar
-- Ejecutar en el SQL Editor de Supabase
-- Fecha: 2026-03-27
-- ============================================================

-- 1. Agregar columnas de PagoPar a la tabla transactions
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES sales(id),
    ADD COLUMN IF NOT EXISTS pagopar_hash TEXT,
    ADD COLUMN IF NOT EXISTS pagopar_order_id TEXT;

-- 2. Índice para buscar transacciones por hash de PagoPar (usado en webhook)
CREATE INDEX IF NOT EXISTS idx_transactions_pagopar_hash ON transactions(pagopar_hash);

-- 3. Actualizar RLS: permitir que el sistema (service_role) inserte transacciones de PagoPar
-- (El webhook usa el admin client con service_role, que ya tiene acceso total)
-- Las políticas RLS existentes para customers/admins se mantienen igual.

-- 4. Verificar columnas agregadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name IN ('subscription_id', 'pagopar_hash', 'pagopar_order_id');
