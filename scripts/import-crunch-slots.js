#!/usr/bin/env node
/**
 * Import part 2: insert occupied slots + sales + customers for crunch.csv
 * (Mother accounts already inserted in part 1)
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const MY_OWN_PHONE = '595994540904';
const PLATFORM_NAME = 'CRUNCHYROLL';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseCSV(fp) {
    const raw = fs.readFileSync(fp, 'utf-8').replace(/\r/g, '');
    const lines = raw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
        return obj;
    });
}

function clientName(p) {
    if (!p || p === MY_OWN_PHONE) return null;
    return 'Cliente ' + String(p).slice(-4);
}

function normPhone(p) {
    if (!p) return null;
    p = String(p).replace(/\D/g, '');
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (!p.startsWith('595')) p = '595' + p;
    return p;
}

function parseDate(s) {
    if (!s) return null;
    return s.length === 10 ? s : null;
}

async function run() {
    const rows = parseCSV(path.join('datos', 'crunch.csv'));
    const perfilRows = rows.filter(r => r['Pantalla'] !== 'PAGO CUENTA COMPLETA');

    // Get existing mother accounts
    const { data: accounts } = await supabase.from('mother_accounts').select('id,email').eq('platform', PLATFORM_NAME);
    const accountMap = {};
    (accounts || []).forEach(a => accountMap[a.email] = a.id);
    console.log('Cuentas madre encontradas:', Object.keys(accountMap).length);

    for (const row of perfilRows) {
        const email = row['Usuario'];
        const motherAccountId = accountMap[email];
        if (!motherAccountId) { console.warn('Sin cuenta madre para:', email); continue; }

        const slotName = row['Pantalla'];
        const pin = row['PIN'] === 'NO REQUIERE' ? null : (row['PIN'] || null);
        const rawPhone = row['Celular Cliente'];
        const phone = normPhone(rawPhone);
        const name = clientName(rawPhone);
        const salePrice = parseFloat(row['Precio de Venta']) || 0;
        const startDate = parseDate(row['Fecha de Entrega']);
        const endDate = parseDate(row['Fecha Vencimiento']);
        const durationDays = parseInt(row['Dias de Servicio'] || row['Días de Servicio']) || 30;

        // Upsert customer
        let customerId = null;
        if (phone && phone !== MY_OWN_PHONE) {
            const { data: ec } = await supabase.from('customers').select('id').eq('phone', phone).single();
            if (ec) {
                customerId = ec.id;
            } else {
                const { data: nc } = await supabase.from('customers').insert({ phone, full_name: name }).select('id').single();
                customerId = nc && nc.id;
            }
        }

        // Create slot with status 'sold' (active sale)
        const { data: slot, error: slotErr } = await supabase.from('sale_slots').insert({
            mother_account_id: motherAccountId,
            slot_identifier: slotName,
            pin_code: pin,
            status: 'sold',
        }).select('id').single();

        if (slotErr) { console.error('Slot error', slotName, email, slotErr.message); continue; }

        // Create sale
        if (customerId) {
            const { error: saleErr } = await supabase.from('sales').insert({
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
            if (saleErr) console.error('Sale error', slotName, saleErr.message);
            else console.log('OK', slotName, '→ Cliente', phone && phone.slice(-4), '| Gs.', salePrice);
        } else {
            console.log('OK', slotName, '(sin cliente)');
        }
    }
    console.log('\nHecho.');
}

run().catch(console.error);
