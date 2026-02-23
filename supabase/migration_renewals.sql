-- ============================================
-- MIGRACIÓN: Tablas para Renovación y POS Inteligente
-- ============================================
-- Ejecutar este script en Supabase SQL Editor
-- Fecha: 2026-01-26

-- 1. Agregar precio por defecto de slot a mother_accounts
ALTER TABLE mother_accounts 
ADD COLUMN IF NOT EXISTS default_slot_price_gs DECIMAL(15, 2) DEFAULT 30000;

-- 2. Crear tabla de historial de renovaciones
CREATE TABLE IF NOT EXISTS renewals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mother_account_id UUID REFERENCES mother_accounts(id) ON DELETE CASCADE,
  renewal_date DATE NOT NULL,
  purchase_cost_gs DECIMAL(15, 2) NOT NULL,
  expected_slot_price_gs DECIMAL(15, 2) NOT NULL,
  projected_profit_gs DECIMAL(15, 2) NOT NULL,
  actual_profit_gs DECIMAL(15, 2), -- Se calcula al final del ciclo
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_renewals_mother_account ON renewals(mother_account_id);
CREATE INDEX IF NOT EXISTS idx_renewals_date ON renewals(renewal_date);

-- 4. RLS para renewals (solo admin/staff)
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage renewals" ON renewals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- 5. Actualizar precios por defecto en cuentas existentes (valores de ejemplo)
UPDATE mother_accounts SET default_slot_price_gs = 30000 WHERE platform = 'Netflix';
UPDATE mother_accounts SET default_slot_price_gs = 25000 WHERE platform = 'Spotify';
UPDATE mother_accounts SET default_slot_price_gs = 35000 WHERE platform = 'HBO';
UPDATE mother_accounts SET default_slot_price_gs = 28000 WHERE platform = 'Disney+';

-- ✅ Migración completada
