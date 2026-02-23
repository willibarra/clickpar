-- ============================================
-- CLICKPAR - MIGRACIÓN FASE 2
-- Lógica de Negocio e Integración
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. AMPLIAR ROLES DE USUARIO
-- ============================================

-- Agregar nuevos roles al enum (si no existen)
DO $$ BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vendedor';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'proveedor';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. AGREGAR COLUMNAS A MOTHER_ACCOUNTS
-- ============================================

-- Precio de venta por slot
ALTER TABLE mother_accounts 
ADD COLUMN IF NOT EXISTS slot_price_gs DECIMAL(15,2) DEFAULT 25000;

-- Notas internas
ALTER TABLE mother_accounts 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 3. TABLA DE COMBOS/BUNDLES
-- ============================================

CREATE TABLE IF NOT EXISTS bundles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,                    -- "Netflix + Spotify Premium"
    description TEXT,                      -- Descripción para el cliente
    price_gs DECIMAL(15,2) NOT NULL,       -- Precio total del combo
    original_price_gs DECIMAL(15,2),       -- Precio sin descuento (para mostrar ahorro)
    discount_percent INT DEFAULT 0,        -- % de descuento aplicado
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items que componen cada bundle
CREATE TABLE IF NOT EXISTS bundle_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,                -- Netflix, Spotify, etc.
    slot_count INT DEFAULT 1,              -- Cuántos slots de esta plataforma
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bundles_active ON bundles(is_active);
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);

-- RLS para bundles
ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all bundles" ON bundles;
CREATE POLICY "Allow all bundles" ON bundles FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all bundle_items" ON bundle_items;
CREATE POLICY "Allow all bundle_items" ON bundle_items FOR ALL USING (true);

-- ============================================
-- 4. MEJORAR TABLA SALES
-- ============================================

-- Agregar campos adicionales a sales
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS sold_by UUID,
ADD COLUMN IF NOT EXISTS bundle_id UUID REFERENCES bundles(id),
ADD COLUMN IF NOT EXISTS override_price BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_price_gs DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 5. TABLA PARA TRANSACCIONES FINANCIERAS
-- ============================================

