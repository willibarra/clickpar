/**
 * _diag_existing_prices.mjs
 * Ver qué precios existen por plataforma en ventas activas que SÍ tienen precio
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

// Ventas activas que SÍ tienen precio
const { data: sales } = await supabase
  .from('sales')
  .select('id, amount_gs, slot_id')
  .eq('is_active', true)
  .gt('amount_gs', 0)
  .limit(5000);

const slotIds = [...new Set((sales||[]).map(s=>s.slot_id).filter(Boolean))];
const slotMap = new Map();
for (let i=0;i<slotIds.length;i+=200) {
  const {data} = await supabase.from('sale_slots').select('id, mother_account:mother_accounts(id, platform)').in('id', slotIds.slice(i,i+200));
  (data||[]).forEach(s=>slotMap.set(s.id, s));
}

// Agrupar precios por plataforma
const byPlatform = {};
for (const sale of (sales||[])) {
  const slot = slotMap.get(sale.slot_id);
  const platform = slot?.mother_account?.platform || 'Unknown';
  if (!byPlatform[platform]) byPlatform[platform] = [];
  byPlatform[platform].push(sale.amount_gs);
}

// Calcular moda y distribución de cada plataforma
for (const [platform, prices] of Object.entries(byPlatform)) {
  const freq = {};
  prices.forEach(p => { freq[p] = (freq[p]||0)+1; });
  const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  const moda = sorted[0];
  const avg = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
  console.log(`\n${platform} (${prices.length} ventas con precio):`);
  console.log(`  Moda: Gs. ${parseInt(moda[0]).toLocaleString()} (${moda[1]} veces) | Promedio: Gs. ${avg.toLocaleString()}`);
  sorted.slice(0,8).forEach(([p,c]) => console.log(`    Gs. ${parseInt(p).toLocaleString()}: ${c}x`));
}
