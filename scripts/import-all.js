#!/usr/bin/env node
/**
 * IMPORT ALL — reads every CSV in /datos and imports to ClickPar DB
 * Handles: crunch.csv, vix.csv (same format)
 * - 1 row PAGO CUENTA COMPLETA  per mother account
 * - 1 row per sold Perfil X
 * - Missing perfiles auto-created as 'available'
 * All inserts done in bulk (3 DB round-trips total per CSV).
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const MY_PHONE = '595994540904';
const TOTAL_PROFILES = 5;

const db = createClient(URL, KEY);

/* ── helpers ──────────────────────────────────────────────── */
function parseCSV(fp) {
    const raw = fs.readFileSync(fp, 'utf-8').replace(/\r/g, '');
    const [hdr, ...lines] = raw.split('\n').filter(l => l.trim());
    const headers = hdr.split(',').map(h => h.trim());
    return lines.map(line => {
        const obj = {};
        line.split(',').forEach((v, i) => { obj[headers[i] || i] = (v || '').trim(); });
        return obj;
    });
}

function normPhone(p) {
    if (!p) return null;
    p = String(p).replace(/\D/g, '');
    if (!p) return null;
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (!p.startsWith('595')) p = '595' + p;
    return p;
}

function dateStr(s) { return s && s.length === 10 ? s : null; }

function platformName(raw) {
    // Normalize: "CRUNCHYROLL - 1 ᴘᴇʀꜰɪʟ" → "CRUNCHYROLL", "VIX" → "VIX"
    if (!raw) return raw;
    return raw.split(' - ')[0].split(' ')[0].toUpperCase();
}

