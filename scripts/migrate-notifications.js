#!/usr/bin/env node
// Migration: Create notifications table
const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

async function run() {
    const sql = `
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT false,
            is_resolved BOOLEAN DEFAULT false,
            related_resource_id UUID,
            related_resource_type TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'admin_full_access_notifications'
            ) THEN
                CREATE POLICY admin_full_access_notifications ON notifications
                    FOR ALL
                    USING (
                        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'staff')
                    );
            END IF;
        END $$;
    `;

    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
            'x-custom-header': 'supabase-pgrest'
        },
        body: JSON.stringify({ query: sql })
    });

    if (!res.ok) {
        const text = await res.text();
        console.error('Failed:', res.status, text);
        // Try REST API as fallback
        console.log('Trying REST API...');
        const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'apikey': SERVICE_ROLE_KEY
            },
            body: JSON.stringify({ query: sql })
        });
        if (!res2.ok) {
            console.error('Fallback also failed:', await res2.text());
        } else {
            console.log('✅ Table created via RPC');
        }
    } else {
        console.log('✅ notifications table created successfully');
    }
}

run().catch(console.error);
