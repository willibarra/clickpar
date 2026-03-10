/**
 * Limpia todas las cuentas madre de una plataforma específica (y sus slots/ventas)
 * Uso: node datos/clean_platform.mjs --platform="Spotify"
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]; })
);
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const args = process.argv.slice(2);
const platArg = args.find(a => a.startsWith('--platform='))?.replace('--platform=', '');

if (!platArg) {
    console.error('❌ Uso: node datos/clean_platform.mjs --platform="Spotify"');
    process.exit(1);
}

console.log(`\n🧹 Limpiando plataforma: "${platArg}"...`);

const { data: mothers } = await supabase
    .from('mother_accounts')
    .select('id, email, platform')
    .ilike('platform', `%${platArg}%`);

const ids = (mothers || []).map(m => m.id);
console.log(`   Encontradas ${ids.length} cuentas madre de "${platArg}"`);

if (ids.length === 0) {
    console.log('   ⚠️ Nada que limpiar.');
    process.exit(0);
}

// Obtener slots
const { data: slots } = await supabase.from('sale_slots').select('id').in('mother_account_id', ids);
const slotIds = (slots || []).map(s => s.id);
console.log(`   Slots a eliminar: ${slotIds.length}`);

if (slotIds.length > 0) {
    // Eliminar ventas
    const { error: salesErr } = await supabase.from('sales').delete().in('slot_id', slotIds);
    if (salesErr) console.error(`   ❌ Error borrando ventas: ${salesErr.message}`);
    else console.log(`   ✅ Ventas eliminadas`);

    // Eliminar slots
    const { error: slotsErr } = await supabase.from('sale_slots').delete().in('mother_account_id', ids);
    if (slotsErr) console.error(`   ❌ Error borrando slots: ${slotsErr.message}`);
    else console.log(`   ✅ Slots eliminados`);
}

// Eliminar madres
const { error: maErr } = await supabase.from('mother_accounts').delete().in('id', ids);
if (maErr) console.error(`   ❌ Error borrando madres: ${maErr.message}`);
else console.log(`   ✅ ${ids.length} cuentas madre eliminadas`);

console.log(`\n✅ Limpieza de "${platArg}" completada\n`);
