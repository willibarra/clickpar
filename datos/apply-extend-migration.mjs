import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = '/Applications/ClickPar';
const env = Object.fromEntries(
    readFileSync(resolve(ROOT, '.env.local'), 'utf-8').split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

console.log('Verificando si extend_sale_atomic existe...');

const { error: checkErr } = await supabase.rpc('extend_sale_atomic', {
    p_sale_id: '00000000-0000-0000-0000-000000000000',
    p_extra_days: 1,
    p_amount_gs: 0,
});

if (checkErr?.code !== 'PGRST202') {
    console.log('✅ La función extend_sale_atomic ya existe!');
    console.log('Código de error:', checkErr?.code, '— (P0001 = function exists, data not found is expected)');
    process.exit(0);
}

console.log('❌ Función no existe (PGRST202)');
console.log('\nNecesitás ejecutar el siguiente SQL en el SQL Editor de Supabase:');
console.log('\n--- COPIAR DESDE AQUÍ ---');
console.log(readFileSync(resolve(ROOT, 'supabase/migrations/20260322_extend_sale.sql'), 'utf-8'));
console.log('--- HASTA AQUÍ ---');
