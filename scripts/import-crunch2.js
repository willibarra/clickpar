#!/usr/bin/env node
/**
 * Crunchyroll import — Part 2 (bulk approach)
 * Inserts: customers (bulk), occupied slots (bulk), sales (bulk)
 * Skips any slots that already exist for the mother account.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const MY_PHONE = '595994540904';
const PLATFORM = 'CRUNCHYROLL';

const db = createClient(URL, KEY);

/* ── helpers ─────────────────────────────────────────────── */
function parseCSV(fp) {
    const raw = fs.readFileSync(fp, 'utf-8').replace(/\r/g, '');
    const [headerLine, ...dataLines] = raw.split('\n').filter(l => l.trim());
    const headers = headerLine.split(',').map(h => h.trim());
    return dataLines.map(line => {
        const obj = {};
        line.split(',').forEach((v, i) => { obj[headers[i]] = (v || '').trim(); });
        return obj;
    });
}
function normPhone(p) {
    if (!p) return null;
    p = String(p).replace(/\D/g, '');
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (!p.startsWith('595')) p = '595' + p;
    return p;
}
function last4(p) { return p ? String(p).slice(-4) : '????'; }
function dateStr(s) { return s && s.length === 10 ? s : null; }

/* ── main ────────────────────────────────────────────────── */
async function run() {
    const rows = parseCSV(path.join('datos', 'crunch.csv'));
    const sold = rows.filter(r => r['Pantalla'] !== 'PAGO CUENTA COMPLETA');
    console.log(`Filas con ventas a importar: ${sold.length}`);

    /* 1. Load mother accounts */
    const { data: accts, error: acctErr } = await db
        .from('mother_accounts').select('id,email').eq('platform', PLATFORM);
    if (acctErr) { console.error('Error cargando cuentas madre:', acctErr.message); return; }
    const byEmail = Object.fromEntries((accts || []).map(a => [a.email, a.id]));
    console.log('Cuentas madre:', Object.keys(byEmail));

    /* 2. Load existing slots (to skip duplicates) */
    const { data: existSlots } = await db
        .from('sale_slots')
        .select('mother_account_id,slot_identifier');
    const slotExists = new Set((existSlots || []).map(s => s.mother_account_id + '|' + s.slot_identifier));

    /* 3. Prepare unique customers (dedupe by phone) */
    const custMap = {};   // phone → id
    const toInsertCustomers = [];
    for (const row of sold) {
        const rawPhone = row['Celular Cliente'];
        const phone = normPhone(rawPhone);
        if (!phone || phone === MY_PHONE || custMap[phone] !== undefined) continue;
        custMap[phone] = null; // placeholder
        toInsertCustomers.push({ phone, full_name: 'Cliente ' + last4(phone) });
    }

    /* 3a. Bulk-insert customers */
    if (toInsertCustomers.length) {
        const { data: inserted, error: custErr } = await db
            .from('customers')
            .upsert(toInsertCustomers, { onConflict: 'phone' })
            .select('id,phone');
        if (custErr) { console.error('Error insertando clientes:', custErr.message); return; }
        (inserted || []).forEach(c => { custMap[c.phone] = c.id; });
        console.log(`Clientes insertados/actualizados: ${inserted?.length}`);
    }

    /* 4. Prepare slots bulk insert */
    const slotRows = [];
    const slotMeta = []; // parallel array for sale metadata
    for (const row of sold) {
        const email = row['Usuario'];
        const maId = byEmail[email];
        const slot = row['Pantalla'];
        if (!maId) { console.warn('Sin madre para:', email); continue; }
        if (slotExists.has(maId + '|' + slot)) {
            console.log('(ya existe):', email, slot);
            continue;
        }
        const pin = row['PIN'] === 'NO REQUIERE' ? null : (row['PIN'] || null);
        slotRows.push({ mother_account_id: maId, slot_identifier: slot, pin_code: pin, status: 'sold' });
        slotMeta.push({
            phone: normPhone(row['Celular Cliente']),
            price: parseFloat(row['Precio de Venta']) || 0,
            start: dateStr(row['Fecha de Entrega']),
            end: dateStr(row['Fecha Vencimiento']),
            days: parseInt(row['Dias de Servicio'] || row['Días de Servicio']) || 30,
        });
    }

    if (!slotRows.length) { console.log('No hay slots nuevos para importar.'); return; }
    console.log(`Slots a insertar: ${slotRows.length}`);

    /* 4a. Bulk-insert slots */
    const { data: insertedSlots, error: slotErr } = await db
        .from('sale_slots')
        .insert(slotRows)
        .select('id');
    if (slotErr) { console.error('Error insertando slots:', slotErr.message); return; }
    console.log(`Slots insertados: ${insertedSlots?.length}`);

    /* 5. Prepare sales bulk insert */
    const saleRows = [];
    (insertedSlots || []).forEach((slot, i) => {
        const meta = slotMeta[i];
        const custId = meta.phone ? custMap[meta.phone] : null;
        if (!custId) { console.log('Sin cliente para slot', slot.id); return; }
        saleRows.push({
            customer_id: custId,
            slot_id: slot.id,
            amount_gs: meta.price,
            start_date: meta.start,
            expiration_date: meta.end,
            duration_days: meta.days,
            platform: PLATFORM,
            is_active: true,
            status: 'active',
        });
    });

    /* 5a. Bulk-insert sales */
    if (saleRows.length) {
        const { data: insertedSales, error: saleErr } = await db
            .from('sales')
            .insert(saleRows)
            .select('id');
        if (saleErr) { console.error('Error insertando ventas:', saleErr.message); return; }
        console.log(`Ventas insertadas: ${insertedSales?.length}`);
    }

    console.log('\nImportacion Crunchyroll Part 2 — COMPLETADA.');
}

run().catch(console.error);
