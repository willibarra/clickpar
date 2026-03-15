/**
 * DIAGNÓSTICO GLOBAL: Slots 'sold' sin venta activa en TODA la BD
 * + Cruce con CSVs de importación para recuperar datos de cliente
 *
 * Uso: node datos/global_orphan_slots.mjs [--fix] [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const env = Object.fromEntries(
    readFileSync(resolve(ROOT, '.env.local'), 'utf-8').split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]; })
);
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

// ── Parser CSV sin dependencias ─────────────────────────────────────────────
function parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const values = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        values.push(cur.trim());
        const row = {};
        headers.forEach((h, i) => row[h] = (values[i] || '').replace(/^"|"$/g, '').trim());
        return row;
    });
}

const doFix  = process.argv.includes('--fix');
const dryRun = process.argv.includes('--dry-run');
const mode   = doFix ? (dryRun ? 'DRY-RUN FIX' : 'FIX') : 'DIAGNÓSTICO';
console.log(`\n🔍 Global Orphan Slots [${mode}]\n`);

// ── PASO 1: Normalización ───────────────────────────────────────────────────
function normalizePhone(p) {
    if (!p) return null;
    const d = String(p).replace(/\D/g, '').replace(/^0+/, '');
    if (!d) return null;
    return d.startsWith('595') ? d : '595' + d;
}

function parseDate(str) {
    if (!str || str === '0' || str.trim() === '') return null;
    let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
}

// ── PASO 2: Cargar CSVs ─────────────────────────────────────────────────────
const CSV_FILES = [
    'NETFLIX_clean.csv',
    'Disney_clean.csv',
    'HBOMAX_clean.csv',
    'SPOTIFY_clean.csv',
    'PRIME VIDEO - PRIME VIDEO.csv',
    'Crunchyroll - Crunchyroll.csv',
    'YOUTUBE - YOUTUBE.csv',
    'VIX - VIX.csv',
    'FLUJOTV.csv',
    'Paramount+ - Paramount+.csv',
];

const csvMap = new Map();

for (const file of CSV_FILES) {
    const path = resolve(ROOT, 'datos', file);
    if (!existsSync(path)) continue;
    try {
        const rows = parseCSV(readFileSync(path, 'utf-8'));
        let added = 0;
        for (const row of rows) {
            const email  = (row['Usuario'] || '').trim().toLowerCase();
            const screen = (row['Pantalla'] || row['Perfil'] || '').trim();
            const sold   = (row['Vendido'] || '').trim();
            const phone  = normalizePhone(row['Celular Cliente'] || row['Numero Cliente']);
            const fecha  = parseDate(row['Fecha Vencimiento']);
            const precio = parseFloat((row['Precio de Venta'] || '0').replace(/[^0-9.]/g, '')) || 0;
            const pin    = (row['PIN'] || '').trim();

            if (!email || !screen) continue;
            if (screen.toUpperCase().includes('PAGO CUENTA COMPLETA')) continue;
            if (sold !== '1' && sold.toLowerCase() !== 'si') continue;

            const key = `${email}::${screen.toLowerCase()}`;
            if (!csvMap.has(key)) {
                csvMap.set(key, { email, screen, phone, fecha, precio, pin, file });
                added++;
            }
        }
        console.log(`   📄 ${file}: ${added} registros vendidos`);
    } catch (e) {
        console.warn(`   ⚠️  ${file}: ${e.message}`);
    }
}
console.log(`\n📂 Total registros vendidos en CSVs: ${csvMap.size}\n`);

// ── PASO 3: Obtener todos los slots 'sold' ──────────────────────────────────
const BATCH = 1000;
let allSoldSlots = [];
let from = 0;
while (true) {
    const { data, error } = await supabase
        .from('sale_slots')
        .select('id, slot_identifier, pin_code, status, mother_account_id, mother_account:mother_accounts(id, email, platform)')
        .eq('status', 'sold')
        .range(from, from + BATCH - 1);
    if (error) { console.error('❌', error.message); break; }
    if (!data || data.length === 0) break;
    allSoldSlots = allSoldSlots.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
}
console.log(`📦 Total slots 'sold' en BD: ${allSoldSlots.length}`);

// ── PASO 4: Detectar huérfanos ──────────────────────────────────────────────
// Obtener todos los slot_ids de ventas activas en una sola consulta
const allSlotIds = allSoldSlots.map(s => s.id);
const activeSaleSlotIds = new Set();

for (let i = 0; i < allSlotIds.length; i += 500) {
    const batch = allSlotIds.slice(i, i + 500);
    const { data: activeSales } = await supabase
        .from('sales')
        .select('slot_id')
        .in('slot_id', batch)
        .eq('is_active', true);
    (activeSales || []).forEach(s => activeSaleSlotIds.add(s.slot_id));
}

const orphanSlots = allSoldSlots.filter(s => !activeSaleSlotIds.has(s.id));
console.log(`🔴 Slots huérfanos (sold sin venta activa): ${orphanSlots.length}\n`);

// Obtener todas las ventas inactivas de huérfanos en lote
const orphanIds = orphanSlots.map(s => s.id);
const inactiveSalesMap = new Map();
for (let i = 0; i < orphanIds.length; i += 500) {
    const batch = orphanIds.slice(i, i + 500);
    const { data: inactive } = await supabase
        .from('sales')
        .select('id, slot_id, amount_gs, end_date, is_active, customer_id')
        .in('slot_id', batch)
        .order('created_at', { ascending: false });
    for (const s of inactive || []) {
        if (!inactiveSalesMap.has(s.slot_id)) inactiveSalesMap.set(s.slot_id, s);
    }
}

// ── PASO 5: Agrupar por plataforma y reportar ───────────────────────────────
const byPlatform = {};
for (const slot of orphanSlots) {
    const plat = slot.mother_account?.platform || 'Desconocida';
    if (!byPlatform[plat]) byPlatform[plat] = [];
    const key = `${slot.mother_account?.email?.toLowerCase()}::${slot.slot_identifier?.toLowerCase()}`;
    byPlatform[plat].push({
        slot,
        inactiveSale: inactiveSalesMap.get(slot.id) || null,
        csvRow: csvMap.get(key) || null,
    });
}

let totalConCSV = 0, totalSinCSV = 0;
let fixed = 0, notFixed = 0;

for (const [plat, items] of Object.entries(byPlatform).sort()) {
    const conCSV = items.filter(i => i.csvRow).length;
    const sinCSV = items.filter(i => !i.csvRow).length;
    totalConCSV += conCSV;
    totalSinCSV += sinCSV;

    console.log(`\n━━━━━━ ${plat.toUpperCase()} — ${items.length} huérfano(s) [CSV: ${conCSV}✅ / ${sinCSV}❌] ━━━━━━`);

    for (const { slot, inactiveSale, csvRow } of items) {
        const email = slot.mother_account?.email || '?';
        console.log(`\n  [${slot.slot_identifier}] ${email}`);
        if (inactiveSale) {
            console.log(`     Venta inactiva: ${inactiveSale.id} | vence=${inactiveSale.end_date}`);
        } else {
            console.log(`     Sin registro en sales`);
        }
        if (csvRow) {
            console.log(`     CSV ✅ tel=${csvRow.phone} | vence=${csvRow.fecha} | precio=${csvRow.precio} | pin=${csvRow.pin || '-'}`);
        } else {
            console.log(`     CSV ❌ No encontrado`);
        }

        // ── FIX ─────────────────────────────────────────────────────────────
        if (doFix && csvRow?.phone && csvRow?.fecha) {
            const { data: customer } = await supabase
                .from('customers')
                .select('id, full_name, phone')
                .eq('phone', csvRow.phone)
                .limit(1)
                .maybeSingle();

            if (!customer) {
                console.log(`     ⚠️  Cliente no encontrado para tel ${csvRow.phone}`);
                notFixed++;
                continue;
            }

            if (inactiveSale && inactiveSale.customer_id === customer.id) {
                if (!dryRun) {
                    const { error } = await supabase.from('sales')
                        .update({ is_active: true, end_date: csvRow.fecha, amount_gs: csvRow.precio || inactiveSale.amount_gs })
                        .eq('id', inactiveSale.id);
                    if (error) { console.log(`     ❌ Reactivar: ${error.message}`); notFixed++; }
                    else { console.log(`     ✅ REACTIVADA para ${customer.full_name}`); fixed++; }
                } else {
                    console.log(`     [DRY] Reactivaría venta para ${customer.full_name}`);
                    fixed++;
                }
            } else {
                if (!dryRun) {
                    const { error } = await supabase.from('sales').insert({
                        slot_id: slot.id,
                        customer_id: customer.id,
                        amount_gs: csvRow.precio || 0,
                        end_date: csvRow.fecha,
                        is_active: true,
                    });
                    if (error) { console.log(`     ❌ Crear venta: ${error.message}`); notFixed++; }
                    else { console.log(`     ✅ CREADA para ${customer.full_name}`); fixed++; }
                } else {
                    console.log(`     [DRY] Crearía venta para ${customer.full_name} (${customer.phone})`);
                    fixed++;
                }
            }
        }
    }
}

// ── RESUMEN ──────────────────────────────────────────────────────────────────
console.log('\n\n════════════════════════════════════════════════════════');
console.log('📋 RESUMEN GLOBAL');
console.log('════════════════════════════════════════════════════════');
console.log(`Total slots huérfanos:    ${orphanSlots.length}`);
console.log(`Con datos en CSV:         ${totalConCSV} ✅ (se pueden reparar)`);
console.log(`Sin datos en CSV:         ${totalSinCSV} ❌ (no hay info)`);
if (doFix) {
    console.log(`Corregidos:               ${fixed}`);
    console.log(`No corregidos:            ${notFixed}`);
}
console.log('════════════════════════════════════════════════════════\n');
if (!doFix && orphanSlots.length > 0) {
    console.log('💡 Para reparar: node datos/global_orphan_slots.mjs --fix --dry-run');
    console.log('💡 Para aplicar: node datos/global_orphan_slots.mjs --fix\n');
}
