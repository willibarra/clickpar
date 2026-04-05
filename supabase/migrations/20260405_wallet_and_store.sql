-- ============================================================
-- CLICKPAR - Billetera Virtual + Tienda
-- Fecha: 2026-04-05
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ============================================================
-- 1. SALDO EN CUSTOMERS (Billetera Virtual)
-- ============================================================

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0
        CONSTRAINT wallet_balance_non_negative CHECK (wallet_balance >= 0);

-- ============================================================
-- 2. TABLA LEDGER DE BILLETERA (Extracto de Movimientos)
-- ============================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id    UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount         DECIMAL(15, 2) NOT NULL,          -- positivo = crédito, negativo = débito
    type           TEXT        NOT NULL CHECK (type IN ('credit', 'debit')),
    concept        TEXT        NOT NULL,              -- ej: 'Recarga PagoPar', 'Compra Netflix'
    reference_id   UUID,                             -- FK opcional a transactions.id o sales.id
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer    ON wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created     ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type        ON wallet_transactions(type);

-- RLS
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Los clientes solo ven sus propios movimientos
DROP POLICY IF EXISTS "Customers can view own wallet transactions" ON wallet_transactions;
CREATE POLICY "Customers can view own wallet transactions" ON wallet_transactions
    FOR SELECT
    USING (
        customer_id = (
            SELECT id FROM customers WHERE portal_user_id = auth.uid()
        )
    );

-- Solo el service role puede insertar/modificar (via admin client)
DROP POLICY IF EXISTS "Service role manages wallet transactions" ON wallet_transactions;
CREATE POLICY "Service role manages wallet transactions" ON wallet_transactions
    FOR ALL
    USING (auth.role() = 'service_role');

-- Los admins pueden ver todos los movimientos
DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions" ON wallet_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'staff')
        )
    );

-- ============================================================
-- 3. VISIBILIDAD EN TIENDA (mother_accounts)
-- ============================================================

ALTER TABLE mother_accounts
    ADD COLUMN IF NOT EXISTS show_in_store BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_mother_accounts_show_in_store
    ON mother_accounts(show_in_store)
    WHERE show_in_store = TRUE;

-- ============================================================
-- 4. TIPO DE TRANSACCIÓN EN transactions (recarga de saldo)
-- ============================================================

-- Agregar columna para distinguir el propósito de la transacción PagoPar
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'subscription_renewal'
        CHECK (transaction_type IN ('subscription_renewal', 'wallet_topup'));

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

SELECT
    (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'wallet_balance') AS wallet_balance_col,
    (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = 'wallet_transactions') AS wallet_tx_table,
    (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'mother_accounts' AND column_name = 'show_in_store') AS show_in_store_col,
    (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'transaction_type') AS transaction_type_col;
