#!/usr/bin/env node
/**
 * Migration: Add instructions and send_instructions columns to mother_accounts
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
    console.log('🔧 Adding instructions columns to mother_accounts...\n');

    const sql = `
        ALTER TABLE mother_accounts
          ADD COLUMN IF NOT EXISTS instructions TEXT DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS send_instructions BOOLEAN DEFAULT FALSE;
    `;

    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.log('RPC method failed:', error.message);
        console.log('Trying direct REST query...');

        const res = await fetch(`${SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'apikey': SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ query: sql }),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('Direct query also failed:', res.status, text);
            console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:');
            console.log(sql);
            return;
        }
        console.log('✅ Columns added via direct query');
    } else {
        console.log('✅ Columns added via RPC');
    }

    // Verify
    const { data, error: verifyError } = await supabase
        .from('mother_accounts')
        .select('id, instructions, send_instructions')
        .limit(1);

    if (verifyError) {
        console.log('⚠️  Verification failed:', verifyError.message);
        console.log('Please run the SQL above manually in your Supabase SQL Editor.');
    } else {
        console.log('✅ Verified: instructions columns exist in mother_accounts');
    }
}

migrate().catch(console.error);
