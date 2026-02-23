const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

async function migrate() {
    // Create owned_emails table
    const { error } = await supabase.rpc('exec_sql', {
        query: `
            CREATE TABLE IF NOT EXISTS owned_emails (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT,
                provider TEXT DEFAULT 'gmail',
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE owned_emails ENABLE ROW LEVEL SECURITY;

            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies WHERE tablename = 'owned_emails' AND policyname = 'Admin full access owned_emails'
                ) THEN
                    CREATE POLICY "Admin full access owned_emails" ON owned_emails
                        FOR ALL USING (
                            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','staff'))
                        );
                END IF;
            END $$;
        `
    });

    if (error) {
        console.log('RPC failed, trying direct SQL...');
        // Fallback: try creating via REST insert to check if table exists
        const { error: testError } = await supabase.from('owned_emails').select('id').limit(1);
        if (testError && testError.message.includes('does not exist')) {
            console.log('Table does not exist. Using alternative creation method...');
            // Use the SQL endpoint directly
            const response = await fetch(
                'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me/rest/v1/rpc/exec_sql',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg',
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
                    },
                    body: JSON.stringify({
                        query: `
                            CREATE TABLE IF NOT EXISTS owned_emails (
                                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                                email TEXT NOT NULL UNIQUE,
                                password TEXT,
                                provider TEXT DEFAULT 'gmail',
                                notes TEXT,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            );
                        `
                    })
                }
            );
            const result = await response.text();
            console.log('Direct SQL result:', response.status, result);
        } else if (testError) {
            console.log('Table check error:', testError.message);
        } else {
            console.log('Table already exists!');
        }
    } else {
        console.log('Migration completed successfully via RPC!');
    }

    // Verify table
    const { data, error: verifyError } = await supabase.from('owned_emails').select('id').limit(1);
    if (verifyError) {
        console.log('Verification failed:', verifyError.message);
        console.log('Will try creating table via Supabase SQL API...');

        // Last resort: use the management API
        const sqlUrl = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me/pg';
        console.log('Please create the table manually via Supabase Studio SQL editor:');
        console.log(`
CREATE TABLE IF NOT EXISTS owned_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT,
    provider TEXT DEFAULT 'gmail',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE owned_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access owned_emails" ON owned_emails
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','staff'))
    );
        `);
    } else {
        console.log('✅ Table owned_emails verified and ready!');
    }
}

migrate().catch(console.error);
