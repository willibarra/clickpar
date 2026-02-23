import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env.local manually
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function clearAllData() {
    console.log('🗑️  Limpiando todos los datos de ClickPar...\n');

    // 1. Delete sales (depends on customers & sale_slots)
    const { count: salesCount, error: e1 } = await supabase
        .from('sales')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (e1) console.error('  ❌ Error en sales:', e1.message);
    else console.log(`  ✅ Sales eliminadas: ${salesCount}`);

    // 2. Delete expenses
    const { count: expCount, error: e2 } = await supabase
        .from('expenses')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (e2) console.error('  ❌ Error en expenses:', e2.message);
    else console.log(`  ✅ Expenses eliminados: ${expCount}`);

    // 3. Delete sale_slots (depends on mother_accounts)
    const { count: slotsCount, error: e3 } = await supabase
        .from('sale_slots')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (e3) console.error('  ❌ Error en sale_slots:', e3.message);
    else console.log(`  ✅ Sale slots eliminados: ${slotsCount}`);

    // 4. Delete mother_accounts
    const { count: maCount, error: e4 } = await supabase
        .from('mother_accounts')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (e4) console.error('  ❌ Error en mother_accounts:', e4.message);
    else console.log(`  ✅ Mother accounts eliminadas: ${maCount}`);

    // 5. Delete customers
    const { count: custCount, error: e5 } = await supabase
        .from('customers')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (e5) console.error('  ❌ Error en customers:', e5.message);
    else console.log(`  ✅ Customers eliminados: ${custCount}`);

    console.log('\n🏁 Limpieza completada. Plataformas, bundles y perfiles se mantienen intactos.');
}

clearAllData();
