import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const today = new Date().toISOString().split('T')[0];

const { data: activeSales } = await sb.from('sales').select('id, customer_id, slot_id, amount_gs, start_date, end_date, is_active').eq('is_active', true);
const slotIds = [...new Set(activeSales.filter(s => s.slot_id).map(s => s.slot_id))];
const existingSlots = new Map();
for (let i = 0; i < slotIds.length; i += 100) {
    const { data: slots } = await sb.from('sale_slots').select('id, mother_account_id, slot_identifier').in('id', slotIds.slice(i, i + 100));
    (slots || []).forEach(s => existingSlots.set(s.id, s));
}

const motherIds = [...new Set([...existingSlots.values()].map(s => s.mother_account_id))];
const existingMothers = new Map();
for (let i = 0; i < motherIds.length; i += 100) {
    const { data: mothers } = await sb.from('mother_accounts').select('id, platform, email, deleted_at, status').in('id', motherIds.slice(i, i + 100));
    (mothers || []).forEach(m => existingMothers.set(m.id, m));
}

const customerIds = [...new Set(activeSales.map(s => s.customer_id))];
const customers = new Map();
for (let i = 0; i < customerIds.length; i += 100) {
    const { data: custs } = await sb.from('customers').select('id, full_name, phone').in('id', customerIds.slice(i, i + 100));
    (custs || []).forEach(c => customers.set(c.id, c));
}

const orphans = [];
for (const sale of activeSales) {
    if (!sale.slot_id) continue;
    const slot = existingSlots.get(sale.slot_id);
    if (!slot) continue;
    const mother = existingMothers.get(slot.mother_account_id);
    
    if (!mother || mother.deleted_at || mother.status === 'dead' || mother.status === 'expired') {
        orphans.push({ sale, platform: mother?.platform || '???', email: mother?.email || '???', reason: !mother ? 'Eliminada permanente' : mother.deleted_at ? 'En papelera' : `Status: ${mother.status}` });
    }
}

const activeOrphans = orphans.filter(o => !o.sale.end_date || o.sale.end_date >= today);

console.log(`\n🚨 HUÉRFANOS ACTIVOS (no vencidos): ${activeOrphans.length}`);
for (const o of activeOrphans) {
    const cust = customers.get(o.sale.customer_id);
    const custName = cust ? `${cust.full_name || 'Sin nombre'} (${cust.phone || 'sin tel'})` : `ID: ${o.sale.customer_id}`;
    console.log(`- ${custName} | ${o.platform} (${o.email}) | Motivo: ${o.reason} | Sale ID: ${o.sale.id}`);
}
