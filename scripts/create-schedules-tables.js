#!/usr/bin/env node
/**
 * Migration: Create staff_schedules and staff_attendance tables
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
    console.log('📜 Creating staff schedules and attendance tables...');

    const sql = `
        CREATE TABLE IF NOT EXISTS staff_schedules (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
            monday_start TIME,
            monday_end TIME,
            tuesday_start TIME,
            tuesday_end TIME,
            wednesday_start TIME,
            wednesday_end TIME,
            thursday_start TIME,
            thursday_end TIME,
            friday_start TIME,
            friday_end TIME,
            saturday_start TIME,
            saturday_end TIME,
            sunday_start TIME,
            sunday_end TIME,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS staff_attendance (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            first_login_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, date)
        );

        -- RLS (Row Level Security)
        ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;
        ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

        -- Admin can manage all
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_schedules' AND policyname = 'Admin all access schedules') THEN
                CREATE POLICY "Admin all access schedules" ON staff_schedules FOR ALL USING (
                    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'staff')
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_attendance' AND policyname = 'Admin all access attendance') THEN
                CREATE POLICY "Admin all access attendance" ON staff_attendance FOR ALL USING (
                    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'staff')
                );
            END IF;
        END $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.log('RPC method failed, trying REST API fallback...', error);
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
            console.error('Failed to create tables:', await res.text());
        } else {
            console.log('✅ Tables created via direct query.');
        }
    } else {
        console.log('✅ Tables created via RPC.');
    }
}

migrate().catch(console.error);
