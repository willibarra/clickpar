/**
 * Fix puntual: reactivar la venta inactiva del Perfil 3 de sales1@nyckz.com
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

// Obtener la madre sales1@nyckz.com
const { data: ma } = await supabase.from('mother_accounts').select('id').eq('email', 'sales1@nyckz.com').single();

// Obtener el slot Perfil 3
const { data: slot3 } = await supabase.from('sale_slots')
    .select('id, slot_identifier')
    .eq('mother_account_id', ma.id)
    .eq('slot_identifier', 'Perfil 3')
    .single();

console.log(`Slot Perfil 3: ${slot3?.id}`);

// Obtener la última venta (inactiva) de Perfil 3
const { data: lastSales } = await supabase.from('sales')
    .select('id, customer_id, is_active, end_date, amount_gs')
    .eq('slot_id', slot3.id)
    .order('created_at', { ascending: false })
    .limit(3);

console.log('Ventas de Perfil 3:');
lastSales?.forEach(s => console.log(`  ${s.id} | is_active=${s.is_active} | vence=${s.end_date} | Gs.${s.amount_gs}`));

// Reactivar la más reciente
const bestSale = lastSales?.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))?.[0];
if (bestSale && !bestSale.is_active) {
    const { error } = await supabase.from('sales').update({ is_active: true }).eq('id', bestSale.id);
    if (error) console.error('❌', error.message);
    else {
        console.log(`✅ Perfil 3 reactivado → vence ${bestSale.end_date}`);
        // También verificar el cliente
        const { data: c } = await supabase.from('customers').select('full_name, phone').eq('id', bestSale.customer_id).single();
        console.log(`   Cliente: ${c?.full_name} (${c?.phone})`);
    }
} else if (bestSale?.is_active) {
    console.log('✅ Ya estaba activa');
} else {
    console.log('⚠️ No hay venta para reactivar');
}