/* ── import one CSV file ──────────────────────────────────── */
async function importFile(filePath, existingMothers, existingSlots, existingCustomers) {
    const fileName = path.basename(filePath);
    const rows = parseCSV(filePath);

    const madreRows = rows.filter(r => r['Pantalla'] === 'PAGO CUENTA COMPLETA');
    const perfilRows = rows.filter(r => r['Pantalla'] !== 'PAGO CUENTA COMPLETA');

    const platform = platformName(rows[0]?.['Plataforma']);
    console.log(`\n===== ${fileName} — Plataforma: ${platform} =====`);
    console.log(`  Cuentas madre: ${madreRows.length}  |  Perfiles vendidos: ${perfilRows.length}`);

    /* 1. Ensure platform exists */
    const { data: plat } = await db.from('platforms').select('id').eq('name', platform).limit(1);
    let platformId = plat?.[0]?.id;
    if (!platformId) {
        const { data: np } = await db.from('platforms')
            .insert({ name: platform, is_active: true, slot_label: 'Perfil', business_type: 'streaming' })
            .select('id').single();
        platformId = np?.id;
        console.log(`  Plataforma creada: ${platform}`);
    }

    /* 2. Insert NEW mother accounts (skip existing email+platform pairs) */
    const newMadres = madreRows.filter(r => {
        const key = r['Usuario'] + '|' + platform;
        return !existingMothers.has(key);
    });
    let motherMap = {}; // email → id (populated from DB)

    if (newMadres.length) {
        const toInsert = newMadres.map(r => {
            const renewal = dateStr(r['Fecha Vencimiento']);
            return {
                platform,
                email: r['Usuario'],
                password: r['Clave'],
                renewal_date: renewal,
                target_billing_day: renewal ? new Date(renewal + 'T12:00:00').getDate() : new Date().getDate(),
                max_slots: parseInt(r['Número de Pantallas']) || TOTAL_PROFILES,
                status: 'active',
                supplier_name: r['Nombre Proveedor'] || null,
                supplier_phone: null,
                purchase_cost_gs: parseFloat(r['Precio Comprada']) || 0,
                sale_type: 'profile',
            };
        });
        const { data: inserted, error } = await db.from('mother_accounts').insert(toInsert).select('id,email');
        if (error) { console.error('  Error madre:', error.message); }
        else {
            inserted.forEach(a => { motherMap[a.email] = a.id; existingMothers.add(a.email + '|' + platform); });
            console.log(`  Cuentas madre insertadas: ${inserted.length}`);
        }
    }

    // Load ALL mother accounts for this platform (including pre-existing)
    const { data: allMothers } = await db.from('mother_accounts').select('id,email').eq('platform', platform);
    (allMothers || []).forEach(a => { motherMap[a.email] = a.id; });

    /* 3. Bulk upsert customers (dedupe by phone, skip owner phone) */
    const custPhones = [...new Set(
        perfilRows
            .map(r => normPhone(r['Celular Cliente']))
            .filter(p => p && p !== MY_PHONE && !existingCustomers.has(p))
    )];
    let custMap = {}; // phone → id

    if (custPhones.length) {
        const toInsert = custPhones.map(phone => ({ phone, full_name: 'Cliente ' + phone.slice(-4) }));
        const { data: inserted, error } = await db.from('customers')
            .upsert(toInsert, { onConflict: 'phone' }).select('id,phone');
        if (error) { console.error('  Error clientes:', error.message); }
        else {
            inserted.forEach(c => { custMap[c.phone] = c.id; existingCustomers.add(c.phone); });
            console.log(`  Clientes insertados: ${inserted.length}`);
        }
    }
    // Load all existing customers for phones in this file
    if (custPhones.length) {
        const { data: existing } = await db.from('customers').select('id,phone').in('phone', custPhones);
        (existing || []).forEach(c => { custMap[c.phone] = c.id; });
    }

    /* 4. Prepare sold slots (skip already-existing ones) */
    const soldSlotRows = [];
    const soldSlotMeta = [];

    for (const row of perfilRows) {
        const email = row['Usuario'];
        const maId = motherMap[email];
        const slot = row['Pantalla'];
        if (!maId) { console.warn('  Sin cuenta madre para:', email); continue; }
        const slotKey = maId + '|' + slot;
        if (existingSlots.has(slotKey)) { console.log('  (slot ya existe):', email, slot); continue; }

        soldSlotRows.push({
            mother_account_id: maId,
            slot_identifier: slot,
            pin_code: row['PIN'] === 'NO REQUIERE' ? null : (row['PIN'] || null),
            status: 'sold',
        });
        soldSlotMeta.push({
            phone: normPhone(row['Celular Cliente']),
            price: parseFloat(row['Precio de Venta']) || 0,
            start: dateStr(row['Fecha de Entrega']),
            end: dateStr(row['Fecha Vencimiento']),
            days: parseInt(row['Dias de Servicio'] || row['Días de Servicio']) || 30,
        });
        existingSlots.add(slotKey);
    }

    /* 5. Insert sold slots in bulk */
    let insertedSlots = [];
    if (soldSlotRows.length) {
        const { data: ins, error } = await db.from('sale_slots').insert(soldSlotRows).select('id');
        if (error) { console.error('  Error slots:', error.message); }
        else { insertedSlots = ins || []; console.log(`  Slots vendidos insertados: ${insertedSlots.length}`); }
    }

    /* 6. Insert sales in bulk */
    const saleRows = [];
    insertedSlots.forEach((slot, i) => {
        const meta = soldSlotMeta[i];
        const custId = meta.phone ? custMap[meta.phone] : null;
        if (!custId) return;
        saleRows.push({
            customer_id: custId,
            slot_id: slot.id,
            amount_gs: meta.price,
            start_date: meta.start,
            expiration_date: meta.end,
            duration_days: meta.days,
            platform,
            is_active: true,
            status: 'active',
        });
    });
    if (saleRows.length) {
        const { data: ins, error } = await db.from('sales').insert(saleRows).select('id');
        if (error) console.error('  Error ventas:', error.message);
        else console.log(`  Ventas insertadas: ${ins?.length}`);
    }

    /* 7. Create missing available slots for each mother account */
    const allProfiles = Array.from({ length: TOTAL_PROFILES }, (_, i) => `Perfil ${i + 1}`);
    const availRows = [];
    for (const [email, maId] of Object.entries(motherMap)) {
        for (const prof of allProfiles) {
            const key = maId + '|' + prof;
            if (!existingSlots.has(key)) {
                availRows.push({ mother_account_id: maId, slot_identifier: prof, pin_code: null, status: 'available' });
                existingSlots.add(key);
            }
        }
    }
    if (availRows.length) {
        const { data: ins, error } = await db.from('sale_slots').insert(availRows).select('id');
        if (error) console.error('  Error slots disponibles:', error.message);
        else console.log(`  Slots disponibles creados: ${ins?.length}`);
    }
}

/* ── main ─────────────────────────────────────────────────── */
async function main() {
    console.log('Cargando estado actual de la DB...');

    const [{ data: mothers }, { data: slots }, { data: customers }] = await Promise.all([
        db.from('mother_accounts').select('email,platform'),
        db.from('sale_slots').select('mother_account_id,slot_identifier'),
        db.from('customers').select('phone'),
    ]);

    const existingMothers = new Set((mothers || []).map(m => m.email + '|' + m.platform));
    const existingSlots = new Set((slots || []).map(s => s.mother_account_id + '|' + s.slot_identifier));
    const existingCustomers = new Set((customers || []).map(c => c.phone));

    console.log(`  Cuentas madre existentes : ${existingMothers.size}`);
    console.log(`  Slots existentes          : ${existingSlots.size}`);
    console.log(`  Clientes existentes       : ${existingCustomers.size}`);

    const datosDir = path.join(__dirname, '..', 'datos');
    const csvFiles = fs.readdirSync(datosDir).filter(f => f.endsWith('.csv'));
    console.log(`\nArchivos CSV encontrados: ${csvFiles.join(', ')}`);

    for (const file of csvFiles) {
        await importFile(
            path.join(datosDir, file),
            existingMothers,
            existingSlots,
            existingCustomers
        );
    }

    console.log('\n\nIMPORTACION COMPLETA.');
}

main().catch(console.error);
