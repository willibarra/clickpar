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
const stripNumber = (name) => name.replace(/^\d+\.\s*/, '');

async function renumberAllSlots() {
    console.log('🔢 Renumerando todos los slots de todas las cuentas...\n');

    // Get all mother accounts
    const { data: accounts, error } = await supabase
        .from('mother_accounts')
        .select('id, email, platform');

    if (error) {
        console.error('❌ Error obteniendo cuentas:', error.message);
        process.exit(1);
    }

    console.log(`  📋 ${accounts.length} cuentas encontradas\n`);

    let totalUpdated = 0;

    for (const account of accounts) {
        const { data: slots, error: slotErr } = await supabase
            .from('sale_slots')
            .select('id, slot_identifier')
            .eq('mother_account_id', account.id)
            .order('id', { ascending: true });

        if (slotErr || !slots || slots.length === 0) continue;

        let updated = 0;
        for (let i = 0; i < slots.length; i++) {
            const baseName = stripNumber(slots[i].slot_identifier || `Perfil ${i + 1}`);
            const newName = `${i + 1}. ${baseName}`;
            if (newName !== slots[i].slot_identifier) {
                await supabase
                    .from('sale_slots')
                    .update({ slot_identifier: newName })
                    .eq('id', slots[i].id);
                updated++;
            }
        }

        if (updated > 0) {
            console.log(`  ✅ ${account.platform} | ${account.email} → ${updated}/${slots.length} slots renumerados`);
            totalUpdated += updated;
        }
    }

    console.log(`\n🏁 Completado. ${totalUpdated} slots actualizados en total.`);
}

renumberAllSlots();