-- Si no existe, crear tabla de gastos (para renovaciones de cuentas)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mother_account_id UUID REFERENCES mother_accounts(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount_gs DECIMAL(15,2) NOT NULL,
    expense_type TEXT DEFAULT 'renewal',   -- 'renewal', 'purchase', 'other'
    expense_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all expenses" ON expenses;
CREATE POLICY "Allow all expenses" ON expenses FOR ALL USING (true);

-- ============================================
-- 6. EXTENSIÓN PARA BÚSQUEDA FUZZY (OmniSearch)
-- ============================================

-- Habilitar extensión pg_trgm para búsqueda por similitud
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices GIN para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm 
ON customers USING gin(full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm 
ON customers USING gin(phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mother_accounts_email_trgm 
ON mother_accounts USING gin(email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mother_accounts_platform_trgm 
ON mother_accounts USING gin(platform gin_trgm_ops);

-- ============================================
-- 7. FUNCIÓN PARA ESTADÍSTICAS DEL DASHBOARD
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_balance', COALESCE((SELECT SUM(amount_gs) FROM sales WHERE is_active = true), 0),
        'active_accounts', (SELECT COUNT(*) FROM mother_accounts WHERE status = 'active'),
        'total_customers', (SELECT COUNT(*) FROM customers),
        'total_slots', (SELECT COUNT(*) FROM sale_slots),
        'available_slots', (SELECT COUNT(*) FROM sale_slots WHERE status = 'available'),
        'sold_slots', (SELECT COUNT(*) FROM sale_slots WHERE status = 'sold'),
        'month_income', COALESCE((
            SELECT SUM(amount_gs) FROM sales 
            WHERE created_at >= date_trunc('month', CURRENT_DATE)
        ), 0),
        'month_expenses', COALESCE((
            SELECT SUM(amount_gs) FROM expenses 
            WHERE expense_date >= date_trunc('month', CURRENT_DATE)
        ), 0),
        'expiring_today', (
            SELECT COUNT(*) FROM mother_accounts 
            WHERE renewal_date = CURRENT_DATE AND status = 'active'
        ),
        'expiring_3_days', (
            SELECT COUNT(*) FROM mother_accounts 
            WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
            AND status = 'active'
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FUNCIÓN PARA OBTENER CUENTAS POR VENCER
-- ============================================

CREATE OR REPLACE FUNCTION get_expiring_accounts(days_ahead INT DEFAULT 3)
RETURNS TABLE (
    id UUID,
    platform TEXT,
    email TEXT,
    renewal_date DATE,
    days_until_expiry INT,
    available_slots BIGINT,
    total_slots INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ma.id,
        ma.platform,
        ma.email,
        ma.renewal_date,
        (ma.renewal_date - CURRENT_DATE)::INT as days_until_expiry,
        COUNT(ss.id) FILTER (WHERE ss.status = 'available') as available_slots,
        ma.max_slots as total_slots
    FROM mother_accounts ma
    LEFT JOIN sale_slots ss ON ss.mother_account_id = ma.id
    WHERE ma.renewal_date <= CURRENT_DATE + (days_ahead || ' days')::INTERVAL
    AND ma.status = 'active'
    GROUP BY ma.id, ma.platform, ma.email, ma.renewal_date, ma.max_slots
    ORDER BY ma.renewal_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. FUNCIÓN PARA OMNISEARCH
-- ============================================

CREATE OR REPLACE FUNCTION omnisearch(
    search_term TEXT,
    search_type TEXT DEFAULT 'all',
    result_limit INT DEFAULT 50
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    customers_result JSON;
    accounts_result JSON;
BEGIN
    -- Buscar en customers
    IF search_type IN ('all', 'customers') THEN
        SELECT json_agg(row_to_json(c)) INTO customers_result
        FROM (
            SELECT id, full_name, phone, email, 'customer' as type
            FROM customers
            WHERE full_name ILIKE '%' || search_term || '%'
               OR phone ILIKE '%' || search_term || '%'
               OR email ILIKE '%' || search_term || '%'
            LIMIT result_limit
        ) c;
    END IF;
    
    -- Buscar en mother_accounts
    IF search_type IN ('all', 'accounts') THEN
        SELECT json_agg(row_to_json(a)) INTO accounts_result
        FROM (
            SELECT id, platform, email, status::TEXT, 'account' as type
            FROM mother_accounts
            WHERE email ILIKE '%' || search_term || '%'
               OR platform ILIKE '%' || search_term || '%'
            LIMIT result_limit
        ) a;
    END IF;
    
    SELECT json_build_object(
        'customers', COALESCE(customers_result, '[]'::JSON),
        'accounts', COALESCE(accounts_result, '[]'::JSON)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. FUNCIÓN PARA ASIGNACIÓN TETRIS
-- ============================================

CREATE OR REPLACE FUNCTION get_best_slot_for_sale(
    target_platform TEXT,
    target_billing_day INT DEFAULT NULL
)
RETURNS TABLE (
    slot_id UUID,
    mother_account_id UUID,
    account_email TEXT,
    slot_identifier TEXT,
    renewal_date DATE,
    slot_price_gs DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.id as slot_id,
        ma.id as mother_account_id,
        ma.email as account_email,
        ss.slot_identifier,
        ma.renewal_date,
        ma.slot_price_gs
    FROM sale_slots ss
    JOIN mother_accounts ma ON ss.mother_account_id = ma.id
    WHERE ma.platform = target_platform
    AND ma.status = 'active'
    AND ss.status = 'available'
    ORDER BY 
        -- Priorizar cuentas con billing day cercano al target
        CASE 
            WHEN target_billing_day IS NOT NULL 
            THEN ABS(COALESCE(ma.target_billing_day, 15) - target_billing_day)
            ELSE 0
        END,
        -- Luego por fecha de vencimiento más lejana
        ma.renewal_date DESC,
        -- Finalmente por el primer slot disponible
        ss.slot_identifier
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. FUNCIÓN PARA RANKING DE CLIENTES
-- ============================================

CREATE OR REPLACE FUNCTION get_customer_ranking(result_limit INT DEFAULT 20)
RETURNS TABLE (
    customer_id UUID,
    full_name TEXT,
    phone TEXT,
    total_spent DECIMAL,
    total_purchases BIGINT,
    last_purchase TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as customer_id,
        c.full_name,
        c.phone,
        COALESCE(SUM(s.amount_gs), 0) as total_spent,
        COUNT(s.id) as total_purchases,
        MAX(s.created_at) as last_purchase
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    GROUP BY c.id, c.full_name, c.phone
    ORDER BY total_spent DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICACIÓN
-- ============================================

SELECT 'Migración Phase 2 completada exitosamente' as resultado;
SELECT 
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'bundles') as bundles_table,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'expenses') as expenses_table,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'get_dashboard_stats') as dashboard_func,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'omnisearch') as omnisearch_func;
