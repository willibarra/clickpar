/**
 * Verificación rápida de datos reales
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

// 1. Ver cuántas ventas activas hay en total
const { count: activeSales } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('is_active', true);
const { count: totalSales } = await supabase.from('sales').select('*', { count: 'exact', head: true });
const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
console.log(`Total ventas: ${totalSales} | Activas: ${activeSales}`);
console.log(`Total clientes: ${totalCustomers}`);

// 2. Muestra de venta activa
const { data: sampleSale } = await supabase.from('sales').select('id, customer_id, slot_id, amount_gs, end_date, is_active').eq('is_active', true).limit(1);
console.log('Muestra venta activa:', JSON.stringify(sampleSale?.[0]));

// 3. Ver si el cliente 595971886472 tiene ventas
const { data: cust } = await supabase.from('customers').select('id, full_name, phone').eq('phone', '595971886472').single();
console.log('\nCliente 595971886472:', JSON.stringify(cust));

if (cust) {
    const { data: custSales } = await supabase.from('sales').select('id, slot_id, is_active, end_date, amount_gs').eq('customer_id', cust.id).limit(5);
    console.log(`Ventas del cliente: ${custSales?.length || 0}`);
    custSales?.forEach(s => console.log(`  → ${s.slot_id} | is_active=${s.is_active} | vence=${s.end_date}`));
}

// 4. Ver cuántas ventas fueron creadas HOY (por el fix)
const today = '2026-03-13';
const { count: createdToday } = await supabase.from('sales').select('*', { count: 'exact', head: true }).gte('created_at', today);
console.log(`\nVentas creadas hoy (${today}): ${createdToday}`);

// 5. Sample de ventas con slot sold pero sin venta activa
const { data: soldSlots } = await supabase.from('sale_slots').select('id, slot_identifier, mother_account_id').eq('status', 'sold').limit(5);
console.log('\n5 slots sold:');
for (const sl of soldSlots || []) {
    const { data: sa } = await supabase.from('sales').select('id, is_active, customer_id').eq('slot_id', sl.id).limit(2);
    console.log(`  ${sl.slot_identifier}: ${sa?.length || 0} ventas → ${JSON.stringify(sa?.map(s=>({is_active:s.is_active, cust:s.customer_id?.slice(0,8)})))}`);
}
