/**
 * Desactiva todas las ventas activas cuyo slot_id no existe en sale_slots
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('⚠️  DRY-RUN — no se escribe en la BD\n');

// 1. Obtener todas las ventas activas con slot_id
const allActive = [];
let offset = 0;
while (true) {
  const { data } = await supabase
    .from('sales')
    .select('id, slot_id, customer_id, amount_gs, end_date')
    .eq('is_active', true)
    .not('slot_id', 'is', null)
    .range(offset, offset + 999);
  if (!data || !data.length) break;
  allActive.push(...data);
  if (data.length < 1000) break;
  offset += 1000;
}

// 2. Verificar qué slot_ids sí existen
const slotIds = [...new Set(allActive.map(s=>s.slot_id))];
const existingIds = new Set();
for (let i=0;i<slotIds.length;i+=200) {
  const {data} = await supabase.from('sale_slots').select('id').in('id', slotIds.slice(i,i+200));
  (data||[]).forEach(s=>existingIds.add(s.id));
}

// 3. Filtrar huérfanas
const orphanSales = allActive.filter(s => !existingIds.has(s.slot_id));

// Cargar nombres de clientes
const custIds = [...new Set(orphanSales.map(s=>s.customer_id).filter(Boolean))];
const custMap = new Map();
for (let i=0;i<custIds.length;i+=200) {
  const {data} = await supabase.from('customers').select('id, full_name, phone').in('id', custIds.slice(i,i+200));
  (data||[]).forEach(c=>custMap.set(c.id, c));
}

console.log(`🔍 Ventas activas con slot inexistente: ${orphanSales.length}`);
orphanSales.forEach(s => {
  const c = custMap.get(s.customer_id);
  console.log(`  • [${s.id.slice(0,8)}] ${c?.full_name||'?'} (${c?.phone||'?'}) | vence ${s.end_date} | Gs.${(s.amount_gs||0).toLocaleString()}`);
});

if (DRY_RUN || orphanSales.length === 0) {
  if (orphanSales.length === 0) console.log('✅ No hay ventas huérfanas');
  else console.log('\n💡 Quitá --dry-run para aplicar');
  process.exit(0);
}

// 4. Desactivar
console.log('\n💾 Desactivando...');
let done = 0, errors = 0;
for (const s of orphanSales) {
  const {error} = await supabase
    .from('sales')
    .update({ is_active: false })
    .eq('id', s.id);
  if (error) { console.error(`  ❌ ${s.id}: ${error.message}`); errors++; }
  else done++;
}

console.log(`\n✅ Desactivadas: ${done} | ❌ Errores: ${errors}`);
