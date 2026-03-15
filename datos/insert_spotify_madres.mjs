/**
 * Insertar 10 Cuentas Madres de Spotify
 * Plataforma:   Spotify
 * Proveedor:    StreamShop
 * Costo USDT:   4.5
 * Costo Gs:     29.250 (4.5 × 6.500)
 * Venta slot:   30.000 Gs
 * Contraseña:   Skillet95*
 * Fecha:        2026-03-13
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Leer .env.local
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => {
            const idx = l.indexOf('=');
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
);

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ No se encontraron SUPABASE_URL o SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Datos de las 10 cuentas ───────────────────────────────────────────────────
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

const COMMON = {
    platform:            'Spotify',
    password:            'Skillet95*',
    purchase_cost_usdt:  4.5,
    purchase_cost_gs:    29250,   // 4.5 × 6.500
    sale_price_gs:       30000,
    supplier_name:       'StreamShop',
    supplier_phone:      null,
    max_slots:           5,
    status:              'active',
    renewal_date:        '2026-04-13',  // ~30 días desde hoy
    created_at:          '2026-03-13T00:00:00.000Z',
};

// ── Verificar plataforma ──────────────────────────────────────────────────────
async function getPlatformName() {
    const { data: platforms } = await supabase.from('platforms').select('id, name');
    const found = (platforms || []).find(p =>
        p.name.toLowerCase().includes('spotify')
    );
    if (found) {
        console.log(`✅ Plataforma encontrada: "${found.name}"`);
        return found.name;
    }
    console.log('⚠️  Plataforma Spotify no encontrada, se usará "Spotify" como texto');
    return 'Spotify';
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    try {
        const platformName = await getPlatformName();

        console.log('\n📦 Insertando 10 cuentas madres de Spotify...\n');

        let ok = 0, errors = 0;

        for (const email of EMAILS) {
            // Verificar que no existe ya
            const { data: existing } = await supabase
                .from('mother_accounts')
                .select('id')
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                console.log(`⚠️  Ya existe: ${email} — omitida`);
                continue;
            }

            const payload = {
                ...COMMON,
                platform: platformName,
                email,
            };

            const { data, error } = await supabase
                .from('mother_accounts')
                .insert(payload)
                .select('id')
                .single();

            if (error) {
                console.error(`❌ ${email}: ${error.message}`);
                errors++;
            } else {
                console.log(`✅ ${email}  →  id: ${data.id}`);
                ok++;
            }
        }

        console.log('\n════════════════════════════════════');
        console.log(`✅ Insertadas:  ${ok}`);
        console.log(`❌ Errores:     ${errors}`);
        console.log('════════════════════════════════════\n');

    } catch (err) {
        console.error('❌ Error fatal:', err.message);
        process.exit(1);
    }
})();
