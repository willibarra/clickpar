/**
 * Netflix: 3 operaciones de mantenimiento
 * 1. Actualizar sale_price_gs = 30000 en todas las cuentas madre Netflix
 * 2. Listar madres con cantidad de slots ≠ 5
 * 3. Actualizar billing_day = día de renewal_date en cuentas Netflix
 *
 * Uso: node datos/update_netflix.mjs [--dry-run]
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
console.log(`\n🎬 Netflix Maintenance Script${dryRun ? ' [DRY-RUN]' : ''}\n`);

// ──────────────────────────────────────────────────────────
// 1. ACTUALIZAR PRECIO DE VENTA A 30,000
// ──────────────────────────────────────────────────────────
console.log('════════════════════════════════════');
console.log('1️⃣  ACTUALIZAR PRECIO DE VENTA → 30,000 Gs');
console.log('════════════════════════════════════');

const { data: netflixAccounts, error: fetchErr } = await supabase
    .from('mother_accounts')
    .select('id, email, platform, sale_price_gs')
    .ilike('platform', '%netflix%');

if (fetchErr) {
    console.error('❌ Error obteniendo cuentas Netflix:', fetchErr.message);
} else {
    console.log(`📊 Cuentas Netflix encontradas: ${netflixAccounts?.length || 0}`);

    const toUpdate = netflixAccounts?.filter(a => a.sale_price_gs !== 30000) || [];
    console.log(`   → Con precio distinto a 30,000: ${toUpdate.length}`);

    if (!dryRun && toUpdate.length > 0) {
        const ids = toUpdate.map(a => a.id);
        const batchSize = 100;
        let updated = 0;
        for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { error: updErr } = await supabase
                .from('mother_accounts')
                .update({ sale_price_gs: 30000 })
                .in('id', batch);
            if (updErr) console.error(`   ❌ Batch ${i / batchSize + 1}: ${updErr.message}`);
            else updated += batch.length;
        }
        console.log(`✅ Precio actualizado a 30,000 en ${updated} cuentas\n`);
    } else if (dryRun) {
        console.log(`✅ [DRY-RUN] Se actualizarían: ${toUpdate.length} cuentas\n`);
    } else {
        console.log('✅ Todas las cuentas ya tienen precio 30,000\n');
    }
}

// ──────────────────────────────────────────────────────────
// 2. LISTAR CUENTAS CON MÁS O MENOS DE 5 SLOTS
// ──────────────────────────────────────────────────────────
console.log('════════════════════════════════════');
console.log('2️⃣  CUENTAS CON ≠ 5 SLOTS');
console.log('════════════════════════════════════');

const { data: allNetflix } = await supabase
    .from('mother_accounts')
    .select('id, email, platform, max_slots')
    .ilike('platform', '%netflix%')
    .order('email');

const notFive = (allNetflix || []).filter(a => a.max_slots !== 5);
const moreThan5 = notFive.filter(a => a.max_slots > 5);
const lessThan5 = notFive.filter(a => a.max_slots < 5);

console.log(`📊 Total cuentas Netflix: ${allNetflix?.length || 0}`);
console.log(`   → Con exactamente 5 slots: ${(allNetflix?.length || 0) - notFive.length}`);
console.log(`   → Con MÁS de 5 slots: ${moreThan5.length}`);
console.log(`   → Con MENOS de 5 slots: ${lessThan5.length}\n`);

if (moreThan5.length > 0) {
    console.log('🔴 MÁS DE 5 SLOTS:');
    console.log('─'.repeat(60));
    moreThan5.forEach(a => {
        console.log(`  [${a.max_slots} slots] ${a.email.padEnd(45)} | ${a.platform}`);
    });
    console.log('');
}

if (lessThan5.length > 0) {
    console.log('🟡 MENOS DE 5 SLOTS:');
    console.log('─'.repeat(60));
    lessThan5.forEach(a => {
        console.log(`  [${a.max_slots} slots] ${a.email.padEnd(45)} | ${a.platform}`);
    });
    console.log('');
}

if (notFive.length === 0) {
    console.log('✅ Todas las cuentas Netflix tienen exactamente 5 slots\n');
}

// ──────────────────────────────────────────────────────────
// 3. ACTUALIZAR billing_day = DÍA DE renewal_date (Fat Day)
// ──────────────────────────────────────────────────────────
console.log('════════════════════════════════════');
console.log('3️⃣  AJUSTAR BILLING DAY = DÍA DE RENEWAL DATE');
console.log('════════════════════════════════════');

const { data: netflixWithDates, error: dateErr } = await supabase
    .from('mother_accounts')
    .select('id, email, platform, renewal_date, target_billing_day')
    .ilike('platform', '%netflix%')
    .not('renewal_date', 'is', null);

if (dateErr) {
    console.error('❌ Error obteniendo fechas:', dateErr.message);
} else {
    console.log(`📊 Cuentas Netflix con renewal_date: ${netflixWithDates?.length || 0}`);

    const toFixBilling = (netflixWithDates || []).filter(a => {
        const day = new Date(a.renewal_date + 'T00:00:00').getUTCDate();
        return a.target_billing_day !== day;
    });

    console.log(`   → Con target_billing_day incorrecto: ${toFixBilling.length}`);

    if (!dryRun && toFixBilling.length > 0) {
        let fixedCount = 0;
        for (const acct of toFixBilling) {
            const correctDay = new Date(acct.renewal_date + 'T00:00:00').getUTCDate();
            const { error: fixErr } = await supabase
                .from('mother_accounts')
                .update({ target_billing_day: correctDay })
                .eq('id', acct.id);
            if (fixErr) {
                console.error(`   ❌ ${acct.email}: ${fixErr.message}`);
            } else {
                fixedCount++;
                if (acct.target_billing_day !== null && acct.target_billing_day !== correctDay) {
                    console.log(`   📅 ${acct.email}: target_billing_day ${acct.target_billing_day} → ${correctDay} (renewal: ${acct.renewal_date})`);
                }
            }
        }
        console.log(`✅ target_billing_day corregido en ${fixedCount} cuentas\n`);
    } else if (dryRun) {
        toFixBilling.forEach(a => {
            const day = new Date(a.renewal_date + 'T00:00:00').getUTCDate();
            console.log(`   [DRY-RUN] ${a.email}: target_billing_day ${a.target_billing_day} → ${day} (renewal: ${a.renewal_date})`);
        });
        console.log(`✅ [DRY-RUN] Se actualizarían ${toFixBilling.length} cuentas\n`);
    } else {
        console.log('✅ Todos los target_billing_day ya coinciden con el día de renewal_date\n');
    }
}

console.log('════════════════════════════════════');
console.log('✅ Script completado');
console.log('════════════════════════════════════\n');
