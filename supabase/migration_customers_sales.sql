-- ============================================
-- MIGRACIÓN: Crear tablas customers y sales
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Crear tipo de pago si no existe (ampliar el existente)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_payment_method') THEN
        CREATE TYPE sale_payment_method AS ENUM ('cash', 'transfer', 'qr', 'other');
    END IF;
END $$;

-- ============================================
-- 1. TABLA CUSTOMERS (Clientes externos)
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ============================================
-- 2. TABLA SALES (Ventas)
-- ============================================

CREATE TABLE IF NOT EXISTS sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slot_id UUID REFERENCES sale_slots(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    amount_gs DECIMAL(15, 2) NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    billing_cycle_day INT CHECK (billing_cycle_day BETWEEN 1 AND 31),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_slot ON sales(slot_id);
CREATE INDEX IF NOT EXISTS idx_sales_active ON sales(is_active);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(start_date);

-- ============================================
-- 3. RLS POLICIES
-- ============================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Política para customers (admins pueden todo)
DROP POLICY IF EXISTS "Admins can manage customers" ON customers;
CREATE POLICY "Admins can manage customers" ON customers FOR ALL USING (true);

-- Política para sales (admins pueden todo)
DROP POLICY IF EXISTS "Admins can manage sales" ON sales;
CREATE POLICY "Admins can manage sales" ON sales FOR ALL USING (true);

-- ============================================
-- 4. TRIGGER para updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Verificar creación
-- ============================================
SELECT 'customers' as tabla, COUNT(*) as registros FROM customers
UNION ALL
SELECT 'sales', COUNT(*) FROM sales;
