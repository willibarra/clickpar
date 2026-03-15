/**
 * Fix de duplicados: un slot con 2+ ventas activas → mantener solo la más reciente
 * Uso: node datos/fix_duplicates.mjs [--dry-run]
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

const dryRun = process.argv.includes('--dry-run');
console.log(`\n🔧 Fix Duplicados [${dryRun ? 'DRY-RUN' : 'APLICANDO'}]\n`);

// 1. Obtener todos los slots con más de 1 venta activa
// Buscar slot_ids que aparecen más de una vez en ventas activas
let allActiveSales = [];
let from = 0;
while (true) {
    const { data } = await supabase
        .from('sales')
        .select('id, slot_id, customer_id, end_date, created_at, amount_gs')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(from, from + 999);
    if (!data?.length) break;
    allActiveSales = allActiveSales.concat(data);
    if (data.length < 1000) break;
    from += 1000;
}
console.log(`Total ventas activas: ${allActiveSales.length}`);

// Agrupar por slot_id
const bySlot = {};
for (const sale of allActiveSales) {
    if (!bySlot[sale.slot_id]) bySlot[sale.slot_id] = [];
    bySlot[sale.slot_id].push(sale);
}

// Detectar slots con 2+ ventas activas
const dupSlots = Object.entries(bySlot).filter(([, sales]) => sales.length > 1);
console.log(`Slots con 2+ ventas activas: ${dupSlots.length}\n`);

if (dupSlots.length === 0) {
    console.log('✅ No hay duplicados de slot. Verificando duplicados por cliente+madre...\n');
}

// TAMBIÉN detectar: mismo cliente con 2+ ventas en distintos slots de la MISMA madre
// Para eso necesitamos slot → mother_account
const dupSlotIds = dupSlots.map(([id]) => id);
// Obtener info de todos los slots involucrados
const affectedSlotIds = [...new Set(allActiveSales.map(s => s.slot_id))];
let slotInfoMap = {};
for (let i = 0; i < affectedSlotIds.length; i += 500) {
    const batch = affectedSlotIds.slice(i, i + 500);
    const { data: slots } = await supabase
        .from('sale_slots')
        .select('id, slot_identifier, mother_account_id')
        .in('id', batch);
    (slots || []).forEach(s => slotInfoMap[s.id] = s);
}

// Agrupar por customer_id + mother_account_id
const byCustomerMother = {};
for (const sale of allActiveSales) {
    const slotInfo = slotInfoMap[sale.slot_id];
    if (!slotInfo) continue;
    const key = `${sale.customer_id}::${slotInfo.mother_account_id}`;
    if (!byCustomerMother[key]) byCustomerMother[key] = [];
    byCustomerMother[key].push({ ...sale, slot_identifier: slotInfo.slot_identifier });
}

const dupCustomerMother = Object.entries(byCustomerMother).filter(([, sales]) => sales.length > 1);
console.log(`Clientes con 2+ ventas en la misma cuenta madre: ${dupCustomerMother.length}`);

// Obtener info de clientes y madres para el reporte
const allCustIds = [...new Set(dupCustomerMother.flatMap(([key]) => [key.split('::')[0]]))].slice(0, 200);
const allMaIds   = [...new Set(dupCustomerMother.flatMap(([key]) => [key.split('::')[1]]))].slice(0, 200);

const { data: custRows } = await supabase.from('customers').select('id, full_name, phone').in('id', allCustIds);
const { data: maRows }   = await supabase.from('mother_accounts').select('id, email, platform').in('id', allMaIds);
const custMap = Object.fromEntries((custRows || []).map(c => [c.id, c]));
const maMap   = Object.fromEntries((maRows   || []).map(m => [m.id, m]));

let deactivated = 0;

console.log('\n── Duplicados por SLOT (mismo slot, 2+ ventas activas) ──');
for (const [slotId, sales] of dupSlots) {
    const slot = slotInfoMap[slotId];
    // Mantener la más reciente (primera, ya que ordenamos DESC por created_at)
    const [keep, ...toDeactivate] = sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const cust = custMap[keep.customer_id] || {};
    console.log(`\n  Slot ${slot?.slot_identifier || slotId}:`);
    console.log(`    MANTENER: venta ${keep.id} | cliente=${cust.full_name || keep.customer_id} | vence=${keep.end_date}`);
    for (const d of toDeactivate) {
        const c2 = custMap[d.customer_id] || {};
        console.log(`    DESACT.:  venta ${d.id} | cliente=${c2.full_name || d.customer_id} | vence=${d.end_date}`);
        if (!dryRun) {
            const { error } = await supabase.from('sales').update({ is_active: false }).eq('id', d.id);
            if (error) console.log(`    ❌ ${error.message}`);
            else deactivated++;
        } else deactivated++;
    }
}

console.log('\n── Duplicados por CLIENTE+MADRE (2+ slots distintos en misma madre) ──');
for (const [key, sales] of dupCustomerMother) {
    const [custId, maId] = key.split('::');
    const cust = custMap[custId] || { full_name: custId, phone: '?' };
    const ma   = maMap[maId]   || { email: maId, platform: '?' };
    // Mantener la venta con end_date más lejana (la renovación más reciente)
    const sorted = [...sales].sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
    const [keep, ...toDeactivate] = sorted;
    console.log(`\n  ${cust.full_name} (${cust.phone}) en ${ma.platform} (${ma.email}):`);
    console.log(`    MANTENER: ${keep.slot_identifier} | vence=${keep.end_date} | Gs.${keep.amount_gs}`);
    for (const d of toDeactivate) {
        console.log(`    DESACT.:  ${d.slot_identifier} | vence=${d.end_date} | Gs.${d.amount_gs}`);
        if (!dryRun) {
            const { error } = await supabase.from('sales').update({ is_active: false }).eq('id', d.id);
            if (error) console.log(`    ❌ ${error.message}`);
            else {
                // Liberar el slot sobrante
                await supabase.from('sale_slots').update({ status: 'available' }).eq('id', d.slot_id);
                deactivated++;
            }
        } else deactivated++;
    }
}

console.log('\n════════════════════════════════════════');
console.log(`📋 RESUMEN`);
console.log(`════════════════════════════════════════`);
console.log(`Duplicados por slot:             ${dupSlots.length}`);
console.log(`Duplicados cliente+madre:        ${dupCustomerMother.length}`);
console.log(`Ventas ${dryRun ? 'a desactivar' : 'desactivadas'}: ${deactivated}`);
console.log('════════════════════════════════════════\n');
if (dryRun && deactivated > 0) console.log('💡 Para aplicar: node datos/fix_duplicates.mjs\n');
