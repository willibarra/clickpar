#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const emails = [
  'sdarkin@nyckz.com',
  'frizze.26us@nyckz.com',
  'thanashs01@nyckmail.com',
  'karolina0808@nyckz.com',
  'proof-sworn-7c@icloud.com',
  'sagecharles12@nyckmail.net',
  'claudiapowell4@nyckmail.net',
  'd.ands1@nyckz.com',
  'gourd.buggies_0m@icloud.com',
  'kiema1.62pl@nyckz.com',
  'cya2door@nyckz.com',
  'stittl-45us@nyckz.com',
  'amybarnes30@nyckel.co',
  'annaji-61us@nyckz.com',
  'deborah.akridge@nyckmail.com',
  'jlaniel@nyckel.co',
  'jumper_fiats.2t@icloud.com',
  'author-debit5i@icloud.com',
  'marta-turowska1994@nyckz.com',
  'tony.marcum11@nyckz.com',
  'carrier.swatch0c@icloud.com',
  'matthewpetillo@nyckmail.net',
  'breayo-40us@nyckz.com',
  'brinks.strewn.09@icloud.com',
  'maxime-3fr@nyckz.com',
  'ericcu.33us@nyckz.com',
  'regina-28us@nyckz.com',
  'venison_quicker.5f@icloud.com',
  'tupopets+0167FDC@gmail.com',
];

const updateData = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  renewal_date: '2026-04-07',
  target_billing_day: 7,
  max_slots: 5,
  notes: '',
};

async function run() {
  console.log(`🔍 Procesando ${emails.length} correos - Renovación: 07/04/2026\n`);
  const found = [], notFound = [];

  for (const email of emails) {
    const { data, error } = await supabase
      .from('mother_accounts')
      .select('id, email, status, renewal_date, target_billing_day, purchase_cost_usdt')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      console.error(`❌ Error buscando ${email}: ${error.message}`);
      continue;
    }
    if (!data) {
      console.log(`⚠️  NO ENCONTRADO: ${email}`);
      notFound.push(email);
      continue;
    }

    const { error: ue } = await supabase
      .from('mother_accounts')
      .update(updateData)
      .eq('id', data.id);

    if (ue) {
      console.error(`❌ Error actualizando ${email}: ${ue.message}`);
    } else {
      console.log(`✅ ${email}  (antes: ${data.status} | renovación: ${data.renewal_date})`);
      found.push(email);
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Actualizados exitosamente: ${found.length}/${emails.length}`);
  if (notFound.length > 0) {
    console.log(`⚠️  No encontrados en BD (${notFound.length}):`);
    notFound.forEach(e => console.log(`   - ${e}`));
  }
}

run().catch(console.error);
