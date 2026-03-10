/**
 * Corrige el status de cuentas madre y sus ventas activas
 * para cuentas cuya renewal_date ya pasó pero siguen como 'active'
 * Uso: node datos/fix_expired.mjs [--dry-run]
 * O para una lista de emails: node datos/fix_expired.mjs --emails="a@b.com,c@d.com"
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
const dryRun = args.includes('--dry-run');
const emailsArg = args.find(a => a.startsWith('--emails='))?.replace('--emails=', '');

const emails = emailsArg ? emailsArg.split(',').map(e => e.trim()) : null;

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
console.log(`\n🔍 Corrigiendo cuentas vencidas (hoy: ${today})${dryRun ? ' [DRY-RUN]' : ''}...\n`);

// 1. Buscar mother_accounts que tienen renewal_date < hoy y status != 'expired'
let query = supabase
    .from('mother_accounts')
    .select('id, email, platform, status, renewal_date')
    .lt('renewal_date', today)
    .eq('status', 'active');

if (emails) {
    query = query.in('email', emails);
}

const { data: toFix, error: fetchErr } = await query;

if (fetchErr) {
    console.error('❌ Error consultando BD:', fetchErr.message);
    process.exit(1);
}

console.log(`📋 Cuentas madre a corregir: ${toFix?.length || 0}`);

if (!toFix || toFix.length === 0) {
    console.log('✅ Nada que corregir.\n');
    process.exit(0);
}

let mothersFixed = 0, slotsFixed = 0, salesFixed = 0;

for (const ma of toFix) {
    console.log(`   → ${ma.email} (${ma.platform}) | vencía: ${ma.renewal_date} | status actual: ${ma.status}`);

    if (!dryRun) {
        // Marcar madre como expired
        const { error: maErr } = await supabase
            .from('mother_accounts')
            .update({ status: 'expired' })
            .eq('id', ma.id);

        if (maErr) {
            console.error(`     ❌ Error actualizando madre: ${maErr.message}`);
            continue;
        }
        mothersFixed++;

        // Obtener todos los slots de esta madre
        const { data: slots } = await supabase
            .from('sale_slots')
            .select('id, status')
            .eq('mother_account_id', ma.id);

        const slotIds = (slots || []).map(s => s.id);

        if (slotIds.length > 0) {
            // Marcar slots vendidos como expired
            const { error: slotsErr } = await supabase
                .from('sale_slots')
                .update({ status: 'expired' })
                .in('id', slotIds)
                .eq('status', 'sold');

            if (!slotsErr) {
                slotsFixed += slotIds.length;
            }

            // Marcar ventas activas como inactivas
            const { error: salesErr } = await supabase
                .from('sales')
                .update({ is_active: false })
                .in('slot_id', slotIds)
                .eq('is_active', true);

            if (!salesErr) {
                salesFixed++;
            }
        }
    } else {
        mothersFixed++;
    }
}

console.log('\n════════════════════════════════════');
console.log('📋 RESUMEN');
console.log('════════════════════════════════════');
console.log(`✅ Madres corregidas: ${mothersFixed}`);
console.log(`✅ Slots → expired:  ${slotsFixed}`);
console.log(`✅ Ventas → inactivo: ${salesFixed}`);
console.log('════════════════════════════════════\n');
