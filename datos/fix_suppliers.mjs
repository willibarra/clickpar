/**
 * fix_suppliers.mjs
 * Lee todos los CSVs de importación, extrae email → proveedor,
 * compara con mother_accounts en la BD y propone/aplica las correcciones.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── CSV files to scan ──────────────────────────────────────────────────────────
const CSV_FILES = [
    'NETT1 - NETFLIX.csv',
    'net2 - NETFLIX.csv',
    'net3 - NETFLIX.csv',
    'net4 - NETFLIX.csv',
    'NETFLIX_clean.csv',
    'NCLEAN_NETT1.csv',
    'NCLEAN_net2.csv',
    'NCLEAN_net3.csv',
    'NCLEAN_net4.csv',
    'Disney+ - Disney+.csv',
    'Disney_clean.csv',
    'HBOMAX - HBOMAX.csv',
    'HBOMAX_clean.csv',
    'SPOTIFY  - SPOTIFY .csv',
    'SPOTIFY_clean.csv',
    'PRIME VIDEO - PRIME VIDEO.csv',
    'Crunchyroll - Crunchyroll.csv',
    'Paramount+ - Paramount+.csv',
    'YOUTUBE - YOUTUBE.csv',
    'VIX - VIX.csv',
    'FLUJOTV.csv',
];

/** Parse a simple CSV line respecting quoted fields */
function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
    }
    result.push(current.trim());
    return result;
}

/** Build a map: email (lowercase) → supplier_name (from CSVs) */
function buildEmailSupplierMap() {
    const map = new Map(); // email → supplier_name

    for (const file of CSV_FILES) {
        const filePath = join(__dirname, file);
        let content;
        try { content = readFileSync(filePath, 'utf8'); } catch { continue; }

        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length < 2) continue;

        // Find header row (skip any leading "FALSE" column)
        let headerLine = lines[0];
        // Some files start with " FALSE ," prefix
        if (headerLine.toUpperCase().includes('FALSE')) headerLine = lines[0];

        const headers = parseLine(headerLine).map(h => h.replace(/^\s*FALSE\s*$/, '').trim());

        // Locate columns
        const usuarioIdx = headers.findIndex(h => h.toLowerCase() === 'usuario');
        const proveedorIdx = headers.findIndex(h =>
            h.toLowerCase().includes('nombre proveedor') || h.toLowerCase() === 'proveedor'
        );
        const pantallaIdx = headers.findIndex(h => h.toLowerCase() === 'pantalla');

        if (usuarioIdx === -1 || proveedorIdx === -1) {
            console.warn(`[SKIP] ${file} - no se encontró columna usuario/proveedor`);
            continue;
        }

        let accountsFound = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = parseLine(lines[i]);
            // Skip non-account rows (PAGO CUENTA COMPLETA and similar are the mother headers)
            const pantalla = pantallaIdx !== -1 ? (cols[pantallaIdx] || '').trim() : '';
            if (pantalla.toUpperCase().includes('PAGO CUENTA') || pantalla === '') {
                const email = (cols[usuarioIdx] || '').trim().toLowerCase();
                const supplier = (cols[proveedorIdx] || '').trim();

                if (email && supplier && !supplier.match(/^[~\s]*$/)) {
                    if (!map.has(email)) {
                        map.set(email, supplier);
                        accountsFound++;
                    }
                    // If same email appears with different supplier, keep first non-empty
                }
            }
        }
        console.log(`  ✓ ${file}: ${accountsFound} cuentas madres procesadas`);
    }
    return map;
}

async function main() {
    const DRY_RUN = process.argv.includes('--dry-run');
    console.log(DRY_RUN ? '\n🔍 MODO DRY-RUN (solo verifica, no actualiza)\n' : '\n✏️  MODO UPDATE (aplicando cambios)\n');

    console.log('📂 Leyendo CSVs...');
    const emailSupplierMap = buildEmailSupplierMap();
    console.log(`\n📊 Total emails únicos encontrados en CSVs: ${emailSupplierMap.size}\n`);

    // Fetch all mother_accounts
    const { data: accounts, error } = await supabase
        .from('mother_accounts')
        .select('id, email, platform, supplier_name');

    if (error) { console.error('Error fetching accounts:', error); process.exit(1); }

    console.log(`🗄️  mother_accounts en BD: ${accounts.length}\n`);

    const toUpdate = [];
    const noMatch = [];

    for (const acct of accounts) {
        const emailKey = acct.email?.trim().toLowerCase();
        if (!emailKey) continue;

        const csvSupplier = emailSupplierMap.get(emailKey);
        if (!csvSupplier) {
            noMatch.push(acct);
            continue;
        }

        const currentSupplier = (acct.supplier_name || '').trim();
        if (currentSupplier === csvSupplier) continue; // ya correcto

        toUpdate.push({
            id: acct.id,
            email: acct.email,
            platform: acct.platform,
            oldSupplier: currentSupplier || '(vacío)',
            newSupplier: csvSupplier,
        });
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Ya correctos: ${accounts.length - toUpdate.length - noMatch.length}`);
    console.log(`⚠️  Sin coincidencia en CSV: ${noMatch.length}`);
    console.log(`🔄 Cuentas a corregir: ${toUpdate.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (toUpdate.length > 0) {
        console.log('📋 CAMBIOS DETECTADOS:');
        toUpdate.forEach(u => {
            console.log(`  ${u.platform.padEnd(25)} ${u.email.substring(0, 35).padEnd(37)} | "${u.oldSupplier}" → "${u.newSupplier}"`);
        });
        console.log('');
    }

    if (!DRY_RUN && toUpdate.length > 0) {
        console.log('💾 Aplicando cambios...');
        let updated = 0, failed = 0;
        for (const u of toUpdate) {
            const { error: upErr } = await supabase
                .from('mother_accounts')
                .update({ supplier_name: u.newSupplier })
                .eq('id', u.id);
            if (upErr) { console.error(`  ✗ ${u.email}: ${upErr.message}`); failed++; }
            else updated++;
        }
        console.log(`\n✅ Actualizadas: ${updated}  |  ✗ Fallidas: ${failed}`);
    }

    if (noMatch.length > 0 && process.argv.includes('--show-no-match')) {
        console.log('\n📭 SIN COINCIDENCIA EN CSV (no se modifican):');
        noMatch.forEach(a => console.log(`  ${a.platform?.padEnd(25)} ${a.email} | proveedor actual: "${a.supplier_name || '(vacío)'}"`));
    }
}

main().catch(console.error);
