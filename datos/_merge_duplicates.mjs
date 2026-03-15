/**
 * _merge_duplicates.mjs
 * Encuentra clientes con teléfono duplicado y los combina:
 * - Mantiene el que tiene full_name (o el más antiguo)
 * - Reasigna ventas del duplicado al principal
 * - Desactiva el duplicado
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

// 1. Cargar todos los clientes
const allCustomers = [];
let offset = 0;
while (true) {
  const { data } = await supabase.from('customers').select('id, full_name, phone, email, created_at, customer_type').range(offset, offset+999).order('created_at');
  if (!data || !data.length) break;
  allCustomers.push(...data);
  if (data.length < 1000) break;
  offset += 1000;
}
console.log(`Total clientes: ${allCustomers.length}`);

// 2. Normalizar teléfono y agrupar
function normalizePhone(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/\D/g, '');
  if (!p) return '';
  if (p.startsWith('0')) p = '595' + p.slice(1);
  if (p.length >= 9 && !p.startsWith('595')) p = '595' + p;
  return p;
}

const byPhone = {};
for (const c of allCustomers) {
  const norm = normalizePhone(c.phone);
  if (!norm) continue;
  if (!byPhone[norm]) byPhone[norm] = [];
  byPhone[norm].push(c);
}

// 3. Encontrar duplicados
const duplicates = Object.entries(byPhone).filter(([_, custs]) => custs.length > 1);
console.log(`Teléfonos con duplicados: ${duplicates.length}\n`);

if (duplicates.length === 0) {
  console.log('✅ No hay duplicados');
  process.exit(0);
}

// 4. Mostrar y planificar merges
let mergeCount = 0;
const mergeOps = [];

for (const [phone, custs] of duplicates) {
  // Elegir principal: preferir el que tiene nombre real (no es solo el teléfono), luego el más antiguo
  custs.sort((a, b) => {
    const aHasName = a.full_name && a.full_name !== a.phone && !a.full_name.match(/^595\d+$/);
    const bHasName = b.full_name && b.full_name !== b.phone && !b.full_name.match(/^595\d+$/);
    if (aHasName && !bHasName) return -1;
    if (!aHasName && bHasName) return 1;
    // Si ambos tienen nombre, preferir creador
    if (a.customer_type === 'creador' && b.customer_type !== 'creador') return -1;
    if (a.customer_type !== 'creador' && b.customer_type === 'creador') return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const primary = custs[0];
  const secondaries = custs.slice(1);

  console.log(`📱 ${phone} → mantener: "${primary.full_name}" (${primary.id.slice(0,8)})`);
  for (const sec of secondaries) {
    console.log(`   ❌ combinar: "${sec.full_name}" (${sec.id.slice(0,8)})`);
    mergeOps.push({ primaryId: primary.id, secondaryId: sec.id, phone, primaryName: primary.full_name, secondaryName: sec.full_name });
  }
  mergeCount += secondaries.length;
}

console.log(`\n📊 Total merges a realizar: ${mergeCount}`);

if (DRY_RUN) {
  console.log('\n💡 Quitá --dry-run para aplicar');
  process.exit(0);
}

// 5. Ejecutar merges
console.log('\n💾 Aplicando merges...');
let done = 0, errors = 0;

for (const op of mergeOps) {
  // a) Reasignar ventas del secundario al principal
  const { error: e1 } = await supabase
    .from('sales')
    .update({ customer_id: op.primaryId })
    .eq('customer_id', op.secondaryId);
  if (e1) { console.error(`  ❌ ventas ${op.secondaryId}: ${e1.message}`); errors++; continue; }

  // b) Reasignar logs de WhatsApp
  const { error: e2 } = await (supabase.from('whatsapp_send_log')).update({ customer_id: op.primaryId }).eq('customer_id', op.secondaryId);
  // Ignorar error si la tabla no tiene customer_id

  // c) Eliminar el duplicado (o desactivar si hay FK constraints)
  const { error: e3 } = await supabase
    .from('customers')
    .delete()
    .eq('id', op.secondaryId);
  
  if (e3) {
    // Si no se puede borrar, marcar como merged
    console.warn(`  ⚠️ No se pudo borrar ${op.secondaryId} (${op.secondaryName}): ${e3.message}`);
    // Intentar con un update de "soft delete" — poner nombre que indica merge
    await supabase
      .from('customers')
      .update({ full_name: `[MERGED→${op.primaryId.slice(0,8)}] ${op.secondaryName || op.phone}` })
      .eq('id', op.secondaryId);
    errors++;
  } else {
    done++;
    if (done % 50 === 0) console.log(`  → ${done}/${mergeCount}...`);
  }
}

console.log(`\n════════════════════════════════════`);
console.log(`✅ Merges completados: ${done}`);
console.log(`⚠️  Con issues:        ${errors}`);
console.log(`════════════════════════════════════\n`);
