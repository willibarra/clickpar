import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Buscar cliente por teléfono (con y sin 595)
const { data: custs } = await supabase
  .from('customers')
  .select('id, full_name, phone, email')
  .or('phone.eq.595975295598,phone.eq.0975295598,phone.like.%975295598%');

console.log('Clientes encontrados:', JSON.stringify(custs, null, 2));

if (!custs || custs.length === 0) {
  console.log('No se encontró cliente con ese número');
  process.exit(0);
}

for (const cust of custs) {
  console.log(`\n=== ${cust.full_name} (${cust.phone}) ===`);
  
  // Todas las ventas (activas e inactivas)
  const { data: sales } = await supabase
    .from('sales')
    .select('id, amount_gs, start_date, end_date, is_active, slot_id')
    .eq('customer_id', cust.id)
    .order('created_at', { ascending: false });

  if (!sales || sales.length === 0) {
    console.log('  Sin ventas registradas');
    continue;
  }

  const slotIds = sales.map(s => s.slot_id).filter(Boolean);
  const { data: slots } = await supabase
    .from('sale_slots')
    .select('id, slot_identifier, mother_account:mother_accounts(platform, email)')
    .in('id', slotIds);
  const slotMap = new Map((slots||[]).map(s=>[s.id, s]));

  for (const sale of sales) {
    const slot = slotMap.get(sale.slot_id);
    const platform = slot?.mother_account?.platform || '???';
    const slotId = slot?.slot_identifier || '???';
    const status = sale.is_active ? '✅ ACTIVA' : '❌ inactiva';
    console.log(`  ${status} | ${platform} / ${slotId} | ${sale.start_date} → ${sale.end_date} | Gs.${(sale.amount_gs||0).toLocaleString()}`);
  }
}
