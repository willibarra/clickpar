/**
 * Diagnóstico: comparar teléfonos de la BD vs los del CSV de Netflix
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

// Teléfonos de Netflix activos en BD (las 12 ventas sin precio)
const {data: netflixSales} = await supabase
  .from('sales')
  .select('id, amount_gs, customer_id, slot_id')
  .eq('is_active', true)
  .or('amount_gs.is.null,amount_gs.eq.0')
  .limit(2000);

const custIds = [...new Set((netflixSales||[]).map(s=>s.customer_id).filter(Boolean))];
const {data: custs} = await supabase.from('customers').select('id, phone, full_name').in('id', custIds);
const custMap = new Map((custs||[]).map(c=>[c.id, c]));

const slotIds = [...new Set((netflixSales||[]).map(s=>s.slot_id).filter(Boolean))];
const slotChunks = [];
for (let i=0;i<slotIds.length;i+=200) slotChunks.push(slotIds.slice(i,i+200));
const slotMap = new Map();
for (const ids of slotChunks) {
  const {data} = await supabase.from('sale_slots').select('id, slot_identifier, mother_account:mother_accounts(id, platform)').in('id', ids);
  (data||[]).forEach(s=>slotMap.set(s.id, s));
}

// Solo netflix
const netflixOnly = (netflixSales||[]).filter(s => {
  const slot = slotMap.get(s.slot_id);
  return slot?.mother_account?.platform === 'Netflix';
});

console.log(`Netflix ventas sin precio en BD: ${netflixOnly.length}`);
console.log('\nEjemplos (teléfono BD → slot):');
netflixOnly.slice(0,20).forEach(s => {
  const c = custMap.get(s.customer_id);
  const sl = slotMap.get(s.slot_id);
  console.log(`  phone="${c?.phone}" | slot="${sl?.slot_identifier}"`);
});

// Comparar con CSV
function parseCSV(content) {
  const lines = content.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  const headers = lines[0].split(',').map(h=>h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h,i) => { row[h] = (values[i]||'').trim(); });
    return row;
  });
}

const content = readFileSync(resolve(__dirname, 'NETFLIX_clean.csv'), 'utf-8');
const rows = parseCSV(content);

// Mostrar muestra de teléfonos del CSV
console.log('\n20 primeros teléfonos del CSV Netflix:');
rows.filter(r => r['Precio de Venta'] && r['Precio de Venta'] !== '0' && r['Pantalla'] !== 'PAGO CUENTA COMPLETA')
  .slice(0,20)
  .forEach(r => console.log(`  "${r['Celular Cliente']}" | "${r['Pantalla']}" | Gs.${r['Precio de Venta']}`));

// Ver si algún teléfono de BD matchea directamente
const csvPhones = new Set(rows.map(r => (r['Celular Cliente']||'').replace(/\D/g,'')));
let directMatch = 0;
netflixOnly.forEach(s => {
  const c = custMap.get(s.customer_id);
  const rawPhone = (c?.phone||'').replace(/\D/g,'');
  if (csvPhones.has(rawPhone)) directMatch++;
});
console.log(`\nMatches directos (phone sin normalizar): ${directMatch}/${netflixOnly.length}`);
