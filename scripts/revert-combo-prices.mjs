import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
const envPath = resolve(import.meta.dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) return;
  const key = trimmed.substring(0, eqIdx);
  const val = trimmed.substring(eqIdx + 1);
  envVars[key] = val;
});

const supabase = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const phones = [
  '5959753850','595987263','595981845187','59584512','595981501682','595974946867',
  '595984921823','595981629461','595983688649','595986583726','595983202401','595972820997',
  '5959761758','5959148882','595982384730','595985810562','595983119437','5959365705',
  '595984056339','595972243417','595984532152','595984231218','595982989965','595972713520',
  '595984979151','595991725162','595973330926','595975925289','595974473313','595971498466',
  '595973735409','595982600108','595976224818','595994405014','595993288669','34699181832',
  '595973379521','595981240708','595984460839','595975175364','595985120835','595994511702',
  '595994297866','595982846473','595973852456','595982885616','33603731985','595971719684',
  '595984142078','595995355508','595991599301','595983729198','595984005854','595971868418',
  '595986127593','595975866472','595992069480','595985642223','595985807339','595975323132',
  '595982286712','595972464419','595983797825','595992757456','595992275135','595971759711',
  '595986412979','595981475056','595983388912','34671799066','595991500927','595992798526',
  '595975845562','595984899778','595972953852','595973503633','595984376825','595976433336',
  '595985923175','595981443497','595991593849','595973701439','34656379291','595984765180',
  '595984262774','595982156453','595985449625','595993568219','595994294080','595976187877',
  '595994114219','595972577569','595981179112','595986439921','595975849655','595983932749',
];

// Step 1: Get customers
const { data: customers } = await supabase
  .from('customers')
  .select('id, full_name, phone')
  .in('phone', phones);

const customerIds = customers.map(c => c.id);
const customerMap = new Map(customers.map(c => [c.id, c]));

// Step 2: Find active sales with bundle_id that are now 30000
const { data: comboSales, error } = await supabase
  .from('sales')
  .select('id, customer_id, amount_gs, bundle_id, original_price_gs, override_price')
  .in('customer_id', customerIds)
  .eq('is_active', true)
  .eq('amount_gs', 30000)
  .not('bundle_id', 'is', null);

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log(`\n🔍 Ventas combo (con bundle_id) que ahora tienen 30,000 Gs: ${comboSales.length}\n`);

if (comboSales.length === 0) {
  console.log('✅ No hay combos afectados. Todo bien!');
  process.exit(0);
}

for (const sale of comboSales) {
  const cust = customerMap.get(sale.customer_id);
  console.log(`  🔗 ${cust?.full_name} (${cust?.phone}) - bundle_id: ${sale.bundle_id}, original_price_gs: ${sale.original_price_gs}, override: ${sale.override_price}`);
}

// Step 3: Revert using original_price_gs if available
const toRevert = comboSales.filter(s => s.original_price_gs && s.original_price_gs !== 30000);
const noOriginal = comboSales.filter(s => !s.original_price_gs);

if (toRevert.length > 0) {
  console.log(`\n📝 Revirtiendo ${toRevert.length} combos a su precio original...\n`);
  
  for (const sale of toRevert) {
    const cust = customerMap.get(sale.customer_id);
    const { error: upErr } = await supabase
      .from('sales')
      .update({ amount_gs: sale.original_price_gs })
      .eq('id', sale.id);
    
    if (upErr) {
      console.log(`  ❌ Error revirtiendo ${cust?.full_name}: ${upErr.message}`);
    } else {
      console.log(`  ✅ ${cust?.full_name} (${cust?.phone}): 30,000 → ${sale.original_price_gs?.toLocaleString()} Gs (revertido)`);
    }
  }
}

if (noOriginal.length > 0) {
  console.log(`\n⚠️  ${noOriginal.length} combos SIN original_price_gs - necesitan revisión manual:`);
  for (const sale of noOriginal) {
    const cust = customerMap.get(sale.customer_id);
    console.log(`  ⚠️  ID: ${sale.id} - ${cust?.full_name} (${cust?.phone}) - bundle_id: ${sale.bundle_id}`);
  }
}

console.log('\n🎉 Proceso de reversión completado.');
