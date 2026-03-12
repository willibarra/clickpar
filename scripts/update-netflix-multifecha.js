#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

// Grupos por fecha
const groups = [
  {
    renewal_date: '2026-03-15', target_billing_day: 15,
    emails: [
      'ana.torres.dev@picnet.xyz',
      'lucia.fernandez.vip@clickyop.xyz',
      'elena.sanchez.77@picnet.xyz',
      'carlos_rodriguez_92@panelstream.xyz',
      'sofia.castro.2026@clickyop.xyz',
      'ricardo.morales.99@picpart.xyz',
      'runtime_hiatus_0a@icloud.com',
    ]
  },
  {
    renewal_date: '2026-03-17', target_billing_day: 17,
    emails: [
      'design.audits.2v@icloud.com',
    ]
  },
  {
    renewal_date: '2026-03-19', target_billing_day: 19,
    emails: [
      'josema.garcia.88@picnet.xyz',
      'kaysch-5us@nyckz.com',
      'hotstu-81us@nyckz.com',
      'corrinamartinez68@nyckmail.net',
      'countessa618@nyckmail.com',
      'jason8009@nyckz.com',
      'jedlic-49us@nyckz.com',
      'schmittm1214@nyckz.com',
      'mehrha.53us@nyckz.com',
      'mtalaf.64us@nyckz.com',
    ]
  },
  {
    renewal_date: '2026-03-21', target_billing_day: 21,
    emails: [
      'emiliosantander661@panelstream.xyz',
      'casareposa25+nn02n492603@clickyop.xyz',
      'casareposa25+nn03n499490@clickpar.net',
      'andersonandrescarrascal@picnet.xyz',
    ]
  },
  {
    renewal_date: '2026-03-22', target_billing_day: 22,
    emails: [
      'MarielRolon2329@hotmail.com',
    ]
  },
  {
    renewal_date: '2026-03-23', target_billing_day: 23,
    emails: [
      'casareposa25+nn02n485846@picpart.xyz',
      'casareposa25+nn01n517100@picnet.xyz',
      'casareposa25+nn@panelstream.xyz',
      'casareposa25+nn04n511223@clickyop.xyz',
      'casareposa25+nn05@picnet.xyz',
      'pamela6vergara843@hotmail.com',
      'actores_aguda.0n@icloud.com',
    ]
  },
  {
    renewal_date: '2026-03-24', target_billing_day: 24,
    emails: [
      'diego.pombepro@picpart.xyz',
      'oscar17banguero521@outlook.com',
      'kiara_rodriguez41@panelstream.xyz',
      'elena.sanch33@picnet.xyz',
      'querubin12valencia305@outlook.com',
      'arace.josua@clickpar.net',
    ]
  },
  {
    renewal_date: '2026-03-31', target_billing_day: 31,
    emails: [
      'fernandezz.vip@clickyop.xyz',
      'casareposa25+nn01n487283@clickpar.net',
    ]
  },
  {
    renewal_date: '2026-04-01', target_billing_day: 1,
    emails: [
      'tamara9sabogal581@hotmail.com',
    ]
  },
];

const BASE_FIELDS = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  max_slots: 5,
  notes: '',
  sale_price_gs: 30000,
  provider_name: 'POP PREMIUM',
};

async function run() {
  const totalEmails = groups.reduce((s, g) => s + g.emails.length, 0);
  console.log(`🔍 Procesando ${totalEmails} correos en ${groups.length} grupos de fechas\n`);

  let totalFound = 0, totalNotFound = 0;
  const allNotFound = [];

  for (const group of groups) {
    console.log(`📅 Renovación: ${group.renewal_date} (Día Fact: ${group.target_billing_day}) — ${group.emails.length} correos`);
    const updateData = { ...BASE_FIELDS, renewal_date: group.renewal_date, target_billing_day: group.target_billing_day };

    for (const email of group.emails) {
      const { data, error } = await supabase
        .from('mother_accounts')
        .select('id, status, renewal_date')
        .ilike('email', email)
        .maybeSingle();

      if (error) {
        console.error(`   ❌ Error buscando ${email}: ${error.message}`);
        continue;
      }
      if (!data) {
        console.log(`   ⚠️  NO ENCONTRADO: ${email}`);
        allNotFound.push(email);
        totalNotFound++;
        continue;
      }

      const { error: ue } = await supabase.from('mother_accounts').update(updateData).eq('id', data.id);
      if (ue) {
        console.error(`   ❌ Error actualizando ${email}: ${ue.message}`);
      } else {
        console.log(`   ✅ ${email}  (antes: ${data.status} | ${data.renewal_date})`);
        totalFound++;
      }
    }
    console.log('');
  }

  console.log('─────────────────────────────────────');
  console.log(`✅ Actualizados: ${totalFound}/${totalEmails}`);
  if (allNotFound.length > 0) {
    console.log(`⚠️  No encontrados (${allNotFound.length}):`);
    allNotFound.forEach(e => console.log(`   - ${e}`));
  }
}

run().catch(console.error);
