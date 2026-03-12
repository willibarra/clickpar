#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

const emails = [
  'pons.prior_0j@icloud.com',
  'pwjg46-45pl@nyckz.com',
  'migurs-47pl@nyckz.com',
  'saner.leveler.0y@icloud.com',
  'mrybak.17pl@nyckz.com',
  'gherkin.sun_0q@icloud.com',
  'craigtroj@nyckz.com',
  'yeineippattottu@tupopets.com',
  'pawelj-92pl@nyckz.com',
  'optic.keener-3d@icloud.com',
  'shy.umber.0w@icloud.com',
];

const updateData = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  renewal_date: '2026-03-12',
  target_billing_day: 12,
  max_slots: 5,
  notes: '',
};

async function run() {
  console.log(`🔍 Procesando ${emails.length} correos - Renovación: 12/03/2026\n`);
  const found = [], notFound = [], errors = [];

  for (const email of emails) {
    const { data, error } = await supabase
      .from('mother_accounts')
      .select('id, email, status, renewal_date')
      .ilike('email', email)
      .maybeSingle();

    if (error) { console.error(`❌ Error buscando ${email}: ${error.message}`); errors.push(email); continue; }
    if (!data) { console.log(`⚠️  NO ENCONTRADO: ${email}`); notFound.push(email); continue; }

    const { error: ue } = await supabase.from('mother_accounts').update(updateData).eq('id', data.id);
    if (ue) { console.error(`❌ Error actualizando ${email}: ${ue.message}`); errors.push(email); }
    else { console.log(`✅ ${email}  (antes: ${data.status} | ${data.renewal_date})`); found.push(email); }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Actualizados: ${found.length}/${emails.length}`);
  if (notFound.length > 0) { console.log(`⚠️  No encontrados (${notFound.length}):`); notFound.forEach(e => console.log(`   - ${e}`)); }
  if (errors.length > 0) { console.log(`❌ Con error (${errors.length}):`); errors.forEach(e => console.log(`   - ${e}`)); }
}

run().catch(console.error);
