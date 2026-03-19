#!/usr/bin/env node
/**
 * Backfill portal accounts for all customers that:
 * - Have at least one active sale
 * - Don't have a portal_password yet
 *
 * Run: node scripts/backfill-portal-accounts.js
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const PORTAL_ENCRYPTION_KEY = '970417c4045048d529a5d5060b4ff37b07e565d5e67befc008f4b9d6755dcaff';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Encryption helpers ─────────────────────────────────────────────────────
function encrypt(text) {
    const key = Buffer.from(PORTAL_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function generatePassword() {
    const p1 = Math.random().toString(36).slice(2, 6);
    const p2 = Math.random().toString(36).slice(2, 6);
    return `CP-${p1}-${p2}`;
}

function normalizePhone(phone) {
    if (!phone) return phone;
    let p = phone.replace(/\s+/g, '');
    if (!p.startsWith('+')) p = `+${p}`;
    return p;
}

async function main() {
    console.log('🔄 Backfilling portal accounts...\n');

    // 1. Get all active sales to find customer IDs with active subscriptions
    console.log('📊 Buscando ventas activas...');
    const { data: activeSales, error: salesErr } = await supabase
        .from('sales')
        .select('customer_id')
        .eq('is_active', true);

    if (salesErr) {
        console.error('❌ Error fetching sales:', salesErr.message);
        process.exit(1);
    }

    const activeCustomerIds = [...new Set((activeSales || []).map(s => s.customer_id))];
    console.log(`✅ ${activeCustomerIds.length} clientes con ventas activas\n`);

    if (activeCustomerIds.length === 0) {
        console.log('Sin ventas activas encontradas.');
        return;
    }

    // 2. Get those customers in batches of 50
    const allCustomers = [];
    const batchSize = 50;
    for (let i = 0; i < activeCustomerIds.length; i += batchSize) {
        const batch = activeCustomerIds.slice(i, i + batchSize);
        const { data, error } = await supabase
            .from('customers')
            .select('id, full_name, phone, portal_password')
            .in('id', batch)
            .is('portal_password', null);
        if (error) {
            console.error('❌ Error fetching customer batch:', error.message);
        } else {
            allCustomers.push(...(data || []));
        }
    }

    console.log(`📋 ${allCustomers.length} de esos clientes NO tienen cuenta de portal\n`);

    if (allCustomers.length === 0) {
        console.log('✅ Todos los clientes con ventas activas ya tienen portal account!');
        return;
    }

    // 3. Pre-load all existing auth users (to avoid N+1 listUsers calls)
    console.log('🔍 Cargando usuarios existentes en auth...');
    let existingAuthUsers = [];
    try {
        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 5000 });
        existingAuthUsers = users || [];
    } catch (e) {
        console.warn('⚠️  No se pudo pre-cargar usuarios auth:', e.message);
    }
    const authByEmail = new Map(existingAuthUsers.map(u => [u.email, u]));
    console.log(`✅ ${existingAuthUsers.length} usuarios auth cargados\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const customer of allCustomers) {
        if (!customer.phone) {
            console.log(`  ⚠️  ${customer.full_name || customer.id} — sin teléfono, omitiendo`);
            skipped++;
            continue;
        }

        const phone = normalizePhone(customer.phone);
        const phoneClean = phone.replace(/^\+/, '');
        const email = `${phoneClean}@clickpar.shop`;
        const password = generatePassword();
        const fullName = customer.full_name || phone;

        process.stdout.write(`  👤 ${fullName} (${phone})... `);

        try {
            const existing = authByEmail.get(email);

            if (existing) {
                // Update password
                await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
                await supabase.from('profiles').upsert({
                    id: existing.id,
                    full_name: fullName,
                    phone_number: phone,
                    role: 'customer',
                }, { onConflict: 'id' });
                await supabase.from('customers')
                    .update({ portal_password: encrypt(password) })
                    .eq('id', customer.id);
                console.log(`🔄 actualizado (contraseña: ${password})`);
                updated++;
            } else {
                // Create new auth user
                const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
                    email,
                    phone,
                    password,
                    email_confirm: true,
                    phone_confirm: true,
                    user_metadata: { full_name: fullName, customer_id: customer.id },
                    app_metadata: { user_role: 'customer' },
                });

                if (authErr) {
                    console.log(`❌ ${authErr.message}`);
                    errors++;
                    continue;
                }

                await supabase.from('profiles').upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    phone_number: phone,
                    role: 'customer',
                }, { onConflict: 'id' });

                await supabase.from('customers')
                    .update({ portal_password: encrypt(password) })
                    .eq('id', customer.id);

                console.log(`✅ creado (contraseña: ${password})`);
                created++;
            }
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
            errors++;
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n══════════════════════════════════');
    console.log(`✅ Cuentas creadas:       ${created}`);
    console.log(`🔄 Contraseñas actualizadas: ${updated}`);
    console.log(`⚠️  Omitidos (sin tel):   ${skipped}`);
    console.log(`❌ Errores:               ${errors}`);
    console.log('══════════════════════════════════');
    console.log('\n🎉 Backfill completado!');
}

main().catch(console.error);
