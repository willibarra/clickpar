#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

const emails = [
  'manuelasandovall104@clickpar.net',
  'Jpdlod+gissette.medina@icloud.com',
  'eduardoalex2004@nyckmail.net',
  'markup_pears_9r@icloud.com',
  'metalico-07amapola@icloud.com',
  'Jpdlod+siddharthkaul@icloud.com',
  'what02.rents@icloud.com',
  'gabriela_3304@nyckz.com',
  'amoebic.violins-1y@icloud.com',
  '05.riff_fizz@icloud.com',
  '06_tissue.boxers@icloud.com',
  'colic.tanner.0a@icloud.com',
  'shrine.fleets.0w@icloud.com',
  'progres55@nyckz.com',
  'slices_refill.0a@icloud.com',
  'nigh_hefty_0j@icloud.com',
  'nivel.madera.01@icloud.com',
  'kstayman91@nyckz.com',
  'brandon.johnson0602@nyckz.com',
  'spinier_swap0b@icloud.com',
  'leblan-42fr@nyckz.com',
  'reader_digger.03@icloud.com',
  'reynolds_jen@nyckz.com',
  'lower-even-00@icloud.com',
  'donlastnamelong@nyckmail.com',
  'tiki_foreign.0a@icloud.com',
  'earners_earbud.0q@icloud.com',
];

const updateData = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  renewal_date: '2026-03-14',
  target_billing_day: 14,
  max_slots: 5,
  notes: '',
};

async function run() {
  console.log(`🔍 Procesando ${emails.length} correos - Renovación: 14/03/2026\n`);
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
