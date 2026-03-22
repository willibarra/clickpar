#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

async function run() {
    const sql = `
        ALTER TABLE mother_accounts
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

        CREATE INDEX IF NOT EXISTS idx_mother_accounts_deleted_at
          ON mother_accounts (deleted_at)
          WHERE deleted_at IS NOT NULL;
    `;

    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
        },
        body: JSON.stringify({ query: sql }),
    });

    const body = await res.text();
    if (!res.ok) {
        console.error('❌ Failed:', res.status, body);
        process.exit(1);
    } else {
        console.log('✅ Migración aplicada correctamente');
    }

    // Verify
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase
        .from('mother_accounts')
        .select('id, deleted_at')
        .limit(1);

    if (error) {
        console.error('❌ Verify error:', error.message);
    } else {
        console.log('✅ Columna deleted_at verificada:', JSON.stringify(data));
    }
}

run().catch(console.error);
