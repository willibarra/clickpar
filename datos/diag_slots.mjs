/**
 * Diagnóstico: slots 'sold' sin venta activa
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

const email = process.argv[2] || 'sales1@nyckz.com';
console.log(`\n🔍 Diagnóstico de slots para: ${email}\n`);

// Obtener la cuenta madre
const { data: mother } = await supabase
    .from('mother_accounts')
    .select('id, email, platform, max_slots, status')
    .eq('email', email)
    .single();

if (!mother) { console.error('❌ Cuenta no encontrada'); process.exit(1); }
console.log(`📂 Cuenta: ${mother.email} | ${mother.platform} | max_slots=${mother.max_slots} | status=${mother.status}`);

// Obtener todos los slots
const { data: slots } = await supabase
    .from('sale_slots')
    .select('id, slot_identifier, pin_code, status')
    .eq('mother_account_id', mother.id)
    .order('slot_identifier');

console.log(`\n📦 Slots encontrados: ${slots?.length || 0}`);

for (const slot of slots || []) {
    // Buscar venta activa para este slot
    const { data: sale } = await supabase
        .from('sales')
        .select(`
            id, amount_gs, end_date, is_active, is_canje,
            customer:customers(id, full_name, phone)
        `)
        .eq('slot_id', slot.id)
        .eq('is_active', true)
        .single();

    // Buscar CUALQUIER venta (activa o no)
    const { data: anySale } = await supabase
        .from('sales')
        .select('id, amount_gs, end_date, is_active')
        .eq('slot_id', slot.id)
        .order('created_at', { ascending: false })
        .limit(1);

    const status = slot.status;
    const hasSale = !!sale;
    const anyRecord = anySale?.[0];

    let icon = status === 'sold' && hasSale ? '✅' :
               status === 'sold' && !hasSale ? '🔴' :
               status === 'available' ? '🟢' : '⚪';

    console.log(`\n  ${icon} [${status.toUpperCase()}] ${slot.slot_identifier} (PIN: ${slot.pin_code || 'ninguno'})`);
    if (hasSale) {
        console.log(`        Cliente: ${sale.customer?.full_name || '?'} | Tel: ${sale.customer?.phone || '?'}`);
        console.log(`        Precio: Gs.${sale.amount_gs?.toLocaleString()} | Vence: ${sale.end_date} | Canje: ${sale.is_canje}`);
    } else if (anyRecord) {
        console.log(`        ⚠️  Tiene venta INACTIVA: id=${anyRecord.id} | is_active=${anyRecord.is_active} | vence=${anyRecord.end_date}`);
    } else {
        console.log(`        ❌ Sin venta en tabla sales (slot sold pero huérfano)`);
    }
}

console.log('\n════════════════════════════════════');
