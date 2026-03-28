-- ============================================================
-- MIGRACIÓN: Sistema de Verificación de Pagos Bancarios
-- Fecha: 2026-03-27
-- Descripción: Agrega campos a `transactions` para soportar
--              el flujo automático de verificación vía n8n/Gmail
-- ============================================================

-- 1. Nuevas columnas en `transactions`
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_name TEXT,          -- Nombre del pagador extraído del email bancario
  ADD COLUMN IF NOT EXISTS bank_sender TEXT,         -- Banco/remitente (ej: "Itaú", "Continental")
  ADD COLUMN IF NOT EXISTS n8n_notes TEXT,           -- Notas del procesamiento automático de n8n
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,  -- Cuándo fue verificado
  ADD COLUMN IF NOT EXISTS verified_by TEXT DEFAULT 'n8n'; -- 'n8n' | 'manual'

-- 2. Índice compuesto para búsqueda rápida por monto + estado (usado por n8n)
CREATE INDEX IF NOT EXISTS idx_transactions_amount_status
  ON transactions(amount, status);

-- 3. Índice para búsqueda por subscription_id
CREATE INDEX IF NOT EXISTS idx_transactions_subscription
  ON transactions(subscription_id);

-- ============================================================
-- Instrucciones de ejecución:
-- Ir a Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================
