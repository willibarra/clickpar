import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Obtener los slot_ids huérfanos de Belén González
const custId = 'e7052cfb-2f98-49fe-bc7e-f3f155111f38';
const { data: sales } = await supabase
  .from('sales')
  .select('id, slot_id, amount_gs, start_date, end_date, is_active')
  .eq('customer_id', custId);

// Verificar cuáles slot_ids NO existen en la tabla sale_slots
const slotIds = [...new Set((sales||[]).map(s=>s.slot_id).filter(Boolean))];
const { data: existingSlots } = await supabase
  .from('sale_slots')
  .select('id, slot_identifier, mother_account:mother_accounts(platform, email, status)')
  .in('id', slotIds);

const existingIds = new Set((existingSlots||[]).map(s=>s.id));
const orphanSlotIds = slotIds.filter(id => !existingIds.has(id));

console.log(`\nSlot IDs huérfanos: ${orphanSlotIds.length}`);
orphanSlotIds.forEach(id => {
  const sale = (sales||[]).find(s=>s.slot_id===id);
  console.log(`  slot_id: ${id} | venta: ${sale?.id} | ${sale?.start_date}→${sale?.end_date} | activa:${sale?.is_active}`);
});

// 2. Buscar en audit_log esos slot_ids
console.log('\n🔍 Buscando en audit_log...');
for (const slotId of orphanSlotIds) {
  const { data: logs } = await supabase
    .from('audit_log')
    .select('*')
    .or(`record_id.eq.${slotId},details.ilike.%${slotId}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (logs && logs.length > 0) {
    console.log(`\n  --- Logs para slot ${slotId} ---`);
    logs.forEach(l => console.log(`    [${l.action}] ${l.created_at} ${JSON.stringify(l.details||{}).slice(0,200)}`));
  } else {
    console.log(`\n  slot ${slotId}: sin logs en audit_log`);
  }
}

// 3. Backup: buscar en expenses o whatsapp_send_log por sale_id
const orphanSaleIds = (sales||[]).filter(s=>orphanSlotIds.includes(s.slot_id)).map(s=>s.id);
console.log('\n🔍 Buscando en expenses o historial por sale_id...');
const { data: expenses } = await supabase
  .from('expenses')
  .select('*')
  .in('sale_id', orphanSaleIds.slice(0,10))
  .limit(20);
if (expenses && expenses.length > 0) {
  expenses.forEach(e => console.log(`  expense: ${e.description} | ${e.amount_gs}Gs`));
}

// 4. Ver si hay tabla de slots borrados o historial
const { data: tables } = await supabase.rpc('get_table_names').catch(()=>({data:null}));
if (tables) console.log('\nTablas disponibles:', tables);
