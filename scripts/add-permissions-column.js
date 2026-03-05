#!/usr/bin/env node
/**
 * Migration: Add permissions JSONB column to profiles table
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
    console.log('🔧 Adding permissions column to profiles...\n');

    // Try adding the column via rpc
    const sql = `
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
    `;

    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.log('RPC method failed:', error.message);
        console.log('Trying direct REST query...');

        // Fallback: try the pg/query endpoint
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
        console.log('✅ Column added via direct query');
    } else {
        console.log('✅ Column added via RPC');
    }

    // Verify
    const { data, error: verifyError } = await supabase
        .from('profiles')
        .select('id, permissions')
        .limit(1);

    if (verifyError) {
        console.log('⚠️  Verification failed:', verifyError.message);
        console.log('The column may not have been added. Please run the SQL manually.');
    } else {
        console.log('✅ Verified: permissions column exists in profiles');
        console.log('   Sample row:', JSON.stringify(data?.[0] || 'no rows'));
    }
}

migrate().catch(console.error);
