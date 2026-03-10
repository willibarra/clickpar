#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

async function run() {
    const sql = `
        ALTER TABLE mother_accounts
          ADD COLUMN IF NOT EXISTS is_autopay BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS autopay_last_checked DATE DEFAULT NULL;
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

    if (!res.ok) {
        console.error('Failed:', res.status, await res.text());
    } else {
        console.log('OK: columns added');
    }

    // Verify
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase
        .from('mother_accounts')
        .select('id, is_autopay, autopay_last_checked')
        .limit(1);
    if (error) console.error('Verify error:', error.message);
    else console.log('Verified:', JSON.stringify(data));
}

run().catch(console.error);
