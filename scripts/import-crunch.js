#!/usr/bin/env node
/**
 * Import: crunch.csv → mother_accounts + sale_slots + customers + sales
 *
 * Rules:
 * - PAGO CUENTA COMPLETA rows = mother accounts (skip my own number 595994540904 as customer)
 * - Perfil X rows = individual sales
 * - Customer name = "Cliente " + last 4 digits of phone
 * - Platform saved as "CRUNCHYROLL"
 * - Each account has 5 profiles; missing ones created as 'available'
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const MY_OWN_PHONE = '595994540904'; // Owner's number — not a customer
const PLATFORM_NAME = 'CRUNCHYROLL';
const TOTAL_SLOTS = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── CSV Parser ────────────────────────────────────────────────────────────
function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
    const lines = raw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = (values[i] || '').trim());
        return obj;
    });
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function clientName(phone) {
    if (!phone || phone === MY_OWN_PHONE) return null;
    return 'Cliente ' + String(phone).slice(-4);
}

function normalizePhone(phone) {
    if (!phone) return null;
    phone = String(phone).replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '595' + phone.slice(1);
    if (!phone.startsWith('595')) phone = '595' + phone;
    return phone;
}

function parseDate(str) {
    if (!str) return null;
    // YYYY-MM-DD already
    return str.length === 10 ? str : null;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function importData() {
    const csvPath = path.join(__dirname, '..', 'datos', 'crunch.csv');
    const rows = parseCSV(csvPath);

    console.log(`📂 Leyendo ${rows.length} filas de crunch.csv...\n`);

    // 1. Ensure platform exists
    const { data: existingPlatform } = await (supabase.from('platforms'))
        .select('id')
        .eq('name', PLATFORM_NAME)
        .single();

    let platformId = existingPlatform?.id;
    if (!platformId) {
        const { data: newP } = await (supabase.from('platforms'))
            .insert({ name: PLATFORM_NAME, is_active: true, slot_label: 'Perfil', business_type: 'streaming' })
            .select('id').single();
        platformId = newP?.id;
        console.log(`✅ Plataforma CRUNCHYROLL creada`);
    } else {
        console.log(`✅ Plataforma CRUNCHYROLL encontrada`);
    }

    // 2. Extract mother accounts from PAGO CUENTA COMPLETA rows
    const madreRows = rows.filter(r => r['Pantalla'] === 'PAGO CUENTA COMPLETA');
    console.log(`\n📦 Cuentas madre a importar: ${madreRows.length}`);

    // Map: email → mother_account_id
    const accountMap = {};

    for (const row of madreRows) {
        const email = row['Usuario'];
        const password = row['Clave'];
        const renewalDate = parseDate(row['Fecha Vencimiento']);
        const supplierName = row['Nombre Proveedor'] || null;
        const purchaseCost = parseFloat(row['Precio Comprada']) || 0;
        const billingDay = renewalDate ? new Date(renewalDate + 'T12:00:00').getDate() : new Date().getDate();

        const { data: acc, error } = await (supabase.from('mother_accounts'))
            .insert({
                platform: PLATFORM_NAME,
                email,
                password,
                renewal_date: renewalDate,
                target_billing_day: billingDay,
                max_slots: TOTAL_SLOTS,
                status: 'active',
                supplier_name: supplierName,
                supplier_phone: null,
                purchase_cost_gs: purchaseCost,
                sale_type: 'profile',
            })
            .select('id')
            .single();

        if (error) {
            console.error(`  ❌ Error insertando ${email}: ${error.message}`);
        } else {
            accountMap[email] = acc.id;
            console.log(`  ✅ ${email} (id: ${acc.id})`);
        }
    }

    // 3. Process individual profile rows
    const perfilRows = rows.filter(r => r['Pantalla'] !== 'PAGO CUENTA COMPLETA');
    console.log(`\n🎯 Ventas individuales a importar: ${perfilRows.length}`);

    // Track which profiles exist per account
    const existingSlots = {}; // email → Set of slot names

    for (const row of perfilRows) {
        const email = row['Usuario'];
        const motherAccountId = accountMap[email];
        if (!motherAccountId) {
            console.warn(`  ⚠️  Cuenta madre no encontrada para: ${email}`);
            continue;
        }

        const slotName = row['Pantalla']; // "Perfil 1", "Perfil 2", etc.
        const pin = row['PIN'] === 'NO REQUIERE' ? null : (row['PIN'] || null);
        const phone = normalizePhone(row['Celular Cliente']);
        const name = clientName(row['Celular Cliente']);
        const salePrice = parseFloat(row['Precio de Venta']) || 0;
        const startDate = parseDate(row['Fecha de Entrega']);
        const endDate = parseDate(row['Fecha Vencimiento']);
        const durationDays = parseInt(row['Días de Servicio']) || 30;

        if (!existingSlots[email]) existingSlots[email] = new Set();
        existingSlots[email].add(slotName);

        // 3a. Upsert customer (by phone)
        let customerId = null;
        if (phone && phone !== MY_OWN_PHONE) {
            const { data: existCust } = await (supabase.from('customers'))
                .select('id').eq('phone', phone).single();

            if (existCust) {
                customerId = existCust.id;
            } else {
                const { data: newCust } = await (supabase.from('customers'))
                    .insert({ phone, full_name: name })
                    .select('id').single();
                customerId = newCust?.id;
            }
        }

        // 3b. Create sale_slot (occupied)
        const { data: slot, error: slotErr } = await (supabase.from('sale_slots'))
            .insert({
                mother_account_id: motherAccountId,
                slot_identifier: slotName,
                pin_code: pin,
                status: 'occupied',
            })
            .select('id').single();

        if (slotErr) {
            console.error(`  ❌ Slot ${slotName} (${email}): ${slotErr.message}`);
            continue;
        }

        // 3c. Create sale
        if (customerId) {
            const { error: saleErr } = await (supabase.from('sales'))
                .insert({
                    customer_id: customerId,
                    slot_id: slot.id,
                    amount_gs: salePrice,
                    start_date: startDate,
                    expiration_date: endDate,
                    duration_days: durationDays,
                    platform: PLATFORM_NAME,
                    is_active: true,
                    status: 'active',
                });
            if (saleErr) console.error(`  ❌ Venta ${slotName} (${email}): ${saleErr.message}`);
            else console.log(`  ✅ ${slotName} → Cliente ${phone?.slice(-4)} | Gs. ${salePrice}`);
        } else {
            console.log(`  ✅ ${slotName} → (sin cliente registrado)`);
        }
    }

    // 4. Create missing profiles as 'available'
    console.log('\n🆓 Generando perfiles faltantes como disponible...');
    const allProfiles = ['Perfil 1', 'Perfil 2', 'Perfil 3', 'Perfil 4', 'Perfil 5'];

    for (const [email, motherAccountId] of Object.entries(accountMap)) {
        const existing = existingSlots[email] || new Set();
        const missing = allProfiles.filter(p => !existing.has(p));

        for (const slotName of missing) {
            const { error } = await (supabase.from('sale_slots'))
                .insert({
                    mother_account_id: motherAccountId,
                    slot_identifier: slotName,
                    pin_code: null,
                    status: 'available',
                });
            if (error) console.error(`  ❌ ${slotName} (${email}): ${error.message}`);
            else console.log(`  🟢 ${email} → ${slotName} (disponible)`);
        }
    }

    console.log('\n🎉 Importación de Crunchyroll completada.');
}

importData().catch(console.error);
