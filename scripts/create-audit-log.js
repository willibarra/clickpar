#!/usr/bin/env node
/**
 * Migration: Create audit_log table
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
    console.log('📜 Creating audit_log table...');

    const sql = `
        CREATE TABLE IF NOT EXISTS audit_log (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id UUID,
            details JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Índices para búsqueda rápida
        CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id ON audit_log(resource_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

        -- RLS (Row Level Security)
        ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

        -- Solo admins/staff pueden ver el log
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'Restricted access to audit log') THEN
                CREATE POLICY "Restricted access to audit log" ON audit_log
                FOR ALL
                USING (
                    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'staff')
                );
            END IF;
        END $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.log('RPC method failed, trying REST API fallback...');
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
            console.error('Failed to create audit_log table:', await res.text());
        } else {
            console.log('✅ audit_log table created via direct query.');
        }
    } else {
        console.log('✅ audit_log table created via RPC.');
    }
}

migrate().catch(console.error);
