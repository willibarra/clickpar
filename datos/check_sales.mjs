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

// Probar join directo como lo hace el action
const { data, error } = await supabase.from('sales')
    .select(`
        id, amount_gs, end_date,
        customer:customers(id, full_name, phone),
        slot:sale_slots(
            id, slot_identifier, status,
            mother_account:mother_accounts(id, platform, email)
        )
    `)
    .eq('is_active', true)
    .gte('end_date', '2026-03-03')
    .lte('end_date', '2026-03-25')
    .limit(3);

if (error) {
    console.error('ERROR:', error.message, error.details, error.hint);
} else {
    console.log('Resultados:', data?.length);
    console.log(JSON.stringify(data?.[0], null, 2));
}


const { count: total } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('is_active', true);
console.log('Total ventas activas:', total);

const { count: nullCount } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('is_active', true).is('end_date', null);
console.log('Con end_date NULL:', nullCount);

const { data: minRow } = await supabase.from('sales').select('end_date').eq('is_active', true).not('end_date', 'is', null).order('end_date', { ascending: true }).limit(1);
const { data: maxRow } = await supabase.from('sales').select('end_date').eq('is_active', true).not('end_date', 'is', null).order('end_date', { ascending: false }).limit(1);
console.log('end_date mínimo:', minRow?.[0]?.end_date);
console.log('end_date máximo:', maxRow?.[0]?.end_date);

const { count: inWindow } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('end_date', '2026-03-03').lte('end_date', '2026-03-25');
console.log('En ventana 3-25 mar:', inWindow);

// Muestra de ventas en la ventana
const { data: sample } = await supabase.from('sales').select('id, end_date, customer_id, slot_id').eq('is_active', true).not('end_date', 'is', null).gte('end_date', '2026-03-03').lte('end_date', '2026-03-25').limit(5);
console.log('Muestra:', JSON.stringify(sample, null, 2));
