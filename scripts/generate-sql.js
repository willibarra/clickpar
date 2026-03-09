#!/usr/bin/env node
/**
 * Generates SQL files from /datos/*.csv
 * NO DB CONNECTION — just reads CSV and writes .sql files
 * Paste the output SQL in: Supabase Dashboard → SQL Editor → Run
 */
const fs = require('fs');
const path = require('path');

const MY_PHONE = '595994540904';
const TOTAL_SLOTS = 5;

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

function esc(v) { return v ? `'${v.replace(/'/g, "''")}'` : 'NULL'; }
function normPhone(p) {
    if (!p) return null;
    p = String(p).replace(/\D/g, '');
    if (!p) return null;
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (!p.startsWith('595')) p = '595' + p;
    return p;
}
function dateVal(s) { return s && s.length === 10 ? `'${s}'` : 'NULL'; }
function platformName(raw) { return (raw || '').split(' - ')[0].split(' ')[0].toUpperCase(); }

function generateSQL(filePath) {
    const rows = parseCSV(filePath);
    const madreRows = rows.filter(r => r['Pantalla'] === 'PAGO CUENTA COMPLETA');
    const soldRows = rows.filter(r => r['Pantalla'] !== 'PAGO CUENTA COMPLETA');
    const platform = platformName(rows[0]?.['Plataforma']);
    const lines = [];

    lines.push(`-- ============================================================`);
    lines.push(`-- ${path.basename(filePath)}  →  Plataforma: ${platform}`);
    lines.push(`-- ============================================================\n`);

    /* 1. Platform */
    lines.push(`-- 1) Plataforma`);
    lines.push(`INSERT INTO platforms (name, is_active, slot_label, business_type)`);
    lines.push(`VALUES ('${platform}', true, 'Perfil', 'streaming')`);
    lines.push(`ON CONFLICT (name) DO NOTHING;\n`);

    /* 2. Mother accounts */
    lines.push(`-- 2) Cuentas madre`);
    for (const r of madreRows) {
        const renewal = r['Fecha Vencimiento'];
        const billingDay = renewal ? new Date(renewal + 'T12:00:00').getDate() : new Date().getDate();
        const maxSlots = parseInt(r['Número de Pantallas']) || TOTAL_SLOTS;
        const cost = parseFloat(r['Precio Comprada']) || 0;
        lines.push(`INSERT INTO mother_accounts (platform, email, password, renewal_date, target_billing_day, max_slots, status, supplier_name, purchase_cost_gs, sale_type)`);
        lines.push(`SELECT '${platform}', ${esc(r['Usuario'])}, ${esc(r['Clave'])}, ${dateVal(renewal)}, ${billingDay}, ${maxSlots}, 'active', ${esc(r['Nombre Proveedor'])}, ${cost}, 'profile'`);
        lines.push(`WHERE NOT EXISTS (SELECT 1 FROM mother_accounts WHERE email = ${esc(r['Usuario'])} AND platform = '${platform}');\n`);
    }

    /* 3. Customers (unique phones only, skip owner) */
    const phones = [...new Set(
        soldRows.map(r => normPhone(r['Celular Cliente'])).filter(p => p && p !== MY_PHONE)
    )];
    lines.push(`-- 3) Clientes`);
    for (const phone of phones) {
        const name = 'Cliente ' + phone.slice(-4);
        lines.push(`INSERT INTO customers (phone, full_name) VALUES ('${phone}', '${name}') ON CONFLICT (phone) DO NOTHING;`);
    }
    lines.push('');

    /* 4. Sold slots */
    lines.push(`-- 4) Slots vendidos (con perfil + cliente)`);
    for (const r of soldRows) {
        const email = r['Usuario'];
        const slot = r['Pantalla'];
        const pin = r['PIN'] === 'NO REQUIERE' ? 'NULL' : esc(r['PIN']);
        lines.push(`INSERT INTO sale_slots (mother_account_id, slot_identifier, pin_code, status)`);
        lines.push(`SELECT id, '${slot}', ${pin}, 'sold' FROM mother_accounts WHERE email = ${esc(email)} AND platform = '${platform}'`);
        lines.push(`AND NOT EXISTS (SELECT 1 FROM sale_slots ss WHERE ss.mother_account_id = mother_accounts.id AND ss.slot_identifier = '${slot}');\n`);
    }

    /* 5. Available slots (missing profiles) */
    lines.push(`-- 5) Slots disponibles (perfiles libres)`);
    const allProfiles = Array.from({ length: TOTAL_SLOTS }, (_, i) => `Perfil ${i + 1}`);
    for (const r of madreRows) {
        for (const prof of allProfiles) {
            lines.push(`INSERT INTO sale_slots (mother_account_id, slot_identifier, pin_code, status)`);
            lines.push(`SELECT id, '${prof}', NULL, 'available' FROM mother_accounts WHERE email = ${esc(r['Usuario'])} AND platform = '${platform}'`);
            lines.push(`AND NOT EXISTS (SELECT 1 FROM sale_slots ss WHERE ss.mother_account_id = mother_accounts.id AND ss.slot_identifier = '${prof}');\n`);
        }
    }

    /* 6. Sales */
    lines.push(`-- 6) Ventas activas`);
    for (const r of soldRows) {
        const phone = normPhone(r['Celular Cliente']);
        if (!phone || phone === MY_PHONE) continue;
        const start = dateVal(r['Fecha de Entrega']);
        const end = dateVal(r['Fecha Vencimiento']);
        const days = parseInt(r['Dias de Servicio'] || r['Días de Servicio']) || 30;
        const price = parseFloat(r['Precio de Venta']) || 0;
        const slot = r['Pantalla'];
        const email = r['Usuario'];
        lines.push(`INSERT INTO sales (customer_id, slot_id, amount_gs, start_date, expiration_date, duration_days, platform, is_active, status)`);
        lines.push(`SELECT`);
        lines.push(`  (SELECT id FROM customers WHERE phone = '${phone}'),`);
        lines.push(`  (SELECT ss.id FROM sale_slots ss`);
        lines.push(`     JOIN mother_accounts ma ON ma.id = ss.mother_account_id`);
        lines.push(`     WHERE ma.email = ${esc(email)} AND ma.platform = '${platform}' AND ss.slot_identifier = '${slot}' LIMIT 1),`);
        lines.push(`  ${price}, ${start}, ${end}, ${days}, '${platform}', true, 'active'`);
        lines.push(`WHERE NOT EXISTS (`);
        lines.push(`  SELECT 1 FROM sales s`);
        lines.push(`  JOIN sale_slots ss ON ss.id = s.slot_id`);
        lines.push(`  JOIN mother_accounts ma ON ma.id = ss.mother_account_id`);
        lines.push(`  WHERE ma.email = ${esc(email)} AND ss.slot_identifier = '${slot}'`);
        lines.push(`);\n`);
    }

    return lines.join('\n');
}

// Generate one .sql file per CSV
const datosDir = path.join(__dirname, '..', 'datos');
const outDir = path.join(__dirname, '..', 'datos');
const csvFiles = fs.readdirSync(datosDir).filter(f => f.endsWith('.csv'));

for (const file of csvFiles) {
    const sql = generateSQL(path.join(datosDir, file));
    const outFile = path.join(outDir, file.replace('.csv', '.sql'));
    fs.writeFileSync(outFile, sql);
    console.log(`Generado: ${outFile}`);
}
console.log('\nListo. Pega cada .sql en el SQL Editor de tu panel Supabase.');
