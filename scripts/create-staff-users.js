#!/usr/bin/env node
/**
 * Create 2 staff users:
 * - Laura Vera (laura@clickpar.net / laura2026)
 * - Vivian Pereira (vivian@clickpar.net / vivi2026!)
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const staffUsers = [
    {
        email: 'laura@clickpar.net',
        password: 'laura2026',
        fullName: 'Laura Vera',
    },
    {
        email: 'vivian@clickpar.net',
        password: 'vivi2026!',
        fullName: 'Vivian Pereira',
    },
];

async function createStaffUsers() {
    console.log('👥 Creating staff users...\n');

    for (const user of staffUsers) {
        console.log(`📧 Creating ${user.fullName} (${user.email})...`);

        // Check if already exists
        const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers();
        const existing = existingUsers?.find(u => u.email === user.email);

        let userId;

        if (existing) {
            console.log(`  ⏭️  Already exists (id: ${existing.id}). Updating password...`);
            userId = existing.id;
            await supabase.auth.admin.updateUserById(userId, {
                password: user.password,
                email_confirm: true,
            });
        } else {
            // Create auth user
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: user.email,
                password: user.password,
                email_confirm: true,
                user_metadata: { full_name: user.fullName },
            });

            if (authError) {
                console.error(`  ❌ Auth error: ${authError.message}`);
                continue;
            }
            userId = authData.user.id;
            console.log(`  ✅ Auth user created (id: ${userId})`);
        }

        // Wait a moment for the trigger to fire
        await new Promise(r => setTimeout(r, 500));

        // Update profile with staff role
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                full_name: user.fullName,
                role: 'staff',
                permissions: {
                    'inventory.view': true, 'inventory.edit': true, 'inventory.create': true, 'inventory.delete': false,
                    'sales.view': true, 'sales.create': true,
                    'customers.view': true, 'customers.edit': true,
                    'finance.view': false,
                    'renewals.view': true, 'renewals.manage': true,
                    'emails.view': true,
                    'settings.view': false, 'settings.manage': false,
                },
            }, { onConflict: 'id' });

        if (profileError) {
            console.error(`  ❌ Profile error: ${profileError.message}`);
            // Try without permissions if column doesn't exist yet
            const { error: retryError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    full_name: user.fullName,
                    role: 'staff',
                }, { onConflict: 'id' });

            if (retryError) {
                console.error(`  ❌ Retry also failed: ${retryError.message}`);
            } else {
                console.log(`  ✅ Profile updated (without permissions)`);
            }
        } else {
            console.log(`  ✅ Profile updated with staff role & permissions`);
        }
    }

    // Verify
    console.log('\n📊 Verification:');
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['staff', 'super_admin']);

    if (profiles) {
        for (const p of profiles) {
            const { data: authData } = await supabase.auth.admin.getUserById(p.id);
            console.log(`  ${p.role === 'super_admin' ? '👑' : '👤'} ${p.full_name || 'N/A'} — ${authData?.user?.email || 'N/A'} (${p.role})`);
        }
    }

    console.log('\n✅ Done!');
}

createStaffUsers().catch(console.error);
