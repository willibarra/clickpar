import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const phone = '595986334676';
const { data: c } = await sb.from('customers').select('id,full_name,phone').eq('phone', phone).maybeSingle();
if (!c) { console.log('cliente no encontrado'); process.exit(0); }
console.log('Cliente:', JSON.stringify(c));

const { data: sales } = await sb.from('sales')
    .select('id, start_date, end_date, is_active, amount_gs, slot_id')
    .eq('customer_id', c.id);
console.log('Ventas:', JSON.stringify(sales, null, 2));

for (const s of sales || []) {
    const { data: slot } = await sb.from('sale_slots').select('id, slot_identifier, status, mother_account_id').eq('id', s.slot_id).maybeSingle();
    const { data: ma } = await sb.from('mother_accounts').select('platform, email, renewal_date').eq('id', slot?.mother_account_id).maybeSingle();
    console.log('Slot:', slot?.slot_identifier, '| Madre renewal_date:', ma?.renewal_date, '| Platform:', ma?.platform);
}
