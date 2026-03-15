/**
 * Verificación detallada de caso específico + resumen final de orphans
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

// ESTADO FINAL
const { count: totalSold } = await supabase.from('sale_slots').select('*', { count: 'exact', head: true }).eq('status', 'sold');
const { count: totalActive } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('is_active', true);

// Contar slots sold sin venta activa
const allSoldIds = [];
let from = 0;
while (true) {
    const { data } = await supabase.from('sale_slots').select('id').eq('status', 'sold').range(from, from + 999);
    if (!data?.length) break;
    allSoldIds.push(...data.map(s => s.id));
    if (data.length < 1000) break;
    from += 1000;
}

const activeSet = new Set();
for (let i = 0; i < allSoldIds.length; i += 500) {
    const { data } = await supabase.from('sales').select('slot_id').in('slot_id', allSoldIds.slice(i, i + 500)).eq('is_active', true);
    (data || []).forEach(s => activeSet.add(s.slot_id));
}

const orphans = allSoldIds.filter(id => !activeSet.has(id));
console.log(`\n📊 ESTADO FINAL:`);
console.log(`  Slots 'sold': ${totalSold}`);
console.log(`  Ventas activas: ${totalActive}`);
console.log(`  Slots sold SIN venta activa: ${orphans.length}`);

// Verificar cliente Karina
console.log('\n── Karina Núñez (595971886472) ──');
const { data: karina } = await supabase.from('customers').select('id, full_name, phone').eq('phone', '595971886472').single();
if (karina) {
    const { data: sales } = await supabase.from('sales').select('id, slot_id, is_active, end_date, amount_gs').eq('customer_id', karina.id).order('created_at', { ascending: false });
    console.log(`  Ventas (${sales?.length}):`);
    for (const s of sales || []) {
        const { data: slot } = await supabase.from('sale_slots').select('slot_identifier, status, mother_account:mother_accounts(email, platform)').eq('id', s.slot_id).single();
        console.log(`  [${s.is_active ? '🟢 ACTIVA' : '🔴 INACT.'}] ${s.end_date} Gs.${s.amount_gs} → ${slot?.slot_identifier} @ ${slot?.mother_account?.email} (slot status: ${slot?.status})`);
    }

    // Si no tiene ventas activas pero el slot está sold, reactivar
    const hasActive = sales?.some(s => s.is_active);
    if (!hasActive && !dryRun) {
        // Buscar la venta más reciente para reactivar
        const bestSale = sales?.sort((a,b) => new Date(b.end_date) - new Date(a.end_date))?.[0];
        if (bestSale) {
            await supabase.from('sales').update({ is_active: true }).eq('id', bestSale.id);
            console.log(`  ✅ Reactivada venta ${bestSale.id} (${bestSale.end_date})`);
        }
    } else if (!hasActive) {
        const bestSale = sales?.sort((a,b) => new Date(b.end_date) - new Date(a.end_date))?.[0];
        if (bestSale) console.log(`  [DRY] Reactivaría venta ${bestSale.id} (${bestSale.end_date})`);
    }
}

// Verificar sales1@nyckz.com
console.log('\n── sales1@nyckz.com ──');
const { data: ma } = await supabase.from('mother_accounts').select('id').eq('email', 'sales1@nyckz.com').single();
if (ma) {
    const { data: slots } = await supabase.from('sale_slots').select('id, slot_identifier, pin_code, status').eq('mother_account_id', ma.id);
    for (const slot of slots || []) {
        const { data: sales } = await supabase.from('sales').select('id, is_active, end_date, customer_id').eq('slot_id', slot.id).order('created_at', { ascending: false });
        const active = sales?.filter(s => s.is_active) || [];
        const custId = active[0]?.customer_id || sales?.[0]?.customer_id;
        let custName = '?';
        if (custId) {
            const { data: c } = await supabase.from('customers').select('full_name, phone').eq('id', custId).single();
            custName = `${c?.full_name} (${c?.phone})`;
        }
        const icon = active.length > 0 ? '✅' : '❌';
        console.log(`  ${icon} ${slot.slot_identifier} | ${active.length > 0 ? `${active[0].end_date}` : 'sin venta activa'} | ${custName}`);
    }
}

// Muestra de orphans restantes (top 10)
if (orphans.length > 0) {
    console.log(`\n── Muestra de slots aún huérfanos (top 10) ──`);
    const sample = orphans.slice(0, 10);
    const { data: sampleSlots } = await supabase.from('sale_slots')
        .select('id, slot_identifier, mother_account:mother_accounts(email, platform)')
        .in('id', sample);
    for (const s of sampleSlots || []) {
        // buscar última venta
        const { data: lastSale } = await supabase.from('sales').select('id, is_active, end_date, customer_id').eq('slot_id', s.id).order('created_at', { ascending: false }).limit(1).single();
        let custName = '?';
        if (lastSale?.customer_id) {
            const { data: c } = await supabase.from('customers').select('full_name, phone').eq('id', lastSale.customer_id).single();
            custName = `${c?.full_name} (${c?.phone})`;
        }
        console.log(`  ${s.mother_account?.platform} | ${s.mother_account?.email} → ${s.slot_identifier}`);
        console.log(`    Última venta: ${lastSale ? `${lastSale.end_date} is_active=${lastSale.is_active} → ${custName}` : 'ninguna'}`);
    }
}
