/**
 * _diag_orphans.mjs
 * Encuentra todos los slots/cuentas huérfanas:
 * 1. Slots con status='sold' pero SIN venta activa asociada
 * 2. Slots con status='sold' pero la venta asociada está inactiva (is_active=false)
 * 3. Cuentas madre sin ningún slot
 * 4. Ventas activas apuntando a un slot que no existe
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── 1. Slots con status='sold' ─────────────────────────────────────────────
console.log('🔍 Cargando todos los slots sold...');
const { data: soldSlots } = await supabase
  .from('sale_slots')
  .select('id, slot_identifier, status, mother_account_id, mother_account:mother_accounts(id, platform, email, status)')
  .eq('status', 'sold');

const soldSlotIds = (soldSlots||[]).map(s => s.id);
console.log(`  → ${soldSlotIds.length} slots con status=sold`);

// ─── 2. Ventas activas para esos slots ───────────────────────────────────────
console.log('🔍 Buscando ventas activas para esos slots...');
const activeSaleSlotIds = new Set();
for (const ids of chunk(soldSlotIds, 200)) {
  const { data } = await supabase
    .from('sales')
    .select('slot_id')
    .eq('is_active', true)
    .in('slot_id', ids);
  (data||[]).forEach(s => activeSaleSlotIds.add(s.slot_id));
}

// ─── 3. Slots sold SIN venta activa = HUÉRFANOS ─────────────────────────────
const orphanSlots = (soldSlots||[]).filter(s => !activeSaleSlotIds.has(s.id));

console.log(`\n════════════════════════════════════════════════════`);
console.log(`🚨 SLOTS HUÉRFANOS (sold sin venta activa): ${orphanSlots.length}`);
console.log(`════════════════════════════════════════════════════`);

// Agrupar por plataforma
const byPlatform = {};
for (const slot of orphanSlots) {
  const platform = slot.mother_account?.platform || 'Unknown';
  if (!byPlatform[platform]) byPlatform[platform] = [];
  byPlatform[platform].push(slot);
}

for (const [platform, slots] of Object.entries(byPlatform).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`\n  📦 ${platform} — ${slots.length} slot(s) huérfano(s):`);
  for (const s of slots) {
    const maStatus = s.mother_account?.status || '?';
    console.log(`    • [${s.id}] "${s.slot_identifier}" | Cuenta: ${s.mother_account?.email} (${maStatus})`);
  }
}

// ─── 4. Ventas activas con slot_id nulo o slot no existente ──────────────────
console.log('\n\n🔍 Ventas activas con slot inválido...');
const { data: allActiveSales } = await supabase
  .from('sales')
  .select('id, slot_id, customer_id, amount_gs')
  .eq('is_active', true)
  .limit(5000);

const allSlotIds = new Set();
for (const ids of chunk((allActiveSales||[]).map(s=>s.slot_id).filter(Boolean), 200)) {
  const { data } = await supabase.from('sale_slots').select('id').in('id', ids);
  (data||[]).forEach(s => allSlotIds.add(s.id));
}

const salesNoSlot = (allActiveSales||[]).filter(s => !s.slot_id || !allSlotIds.has(s.slot_id));
if (salesNoSlot.length > 0) {
  console.log(`  🚨 ${salesNoSlot.length} ventas activas con slot inexistente:`);
  salesNoSlot.forEach(s => console.log(`    • sale_id=${s.id} slot_id=${s.slot_id}`));
} else {
  console.log('  ✅ Ninguna venta activa apunta a un slot inexistente.');
}

// ─── 5. Resumen ──────────────────────────────────────────────────────────────
console.log('\n\n════════════════════════════════════════════════════');
console.log('📋 RESUMEN DE HUÉRFANOS');
console.log('════════════════════════════════════════════════════');
console.log(`  Slots sold sin venta activa:   ${orphanSlots.length}`);
console.log(`  Ventas activas sin slot válido: ${salesNoSlot.length}`);
console.log('════════════════════════════════════════════════════\n');
