#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

// TODOS los correos de las 8 tandas
const emails = [
  // Tanda 1 - 06/04/2026
  'relapse-46-ravine@icloud.com','leap.hearer-6s@icloud.com','mariai.8it@nyckz.com',
  'fernanda.falves@tupopets.com','hlittl1582@tupopets.net','joseraimundonet@tupopets.com',
  'lit-retry-8n@icloud.com','massifs.zine.3w@icloud.com',
  // Tanda 2 - 07/04/2026
  'sdarkin@nyckz.com','frizze.26us@nyckz.com','thanashs01@nyckmail.com','karolina0808@nyckz.com',
  'proof-sworn-7c@icloud.com','sagecharles12@nyckmail.net','claudiapowell4@nyckmail.net','d.ands1@nyckz.com',
  'gourd.buggies_0m@icloud.com','kiema1.62pl@nyckz.com','cya2door@nyckz.com','stittl-45us@nyckz.com',
  'amybarnes30@nyckel.co','annaji-61us@nyckz.com','deborah.akridge@nyckmail.com','jlaniel@nyckel.co',
  'jumper_fiats.2t@icloud.com','author-debit5i@icloud.com','marta-turowska1994@nyckz.com',
  'tony.marcum11@nyckz.com','carrier.swatch0c@icloud.com','matthewpetillo@nyckmail.net',
  'breayo-40us@nyckz.com','brinks.strewn.09@icloud.com','maxime-3fr@nyckz.com','ericcu.33us@nyckz.com',
  'regina-28us@nyckz.com','venison_quicker.5f@icloud.com','tupopets+0167FDC@gmail.com',
  // Tanda 3 - 08/04/2026
  'pileups-yarrow.1h@icloud.com','leilanikapani@tupopets.com','Jpdlod+lwyman2@icloud.com',
  'menisci-scrape-2s@icloud.com','mendozab06@nyckz.com','sales1@nyckz.com','clumpy-solver-0n@icloud.com',
  'shan.sheldon@nyckz.com','06gerund_carrels@icloud.com','06rubr.55gb@nyckz.com',
  'silvaconstruction@nyckel.co','tendon-hound9i@icloud.com','kody.rollin95@nyckmail.net','dan@nyckz.com',
  'nyerspeter6@nyckz.com','ondase-32us@nyckz.com','lisaduong2002US@nyckz.com','lopez.elvinUS@nyckz.com',
  'pala-lanzados.01@icloud.com','kaiea96734@nyckmail.com','demart.6it@nyckz.com',
  'pemeadows01@nyckmail.net','deoliv-10ca@nyckz.com','tamilovesu2@nyckz.com',
  'jojoba_airdrop0u@icloud.com','scewfbr@nyckz.com','20.spangly_arsenic@icloud.com',
  'tmuench7@nyckz.com','eilymchamilton@nyckel.co','pawel1771@nyckz.com','Jpdlod+christsanort@icloud.com',
  // Tanda 4 - 09/03/2026
  'antimi-3it@nyckz.com','malonehomes@nyckz.com','chaysemac10@nyckel.co','radius.offset8p@icloud.com',
  'balks_earthy_8s@icloud.com','00_elvish.pinyin@icloud.com','merrittsmorgan@nyckz.com',
  'codfish.graze0x@icloud.com','corric.4us@nyckz.com','perrin-69fr@nyckz.com',
  // Tanda 5 - 11/03/2026
  'robert-35it@nyckz.com','joanna.lukaszczyk@nyckz.com','cay.eaglets-6v@icloud.com',
  'colewebb2009@nyckmail.com','epaulet_cartoon.6a@icloud.com','comfort04cerium@icloud.com',
  'a.dziakiewicz@nyckz.com','irizarryzavala@nyckz.com','peace.bourbon.7g@icloud.com',
  'jacob.caron@nyckz.com','Jpdlod+kjvgolf@icloud.com','lucasmaberry@nyckmail.net','matt.hoover@nyckmail.com',
  // Tanda 6 - 12/03/2026
  'pons.prior_0j@icloud.com','pwjg46-45pl@nyckz.com','migurs-47pl@nyckz.com',
  'saner.leveler.0y@icloud.com','mrybak.17pl@nyckz.com','gherkin.sun_0q@icloud.com',
  'craigtroj@nyckz.com','yeineippattottu@tupopets.com','pawelj-92pl@nyckz.com',
  'optic.keener-3d@icloud.com','shy.umber.0w@icloud.com',
  // Tanda 7 - 13/03/2026
  'casareposa25+nn06@picpart.xyz','casareposa25+nn073@picpart.xyz','jaimeovallos26@picpart.xyz',
  // Tanda 8 - 14/03/2026
  'manuelasandovall104@clickpar.net','Jpdlod+gissette.medina@icloud.com','eduardoalex2004@nyckmail.net',
  'markup_pears_9r@icloud.com','metalico-07amapola@icloud.com','Jpdlod+siddharthkaul@icloud.com',
  'what02.rents@icloud.com','gabriela_3304@nyckz.com','amoebic.violins-1y@icloud.com',
  '05.riff_fizz@icloud.com','06_tissue.boxers@icloud.com','colic.tanner.0a@icloud.com',
  'shrine.fleets.0w@icloud.com','progres55@nyckz.com','slices_refill.0a@icloud.com',
  'nigh_hefty_0j@icloud.com','nivel.madera.01@icloud.com','kstayman91@nyckz.com',
  'brandon.johnson0602@nyckz.com','spinier_swap0b@icloud.com','leblan-42fr@nyckz.com',
  'reader_digger.03@icloud.com','reynolds_jen@nyckz.com','lower-even-00@icloud.com',
  'donlastnamelong@nyckmail.com','tiki_foreign.0a@icloud.com','earners_earbud.0q@icloud.com',
];

// Normalizar a minúsculas para el filtro
const emailsLower = emails.map(e => e.toLowerCase());

async function run() {
  console.log(`🔍 Actualizando sale_price_gs y provider_name en ${emails.length} correos...\n`);

  // Un solo UPDATE masivo usando lower(email) IN (...)
  const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

  const emailList = emailsLower.map(e => `'${e}'`).join(', ');
  const sql = `
    UPDATE mother_accounts
    SET sale_price_gs = 30000,
        provider_name = 'POP PREMIUM'
    WHERE lower(email) = ANY(ARRAY[${emailList}])
    RETURNING id, email, sale_price_gs, provider_name;
  `;

  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    console.error('❌ Error en query:', res.status, text);
    return;
  }

  const rows = Array.isArray(json) ? json : (json.data || json.rows || []);
  console.log(`✅ Filas actualizadas: ${rows.length}`);
  rows.forEach(r => console.log(`   ${r.email} → sale_price_gs: ${r.sale_price_gs}, provider: ${r.provider_name}`));

  if (rows.length < emails.length) {
    const updatedEmails = new Set(rows.map(r => r.email.toLowerCase()));
    const missing = emailsLower.filter(e => !updatedEmails.has(e));
    if (missing.length > 0) {
      console.log(`\n⚠️  No encontrados en BD (${missing.length}):`);
      missing.forEach(e => console.log(`   - ${e}`));
    }
  }
}

run().catch(console.error);
