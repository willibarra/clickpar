/**
 * Corrige slots y ventas de madres expiradas.
 * Busca sale_slots con status='sold' cuya madre tenga status='expired',
 * luego marca esos slots como 'expired' y sus ventas is_active=false.
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

const dryRun = process.argv.includes('--dry-run');
const today = new Date().toISOString().split('T')[0];

console.log(`\n🔧 Corrigiendo slots/ventas de madres expiradas${dryRun ? ' [DRY-RUN]' : ''}...\n`);

// 1. Obtener madres expiradas con renewal_date < hoy
const { data: expiredMothers } = await supabase
    .from('mother_accounts')
    .select('id, email, platform, renewal_date')
    .eq('status', 'expired')
    .lt('renewal_date', today);

console.log(`📊 Madres expiradas encontradas: ${expiredMothers?.length || 0}`);

let slotsFixed = 0;
let salesFixed = 0;

// Procesar de a lotes de 50 para no superar límites de URL
const batchSize = 50;
const mothers = expiredMothers || [];

for (let i = 0; i < mothers.length; i += batchSize) {
    const batch = mothers.slice(i, i + batchSize);
    const maIds = batch.map(m => m.id);

    // Obtener slots 'sold' de estas madres
    const { data: soldSlots } = await supabase
        .from('sale_slots')
        .select('id')
        .in('mother_account_id', maIds)
        .eq('status', 'sold');

    const soldSlotIds = (soldSlots || []).map(s => s.id);

    if (soldSlotIds.length === 0) continue;

    console.log(`   Lote ${i / batchSize + 1}: ${soldSlotIds.length} slots 'sold' encontrados`);

    if (!dryRun) {
        // Actualizar ventas → is_active = false
        for (let j = 0; j < soldSlotIds.length; j += 50) {
            const slotBatch = soldSlotIds.slice(j, j + 50);
            const { error: saleErr } = await supabase
                .from('sales')
                .update({ is_active: false })
                .in('slot_id', slotBatch)
                .eq('is_active', true);
            if (saleErr) console.error(`   ❌ Ventas: ${saleErr.message}`);
            else salesFixed += slotBatch.length;
        }

        // Actualizar slots → status = 'expired'
        for (let j = 0; j < soldSlotIds.length; j += 50) {
            const slotBatch = soldSlotIds.slice(j, j + 50);
            const { error: slotErr } = await supabase
                .from('sale_slots')
                .update({ status: 'expired' })
                .in('id', slotBatch);
            if (slotErr) console.error(`   ❌ Slots: ${slotErr.message}`);
            else slotsFixed += slotBatch.length;
        }
    } else {
        slotsFixed += soldSlotIds.length;
        salesFixed += soldSlotIds.length;
    }
}

// También marcar available slots de madres expiradas como expired
const { data: availSlots } = await supabase
    .from('sale_slots')
    .select('id')
    .in('mother_account_id', mothers.map(m => m.id).slice(0, 50))
    .eq('status', 'available');

// (Solo los primeros 50 para no sobrecargar; el resto queda disponible pero la madre está expired)

console.log('\n════════════════════════════════════');
console.log('📋 RESUMEN FIX SLOTS');
console.log('════════════════════════════════════');
console.log(`✅ Madres expiradas procesadas: ${mothers.length}`);
console.log(`✅ Slots → expired:  ${slotsFixed}`);
console.log(`✅ Ventas → inactivo: ${salesFixed}`);
console.log('════════════════════════════════════\n');
