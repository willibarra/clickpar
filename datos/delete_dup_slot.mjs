/**
 * Elimina el Perfil 1 duplicado (sin PIN, venta inactiva) de sales1@nyckz.com
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

// El slot duplicado: Perfil 1 SIN pin_code, con venta inactiva id=bb10757f
const SALE_ID = 'bb10757f-9473-4ad0-b512-4ba0bcad94d9';

// Obtener el slot_id de esa venta
const { data: sale } = await supabase
    .from('sales')
    .select('id, slot_id, is_active, end_date')
    .eq('id', SALE_ID)
    .single();

if (!sale) { console.error('❌ Venta no encontrada'); process.exit(1); }
console.log(`\n🎯 Venta encontrada: slot_id=${sale.slot_id} | is_active=${sale.is_active} | vence=${sale.end_date}`);

// Verificar el slot
const { data: slot } = await supabase
    .from('sale_slots')
    .select('id, slot_identifier, pin_code, status')
    .eq('id', sale.slot_id)
    .single();

console.log(`📦 Slot: ${slot?.slot_identifier} | PIN=${slot?.pin_code || 'ninguno'} | status=${slot?.status}`);

if (slot?.pin_code) {
    console.error('❌ STOP: Este slot tiene PIN, no es el correcto para eliminar');
    process.exit(1);
}

// 1. Eliminar la venta
const { error: saleErr } = await supabase.from('sales').delete().eq('id', SALE_ID);
if (saleErr) { console.error('❌ Error borrando venta:', saleErr.message); process.exit(1); }
console.log('✅ Venta eliminada');

// 2. Eliminar el slot
const { error: slotErr } = await supabase.from('sale_slots').delete().eq('id', sale.slot_id);
if (slotErr) { console.error('❌ Error borrando slot:', slotErr.message); process.exit(1); }
console.log('✅ Slot eliminado');

// 3. Actualizar max_slots de la madre a 5
const { data: slotData } = await supabase.from('sale_slots').select('mother_account_id').eq('id', sale.slot_id);
// Ya fue borrado, buscar la madre por email
const { error: maErr } = await supabase
    .from('mother_accounts')
    .update({ max_slots: 5 })
    .eq('email', 'sales1@nyckz.com');
if (maErr) console.error('⚠️ Max slots no actualizado:', maErr.message);
else console.log('✅ max_slots actualizado a 5');

console.log('\n✅ Perfil 1 duplicado eliminado. La cuenta ahora tiene 5 slots.\n');
