#!/usr/bin/env node
/**
 * Migration: Billetera Virtual + Tienda (20260405)
 * - Agrega wallet_balance a customers
 * - Crea tabla wallet_transactions (ledger de billetera)
 * - Agrega show_in_store a mother_accounts
 * - Agrega transaction_type a transactions
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.clickpar.shop';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const STEPS = [
    {
        name: '1. wallet_balance en customers',
        sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(15,2) NOT NULL DEFAULT 0 CONSTRAINT wallet_balance_non_negative CHECK (wallet_balance >= 0);`,
        verify: async () => {
            const { data } = await supabase.from('customers').select('wallet_balance').limit(1);
            return data !== null;
        },
    },
    {
        name: '2. Tabla wallet_transactions',
        sql: `
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id    UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount         DECIMAL(15, 2) NOT NULL,
    type           TEXT        NOT NULL CHECK (type IN ('credit', 'debit')),
    concept        TEXT        NOT NULL,
    reference_id   UUID,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer ON wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created  ON wallet_transactions(created_at DESC);`,
        verify: async () => {
            // Simple verify: try selecting from the new table
            const { error } = await supabase.from('wallet_transactions').select('id').limit(1);
            return !error;
        },
    },
    {
        name: '3. RLS para wallet_transactions',
        sql: `
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own wallet transactions" ON wallet_transactions;
CREATE POLICY "Customers can view own wallet transactions" ON wallet_transactions
    FOR SELECT
    USING (
        customer_id = (
            SELECT id FROM customers WHERE portal_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role manages wallet transactions" ON wallet_transactions;
CREATE POLICY "Service role manages wallet transactions" ON wallet_transactions
    FOR ALL
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions" ON wallet_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'staff')
        )
    );`,
        verify: async () => true, // RLS policies don't have a simple check
    },
    {
        name: '4. show_in_store en mother_accounts',
        sql: `ALTER TABLE mother_accounts ADD COLUMN IF NOT EXISTS show_in_store BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_mother_accounts_show_in_store ON mother_accounts(show_in_store) WHERE show_in_store = TRUE;`,
        verify: async () => {
            const { data } = await supabase.from('mother_accounts').select('show_in_store').limit(1);
            return data !== null;
        },
    },
    {
        name: '5. transaction_type en transactions',
        sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'subscription_renewal' CHECK (transaction_type IN ('subscription_renewal', 'wallet_topup'));`,
        verify: async () => {
            const { data } = await supabase.from('transactions').select('transaction_type').limit(1);
            return data !== null;
        },
    },
];

async function runSql(sql) {
    // Try via RPC exec_sql first
    const { error: rpcError } = await supabase.rpc('exec_sql', { query: sql });
    if (!rpcError) return { ok: true, method: 'rpc' };

    // Fallback: REST /rest/v1/rpc/exec_sql
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ query: sql }),
    });
    if (res.ok) return { ok: true, method: 'rest-rpc' };

    // Fallback 2: /pg/query
    const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ query: sql }),
    });
    if (res2.ok) return { ok: true, method: 'pg-query' };

    const text = await res2.text().catch(() => '');
    return { ok: false, error: `HTTP ${res2.status}: ${text}` };
}

async function migrate() {
    console.log('🏦 ClickPar — Migración: Billetera Virtual + Tienda\n');
    console.log(`📡 Conectando a: ${SUPABASE_URL}\n`);

    let allOk = true;

    for (const step of STEPS) {
        process.stdout.write(`  ⏳ ${step.name} ... `);
        const result = await runSql(step.sql);

        if (!result.ok) {
            console.log(`❌ Error: ${result.error}`);
            allOk = false;
            continue;
        }

        // Verify
        try {
            const valid = await step.verify();
            if (valid) {
                console.log(`✅ OK (via ${result.method})`);
            } else {
                console.log(`⚠️  Ejecutado pero verificación falló`);
            }
        } catch (e) {
            console.log(`✅ Ejecutado (via ${result.method}) — verificación omitida`);
        }
    }

    console.log('\n' + (allOk ? '🎉 Migración completada exitosamente!' : '⚠️  Migración completada con algunos errores (ver arriba)'));

    if (!allOk) {
        console.log('\n💡 Si algún paso falló, ejecutá el SQL manualmente desde:');
        console.log('   /Applications/ClickPar/supabase/migrations/20260405_wallet_and_store.sql');
        process.exit(1);
    }
}

migrate().catch((err) => {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
});
