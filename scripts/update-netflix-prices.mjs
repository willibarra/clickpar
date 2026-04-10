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

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const NEW_PRICE = 30000;
const PLATFORM = 'Netflix';

const phones = [
  '5959753850',
  '595987263',
  '595981845187',
  '59584512',
  '595981501682',
  '595974946867',
  '595984921823',
  '595981629461',
  '595983688649',
  '595986583726',
  '595983202401',
  '595972820997',
  '5959761758',
  '5959148882',
  '595982384730',
  '595985810562',
  '595983119437',
  '5959365705',
  '595984056339',
  '595972243417',
  '595984532152',
  '595984231218',
  '595982989965',
  '595972713520',
  '595984979151',
  '595991725162',
  '595973330926',
  '595975925289',
  '595974473313',
  '595971498466',
  '595973735409',
  '595982600108',
  '595976224818',
  '595994405014',
  '595993288669',
  '34699181832',
  '595973379521',
  '595981240708',
  '595984460839',
  '595975175364',
  '595985120835',
  '595994511702',
  '595994297866',
  '595982846473',
  '595973852456',
  '595982885616',
  '33603731985',
  '595971719684',
  '595984142078',
  '595995355508',
  '595991599301',
  '595983729198',
  '595984005854',
  '595971868418',
  '595986127593',
  '595975866472',
  '595992069480',
  '595985642223',
  '595985807339',
  '595975323132',
  '595982286712',
  '595972464419',
  '595983797825',
  '595992757456',
  '595992275135',
  '595971759711',
  '595986412979',
  '595981475056',
  '595983388912',
  '34671799066',
  '595991500927',
  '595992798526',
  '595975845562',
  '595984899778',
  '595972953852',
  '595973503633',
  '595984376825',
  '595976433336',
  '595985923175',
  '595981443497',
  '595991593849',
  '595973701439',
  '34656379291',
  '595984765180',
  '595984262774',
  '595982156453',
  '595985449625',
  '595993568219',
  '595994294080',
  '595976187877',
  '595994114219',
  '595972577569',
  '595981179112',
  '595986439921',
  '595975849655',
  '595983932749',
];

console.log(`\n🔄 Actualizando precio Netflix a ${NEW_PRICE.toLocaleString()} Gs para ${phones.length} teléfonos...\n`);

// Step 1: Get all customers matching these phones
const { data: customers, error: custErr } = await supabase
  .from('customers')
  .select('id, full_name, phone')
  .in('phone', phones);

if (custErr) {
  console.error('❌ Error buscando clientes:', custErr.message);
  process.exit(1);
}

console.log(`📋 Clientes encontrados: ${customers.length} de ${phones.length} teléfonos\n`);

// Check which phones were NOT found
const foundPhones = new Set(customers.map(c => c.phone));
const notFound = phones.filter(p => !foundPhones.has(p));
if (notFound.length > 0) {
  console.log(`⚠️  Teléfonos NO encontrados (${notFound.length}):`);
  notFound.forEach(p => console.log(`   - ${p}`));
  console.log('');
}

const customerIds = customers.map(c => c.id);

if (customerIds.length === 0) {
  console.log('❌ No se encontraron clientes. Abortando.');
  process.exit(1);
}

// Step 2: Get ALL active sales for these customers, then filter Netflix client-side
// (nested filtering on joins can be tricky with Supabase)
const { data: allSales, error: salesErr } = await supabase
  .from('sales')
  .select('id, customer_id, amount_gs, slot_id')
  .in('customer_id', customerIds)
  .eq('is_active', true);

if (salesErr) {
  console.error('❌ Error buscando ventas:', salesErr.message);
  process.exit(1);
}

console.log(`📊 Total ventas activas para estos clientes: ${allSales.length}`);

// Step 3: Get slot IDs to check which are Netflix
const slotIds = [...new Set(allSales.map(s => s.slot_id).filter(Boolean))];

// Get mother account platform for each slot
const { data: slots, error: slotsErr } = await supabase
  .from('sale_slots')
  .select('id, mother_account_id, mother_account:mother_accounts(id, platform)')
  .in('id', slotIds);

if (slotsErr) {
  console.error('❌ Error buscando slots:', slotsErr.message);
  process.exit(1);
}

// Build a set of slot IDs that belong to Netflix
const netflixSlotIds = new Set(
  slots
    .filter(s => {
      const ma = s.mother_account;
      const platform = Array.isArray(ma) ? ma[0]?.platform : ma?.platform;
      return platform === PLATFORM;
    })
    .map(s => s.id)
);

// Filter sales to only Netflix
const netflixSales = allSales.filter(s => netflixSlotIds.has(s.slot_id));

console.log(`🎬 Ventas activas de Netflix encontradas: ${netflixSales.length}\n`);

if (netflixSales.length === 0) {
  console.log('⚠️  No se encontraron ventas activas de Netflix para estos clientes.');
  process.exit(0);
}

// Step 4: Show what will change
const customerMap = new Map(customers.map(c => [c.id, c]));
let alreadyCorrect = 0;
let toUpdate = [];

for (const sale of netflixSales) {
  const cust = customerMap.get(sale.customer_id);
  if (sale.amount_gs === NEW_PRICE) {
    alreadyCorrect++;
  } else {
    toUpdate.push(sale);
    console.log(`  📝 ${cust?.full_name} (${cust?.phone}): ${sale.amount_gs?.toLocaleString()} → ${NEW_PRICE.toLocaleString()} Gs`);
  }
}

console.log(`\n✅ Ya tienen precio correcto: ${alreadyCorrect}`);
console.log(`📝 Por actualizar: ${toUpdate.length}\n`);

if (toUpdate.length === 0) {
  console.log('🎉 Todos los clientes ya tienen el precio correcto!');
  process.exit(0);
}

// Step 5: Update the sales
const saleIdsToUpdate = toUpdate.map(s => s.id);

const { data: updated, error: updateErr } = await supabase
  .from('sales')
  .update({ amount_gs: NEW_PRICE })
  .in('id', saleIdsToUpdate)
  .select('id');

if (updateErr) {
  console.error('❌ Error actualizando precios:', updateErr.message);
  process.exit(1);
}

console.log(`🎉 ¡Listo! Se actualizaron ${updated.length} ventas a ${NEW_PRICE.toLocaleString()} Gs`);
