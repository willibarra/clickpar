const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

/**
 * Script: fix-netflix-6slots.js
 * 
 * 1. Busca cuentas Netflix con > 5 slots
 * 2. Si hay slots libres (available) en exceso → los elimina
 * 3. Renombra slots con formato "N. Perfil X" → "Perfil X"
 *    Solo renombra los que NO tienen conflicto (no hay otro "Perfil X" ya existente)
 */

async function main() {
  // 1. Obtener todas las cuentas madre Netflix
  const { data: accounts } = await supabase
    .from('mother_accounts')
    .select('id, email')
    .ilike('platform', '%netflix%');

  console.log(`\n📋 Total cuentas Netflix: ${accounts.length}\n`);

  let deletedSlots = 0;
  let renamedSlots = 0;
  const problems = [];

  for (const account of accounts) {
    // Obtener todos sus slots
    const { data: slots } = await supabase
      .from('sale_slots')
      .select('id, slot_identifier, status')
      .eq('mother_account_id', account.id)
      .order('slot_identifier');

    if (!slots || slots.length === 0) continue;

    // ── Paso 1: Si tiene > 5 slots, eliminar los libres ──
    if (slots.length > 5) {
      const freeSlots = slots.filter(s => s.status === 'available');
      const excessCount = slots.length - 5;

      if (freeSlots.length >= excessCount) {
        // Podemos eliminar los libres que sobran
        const toDelete = freeSlots.slice(0, excessCount);
        for (const slot of toDelete) {
          const { error } = await supabase
            .from('sale_slots')
            .delete()
            .eq('id', slot.id);
          if (error) {
            console.error(`❌ Error eliminando slot ${slot.slot_identifier} de ${account.email}:`, error.message);
          } else {
            deletedSlots++;
            console.log(`🗑️  Eliminado: ${account.email} - ${slot.slot_identifier} (libre)`);
          }
        }
      } else {
        // Todos los libres no alcanzan para reducir a 5 → reportar
        problems.push({ email: account.email, total: slots.length, free: freeSlots.length, sold: slots.filter(s=>s.status!=='available').length });
        console.log(`⚠️  ${account.email}: ${slots.length} slots, ${freeSlots.length} libres — no se puede reducir a 5 (hay vendidos de más)`);
      }
    }

    // ── Paso 2: Renombrar slots "N. Perfil X" → "Perfil X" ──
    // Recargar slots después de posibles eliminaciones
    const { data: currentSlots } = await supabase
      .from('sale_slots')
      .select('id, slot_identifier, status')
      .eq('mother_account_id', account.id);

    const existingNames = new Set(currentSlots.map(s => s.slot_identifier));

    for (const slot of currentSlots) {
      // Detectar formato "N. Perfil X"
      const match = slot.slot_identifier.match(/^\d+\.\s*(Perfil\s+\d+)$/i);
      if (!match) continue;

      const cleanName = match[1]; // ej: "Perfil 2"

      if (existingNames.has(cleanName)) {
        // Ya existe un slot con ese nombre limpio — conflicto
        console.log(`⚠️  Conflicto: ${account.email} ya tiene "${cleanName}" al renombrar "${slot.slot_identifier}"`);
        continue;
      }

      // Renombrar
      const { error } = await supabase
        .from('sale_slots')
        .update({ slot_identifier: cleanName })
        .eq('id', slot.id);

      if (error) {
        console.error(`❌ Error renombrando ${slot.slot_identifier}:`, error.message);
      } else {
        existingNames.delete(slot.slot_identifier);
        existingNames.add(cleanName);
        renamedSlots++;
        console.log(`✏️  Renombrado: ${account.email}: "${slot.slot_identifier}" → "${cleanName}"`);
      }
    }
  }

  console.log('\n============================================');
  console.log(`🗑️  Slots eliminados:  ${deletedSlots}`);
  console.log(`✏️  Slots renombrados: ${renamedSlots}`);
  if (problems.length > 0) {
    console.log(`\n⚠️  Cuentas con más de 5 slots VENDIDOS (requieren revisión manual):`);
    problems.forEach(p => console.log(`   - ${p.email}: ${p.total} total, ${p.sold} vendidos, ${p.free} libres`));
  }
  console.log('============================================\n');
}

main().catch(console.error);
