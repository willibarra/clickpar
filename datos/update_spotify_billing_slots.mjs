/**
 * Actualizar las 10 cuentas madres de Spotify:
 * - target_billing_day = 13
 * - Crear 5 slots (Slot 1 .. Slot 5) si no existen
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
        .map(l => {
            const idx = l.indexOf('=');
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
);

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const EMAILS = [
    'nicolas.romero.spt@picpart.xyz',
    'valentina.rios.spt@picnet.xyz',
    'fernando.zapata.spt@panelstream.xyz',
    'mariana.duarte.spt@clickyop.xyz',
    'gabriela.morales.spt@picpart.xyz',
    'ricardo.ayala.spt@picnet.xyz',
    'tatiana.ortega.spt@panelstream.xyz',
    'alejandro.cuevas.spt@clickyop.xyz',
    'paula.villalba.spt@picpart.xyz',
    'sebastian.acosta.spt@panelstream.xyz',
];

const SLOT_NAMES = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5'];

(async () => {
    let updatedAccounts = 0, slotErrors = 0, totalSlots = 0;

    for (const email of EMAILS) {
        // Buscar la cuenta madre
        const { data: account, error: findErr } = await supabase
            .from('mother_accounts')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (findErr || !account) {
            console.error(`❌ No encontrada: ${email}`);
            continue;
        }

        // 1️⃣  Actualizar target_billing_day = 13
        const { error: updateErr } = await supabase
            .from('mother_accounts')
            .update({ target_billing_day: 13 })
            .eq('id', account.id);

        if (updateErr) {
            console.error(`❌ Error actualizando billing day de ${email}: ${updateErr.message}`);
        } else {
            updatedAccounts++;
        }

        // 2️⃣  Crear los 5 slots (solo los que no existan)
        const { data: existingSlots } = await supabase
            .from('sale_slots')
            .select('slot_identifier')
            .eq('mother_account_id', account.id);

        const existingNames = new Set((existingSlots || []).map(s => s.slot_identifier));

        const slotsToInsert = SLOT_NAMES
            .filter(name => !existingNames.has(name))
            .map(name => ({
                mother_account_id: account.id,
                slot_identifier: name,
                pin_code: null,
                status: 'available',
            }));

        if (slotsToInsert.length > 0) {
            const { error: slotsErr } = await supabase
                .from('sale_slots')
                .insert(slotsToInsert);

            if (slotsErr) {
                console.error(`   ⚠️ Error creando slots de ${email}: ${slotsErr.message}`);
                slotErrors++;
            } else {
                totalSlots += slotsToInsert.length;
                console.log(`✅ ${email}  →  día fact=13, +${slotsToInsert.length} slots creados`);
            }
        } else {
            console.log(`✅ ${email}  →  día fact=13, slots ya existían`);
        }
    }

    console.log('\n════════════════════════════════════');
    console.log(`✅ Cuentas actualizadas:  ${updatedAccounts}`);
    console.log(`🎰 Slots creados:         ${totalSlots}`);
    console.log(`❌ Errores slots:         ${slotErrors}`);
    console.log('════════════════════════════════════\n');
})();
