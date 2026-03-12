#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

const emails = [
  'pileups-yarrow.1h@icloud.com',
  'leilanikapani@tupopets.com',
  'Jpdlod+lwyman2@icloud.com',
  'menisci-scrape-2s@icloud.com',
  'mendozab06@nyckz.com',
  'sales1@nyckz.com',
  'clumpy-solver-0n@icloud.com',
  'shan.sheldon@nyckz.com',
  '06gerund_carrels@icloud.com',
  '06rubr.55gb@nyckz.com',
  'silvaconstruction@nyckel.co',
  'tendon-hound9i@icloud.com',
  'kody.rollin95@nyckmail.net',
  'dan@nyckz.com',
  'nyerspeter6@nyckz.com',
  'ondase-32us@nyckz.com',
  'lisaduong2002US@nyckz.com',
  'lopez.elvinUS@nyckz.com',
  'pala-lanzados.01@icloud.com',
  'kaiea96734@nyckmail.com',
  'demart.6it@nyckz.com',
  'pemeadows01@nyckmail.net',
  'deoliv-10ca@nyckz.com',
  'tamilovesu2@nyckz.com',
  'jojoba_airdrop0u@icloud.com',
  'scewfbr@nyckz.com',
  '20.spangly_arsenic@icloud.com',
  'tmuench7@nyckz.com',
  'eilymchamilton@nyckel.co',
  'pawel1771@nyckz.com',
  'Jpdlod+christsanort@icloud.com',
];

const updateData = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  renewal_date: '2026-04-08',
  target_billing_day: 8,
  max_slots: 5,
  notes: '',
};

async function run() {
  console.log(`🔍 Procesando ${emails.length} correos - Renovación: 08/04/2026\n`);
  const found = [], notFound = [], errors = [];

  for (const email of emails) {
    const { data, error } = await supabase
      .from('mother_accounts')
      .select('id, email, status, renewal_date')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      console.error(`❌ Error buscando ${email}: ${error.message}`);
      errors.push(email);
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
      errors.push(email);
    } else {
      console.log(`✅ ${email}  (antes: ${data.status} | ${data.renewal_date})`);
      found.push(email);
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Actualizados: ${found.length}/${emails.length}`);
  if (notFound.length > 0) {
    console.log(`⚠️  No encontrados (${notFound.length}):`);
    notFound.forEach(e => console.log(`   - ${e}`));
  }
  if (errors.length > 0) {
    console.log(`❌ Con error (${errors.length}):`);
    errors.forEach(e => console.log(`   - ${e}`));
  }
}

run().catch(console.error);
