/**
 * Diagnóstico: 
 * 1. Clientes con 2+ slots en la MISMA cuenta madre
 * 2. Slots still 'sold' sin venta activa después del fix anterior
 * Uso: node datos/diag_duplicates.mjs [phone]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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

const targetPhone = process.argv[2] || '595971886472';
const normalizePhone = p => p ? String(p).replace(/\D/g,'').replace(/^0+/,'') : null;
const normTarget = normalizePhone(targetPhone).replace(/^595/, '');

console.log(`\n══════════════════════════════════════════════`);
console.log(`🔍 DETALLE CLIENTE: ${targetPhone}`);
console.log(`══════════════════════════════════════════════`);

// Buscar cliente
const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, phone')
    .or(`phone.eq.${targetPhone},phone.eq.595${normTarget},phone.eq.0${normTarget}`);

if (!customers?.length) {
    // Intentar búsqueda parcial
    const { data: partials } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .like('phone', `%${normTarget}`);
    console.log(`⚠️  No encontrado exacto. Parciales: ${partials?.map(c => `${c.full_name}(${c.phone})`).join(', ') || 'ninguno'}`);
} else {
    for (const cust of customers) {
        console.log(`👤 ${cust.full_name} | tel: ${cust.phone}`);

        // Sus ventas activas
        const { data: sales } = await supabase
            .from('sales')
            .select(`
                id, amount_gs, end_date, is_active,
                slot:sale_slots(
                    id, slot_identifier, pin_code, status,
                    mother:mother_accounts(id, email, platform)
                )
            `)
            .eq('customer_id', cust.id)
            .eq('is_active', true)
            .order('end_date');

        console.log(`   Ventas activas: ${sales?.length || 0}`);

        // Detectar duplicados por madre
        const byMother = {};
        for (const s of sales || []) {
            const maId = s.slot?.mother?.id;
            if (!maId) continue;
            if (!byMother[maId]) byMother[maId] = { madre: s.slot.mother, sales: [] };
            byMother[maId].sales.push(s);
        }

        for (const [maId, { madre, sales: mSales }] of Object.entries(byMother)) {
            if (mSales.length > 1) {
                console.log(`\n   🔴 DUPLICADO en ${madre.platform} (${madre.email}):`);
                mSales.forEach(s => {
                    console.log(`      Slot: ${s.slot?.slot_identifier} | PIN: ${s.slot?.pin_code || '-'} | vence: ${s.end_date} | precio: Gs.${s.amount_gs}`);
                });
            } else {
                console.log(`   ✅ ${madre.platform} (${madre.email}) → ${mSales[0].slot?.slot_identifier} | vence: ${mSales[0].end_date}`);
            }
        }
    }
}

// ══════════════════════════════════════════════
// SECCIÓN 2: TODOS los duplicados en la BD
// ══════════════════════════════════════════════
console.log(`\n\n══════════════════════════════════════════════`);
console.log(`🔍 TODOS LOS CLIENTES CON 2+ SLOTS EN MISMA MADRE`);
console.log(`══════════════════════════════════════════════`);

// Obtener ventas activas con info de slot y madre
let allSales = [];
let from = 0;
while (true) {
    const { data } = await supabase
        .from('sales')
        .select('id, customer_id, amount_gs, end_date, slot_id, slot:sale_slots(id, slot_identifier, mother_account_id)')
        .eq('is_active', true)
        .range(from, from + 999);
    if (!data?.length) break;
    allSales = allSales.concat(data);
    if (data.length < 1000) break;
    from += 1000;
}

console.log(`Total ventas activas analizadas: ${allSales.length}`);

// Agrupar por customer_id + mother_account_id
const groups = {};
for (const sale of allSales) {
    const maId = sale.slot?.mother_account_id;
    if (!maId) continue;
    const key = `${sale.customer_id}::${maId}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(sale);
}

const duplicates = Object.entries(groups).filter(([, sales]) => sales.length > 1);
console.log(`Grupos con 2+ slots en misma madre: ${duplicates.length}\n`);

// Obtener los customer_ids únicos involucrados para resolver nombres
const dupCustomerIds = [...new Set(duplicates.map(([key]) => key.split('::')[0]))].slice(0, 100);
const { data: custData } = await supabase
    .from('customers')
    .select('id, full_name, phone')
    .in('id', dupCustomerIds);
const custMap = Object.fromEntries((custData || []).map(c => [c.id, c]));

// Obtener mother_account info
const dupMaIds = [...new Set(duplicates.map(([key]) => key.split('::')[1]))].slice(0, 100);
const { data: maData } = await supabase
    .from('mother_accounts')
    .select('id, email, platform')
    .in('id', dupMaIds);
const maMap = Object.fromEntries((maData || []).map(m => [m.id, m]));

let totalDupSales = 0;
for (const [key, sales] of duplicates) {
    const [custId, maId] = key.split('::');
    const cust = custMap[custId];
    const ma = maMap[maId];
    totalDupSales += sales.length - 1; // extras
    console.log(`🔴 ${cust?.full_name || custId} (${cust?.phone || '?'})`);
    console.log(`   Madre: ${ma?.platform || '?'} | ${ma?.email || maId}`);
    sales.forEach(s => {
        console.log(`   → slot: ${s.slot?.slot_identifier || s.slot_id} | vence: ${s.end_date} | Gs.${s.amount_gs}`);
    });
    console.log('');
}

// ══════════════════════════════════════════════
// SECCIÓN 3: Slots SOLD todavía sin venta activa
// ══════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════`);
console.log(`🔍 SLOTS 'SOLD' QUE SIGUEN SIN VENTA ACTIVA`);
console.log(`══════════════════════════════════════════════`);

// Contar slots sold vs activos rápido
const { count: totalSold } = await supabase
    .from('sale_slots').select('*', { count: 'exact', head: true }).eq('status', 'sold');

// Obtener slot_ids con venta activa
const allSoldSlotIds = [];
let sFrom = 0;
while (true) {
    const { data } = await supabase.from('sale_slots').select('id').eq('status', 'sold').range(sFrom, sFrom + 999);
    if (!data?.length) break;
    allSoldSlotIds.push(...data.map(s => s.id));
    if (data.length < 1000) break;
    sFrom += 1000;
}

const activeSlotIds = new Set();
for (let i = 0; i < allSoldSlotIds.length; i += 500) {
    const batch = allSoldSlotIds.slice(i, i + 500);
    const { data } = await supabase.from('sales').select('slot_id').in('slot_id', batch).eq('is_active', true);
    (data || []).forEach(s => activeSlotIds.add(s.slot_id));
}

const stillOrphans = allSoldSlotIds.filter(id => !activeSlotIds.has(id));
console.log(`Total sold: ${totalSold} | Con venta activa: ${activeSlotIds.size} | Sin venta activa: ${stillOrphans.length}`);
console.log(`\n📋 RESUMEN FINAL`);
console.log(`   Duplicados (cliente con 2+ slots en misma madre): ${duplicates.length} casos`);
console.log(`   Ventas duplicadas a revisar: ${totalDupSales}`);
console.log(`   Slots still sin nombre: ${stillOrphans.length}`);
