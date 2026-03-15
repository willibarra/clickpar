/**
 * fix_prices.mjs  (v2)
 * ======================================================
 * Actualiza amount_gs en ventas activas con precio 0 o null:
 *
 * 1. Netflix:  usa los precios exactos del CSV (by phone + slot_identifier)
 * 2. Resto:    aplica precio modal de cada plataforma (calculado de ventas existentes)
 *
 * Uso:
 *   node datos/fix_prices.mjs --dry-run    (muestra qué cambiaría)
 *   node datos/fix_prices.mjs              (aplica los cambios)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ───────────────────────────────────────────────────────────────────
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('\n⚠️  MODO DRY-RUN — no se escribirá en la BD\n');

// ── Precios modales por plataforma para las que NO tienen CSV con precio ─────
// Calculados de ventas existentes que ya tienen precio (moda de la distribución)
const MODAL_PRICES = {
    'Spotify Premium':     30000,   // moda: 30k (39x de 74)
    'Disney+':             25000,   // moda: 25k (5x de 13)
    'HBO Max':             15000,   // moda: 15k (5x de 10)
    'Amazon Prime Video':  30000,   // moda: 30k (5x de 9)
    'YouTube Premium':     30000,   // moda: 30k (gen. consistente)
    'FLUJOTV':             30000,   // sin datos históricos, estimado
    'Paramount+':          30000,   // moda: 30k (2x de 2)
    'Vix':                 30000,   // moda: 30k (1x de 1)
    'Crunchyroll':         25000,   // moda: 25k (1x de 1)
};

// ── Mapa de nombres CSV → nombre en BD ───────────────────────────────────────
const PLATFORM_NAME_MAP = {
    'NETFLIX':                   'Netflix',
    'SPOTIFY PREMIUM INDIVIDUAL': 'Spotify Premium',
    'SPOTIFY PREMIUM DUO':        'Spotify Premium',
    'SPOTIFY PREMIUM FAMILY':     'Spotify Premium',
    'SPOTIFY':                    'Spotify Premium',
    'DISNEY+':                    'Disney+',
    'DISNEY+ [PREMIUM]':          'Disney+',
    'HBOMAX':                     'HBO Max',
    'HBO MAX':                    'HBO Max',
    'PRIME VIDEO':                'Amazon Prime Video',
    'AMAZON PRIME VIDEO':         'Amazon Prime Video',
    'YOUTUBE PREMIUM':            'YouTube Premium',
    'YOUTUBE':                    'YouTube Premium',
    'FLUJOTV':                    'FLUJOTV',
    'PARAMOUNT+':                 'Paramount+',
    'VIX':                        'Vix',
    'CRUNCHYROLL':                'Crunchyroll',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizePhone(raw) {
    if (!raw) return '';
    let p = String(raw).replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (p.length >= 9 && !p.startsWith('595')) p = '595' + p;
    return p;
}

function parsePrice(raw) {
    if (!raw || String(raw).trim() === '') return 0;
    const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
}

function normalizePlatformName(rawCsv) {
    const idx = rawCsv.indexOf(' - ');
    const base = (idx > 0 ? rawCsv.slice(0, idx) : rawCsv).trim().toUpperCase();
    return PLATFORM_NAME_MAP[base] || base;
}

function parseCSV(content) {
    const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
        return row;
    });
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// ── 1. Cargar precios de Netflix desde CSV ────────────────────────────────────
// key: "phone|platform|slot_identifier" → price_gs
// fallback key: "phone|platform"
const csvPriceMap = new Map();

const NETFLIX_CSV = resolve(__dirname, 'NETFLIX_clean.csv');
if (existsSync(NETFLIX_CSV)) {
    const rows = parseCSV(readFileSync(NETFLIX_CSV, 'utf-8'));
    let loaded = 0;
    for (const row of rows) {
        const pantalla = (row['Pantalla'] || '').trim();
        if (pantalla === 'PAGO CUENTA COMPLETA') continue;

        const phone = normalizePhone(row['Celular Cliente'] || '');
        const platform = normalizePlatformName(row['Plataforma'] || '');
        const price = parsePrice(row['Precio de Venta'] || '');
        if (!phone || !price) continue;

        // Normalizar slot igual que en la BD (Perfil X)
        const slotRaw = pantalla.split(' - ')[0].trim().replace(/^(perfil)\s+(\d+)$/i, (_, _p, n) => `Perfil ${n}`);

        const key1 = `${phone}|${platform}|${slotRaw}`;
        const key2 = `${phone}|${platform}`;
        if (!csvPriceMap.has(key1)) { csvPriceMap.set(key1, price); loaded++; }
        if (!csvPriceMap.has(key2) || csvPriceMap.get(key2) < price) csvPriceMap.set(key2, price);
    }
    console.log(`📂 NETFLIX_clean.csv: ${loaded} registros de precio cargados`);
}

// ── 2. Obtener ventas activas sin precio ──────────────────────────────────────
console.log('\n🔍 Consultando ventas activas sin precio...');

const allSales = [];
let offset = 0;
const PAGE = 1000;
while (true) {
    const { data, error } = await supabase
        .from('sales')
        .select('id, amount_gs, customer_id, slot_id')
        .eq('is_active', true)
        .or('amount_gs.is.null,amount_gs.eq.0')
        .range(offset, offset + PAGE - 1);
    if (error) { console.error('Error BD:', error.message); process.exit(1); }
    if (!data || !data.length) break;
    allSales.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
}

console.log(`→ Total ventas activas sin precio: ${allSales.length}\n`);
if (!allSales.length) { console.log('✅ No hay ventas sin precio. Todo correcto.'); process.exit(0); }

// ── 3. Cargar customers y slots ───────────────────────────────────────────────
const custIds = [...new Set(allSales.map(s => s.customer_id).filter(Boolean))];
const custMap = new Map();
for (const ids of chunk(custIds, 200)) {
    const { data } = await supabase.from('customers').select('id, phone').in('id', ids);
    (data || []).forEach(c => custMap.set(c.id, c));
}

const slotIds = [...new Set(allSales.map(s => s.slot_id).filter(Boolean))];
const slotMap = new Map();
for (const ids of chunk(slotIds, 200)) {
    const { data } = await supabase
        .from('sale_slots')
        .select('id, slot_identifier, mother_account:mother_accounts(id, platform)')
        .in('id', ids);
    (data || []).forEach(s => slotMap.set(s.id, s));
}

// ── 4. Determinar precio para cada venta ─────────────────────────────────────
const updates = [];
const stats = { csvMatched: 0, modalApplied: 0, noPrice: 0 };
const noMatch = {};

for (const sale of allSales) {
    const cust     = custMap.get(sale.customer_id);
    const slot     = slotMap.get(sale.slot_id);
    const phone    = normalizePhone(cust?.phone || '');
    const platform = slot?.mother_account?.platform || '';
    const slotId   = slot?.slot_identifier || '';

    let price = 0;
    let source = '';

    // a) Intentar precio exacto del CSV (Netflix)
    const key1 = `${phone}|${platform}|${slotId}`;
    const key2 = `${phone}|${platform}`;
    const csvPrice = csvPriceMap.get(key1) ?? csvPriceMap.get(key2) ?? 0;
    if (csvPrice > 0) {
        price = csvPrice;
        source = 'csv';
        stats.csvMatched++;
    }

    // b) Precio modal de la plataforma
    if (!price && MODAL_PRICES[platform]) {
        price = MODAL_PRICES[platform];
        source = 'modal';
        stats.modalApplied++;
    }

    if (!price) {
        stats.noPrice++;
        noMatch[platform] = (noMatch[platform] || 0) + 1;
        continue;
    }

    updates.push({ id: sale.id, price, source, phone, platform, slotId });
}

// ── 5. Mostrar resumen previo ─────────────────────────────────────────────────
console.log(`📊 Resumen de precios a aplicar:`);
console.log(`  ✅ Desde CSV (exacto):       ${stats.csvMatched}`);
console.log(`  📐 Precio modal plataforma:  ${stats.modalApplied}`);
console.log(`  ❌ Sin precio posible:        ${stats.noPrice}`);

if (DRY_RUN) {
    // Distribución por plataforma + precio
    const byPlatform = {};
    for (const u of updates) {
        const key = `${u.platform}`;
        if (!byPlatform[key]) byPlatform[key] = { csv: 0, modal: 0, prices: {} };
        byPlatform[key][u.source === 'csv' ? 'csv' : 'modal']++;
        byPlatform[key].prices[u.price] = (byPlatform[key].prices[u.price] || 0) + 1;
    }

    console.log('\n── Por plataforma ────────────────────────────────────');
    for (const [p, d] of Object.entries(byPlatform)) {
        const priceStr = Object.entries(d.prices).sort((a,b)=>b[1]-a[1]).slice(0,3)
            .map(([price, count]) => `Gs.${parseInt(price).toLocaleString()} (${count}x)`).join(', ');
        const src = d.csv > 0 ? `CSV:${d.csv}` : '';
        const mod = d.modal > 0 ? `Modal:${d.modal}` : '';
        console.log(`  ${p}: ${[src, mod].filter(Boolean).join(' | ')} → ${priceStr}`);
    }

    if (Object.keys(noMatch).length > 0) {
        console.log('\n── Sin precio posible (plataforma sin datos): ─────');
        Object.entries(noMatch).forEach(([p, c]) => console.log(`  ${p || 'desconocida'}: ${c}`));
    }

    console.log(`\n💡 Total a actualizar: ${updates.length} ventas`);
    console.log('   Quitá --dry-run para aplicar los cambios.\n');
    process.exit(0);
}

// ── 6. Aplicar updates ────────────────────────────────────────────────────────
console.log(`\n💾 Aplicando ${updates.length} actualizaciones...`);
let done = 0, errors = 0;

for (const u of updates) {
    const { error } = await supabase
        .from('sales')
        .update({ amount_gs: u.price })
        .eq('id', u.id);

    if (error) {
        console.error(`  ❌ [${u.id}] ${error.message}`);
        errors++;
    } else {
        done++;
        if (done % 200 === 0) console.log(`  → ${done}/${updates.length}...`);
    }
}

console.log('\n════════════════════════════════════');
console.log('📋 RESUMEN FINAL');
console.log('════════════════════════════════════');
console.log(`✅ Ventas actualizadas:       ${done}`);
console.log(`  • Desde CSV (Netflix):     ${stats.csvMatched}`);
console.log(`  • Precio modal plataforma: ${stats.modalApplied}`);
console.log(`❌ Errores:                  ${errors}`);
console.log(`⏭️  Sin precio posible:        ${stats.noPrice}`);
if (Object.keys(noMatch).length > 0) {
    console.log('\nVentas sin precio (plataforma desconocida):');
    Object.entries(noMatch).forEach(([p, c]) => console.log(`  ${p || 'desconocida'}: ${c}`));
}
console.log('════════════════════════════════════\n');
