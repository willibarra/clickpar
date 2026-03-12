#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const allEmails = [
  // Tanda 1
  'relapse-46-ravine@icloud.com','leap.hearer-6s@icloud.com','mariai.8it@nyckz.com','fernanda.falves@tupopets.com','hlittl1582@tupopets.net','joseraimundonet@tupopets.com','lit-retry-8n@icloud.com','massifs.zine.3w@icloud.com',
  // Tanda 2
  'sdarkin@nyckz.com','frizze.26us@nyckz.com','thanashs01@nyckmail.com','karolina0808@nyckz.com','proof-sworn-7c@icloud.com','sagecharles12@nyckmail.net','claudiapowell4@nyckmail.net','d.ands1@nyckz.com','kiema1.62pl@nyckz.com','cya2door@nyckz.com','stittl-45us@nyckz.com','amybarnes30@nyckel.co','annaji-61us@nyckz.com','deborah.akridge@nyckmail.com','jlaniel@nyckel.co','jumper_fiats.2t@icloud.com','author-debit5i@icloud.com','marta-turowska1994@nyckz.com','tony.marcum11@nyckz.com','carrier.swatch0c@icloud.com','matthewpetillo@nyckmail.net','breayo-40us@nyckz.com','brinks.strewn.09@icloud.com','maxime-3fr@nyckz.com','ericcu.33us@nyckz.com','regina-28us@nyckz.com','venison_quicker.5f@icloud.com','tupopets+0167FDC@gmail.com',
  // Tanda 3
  'pileups-yarrow.1h@icloud.com','leilanikapani@tupopets.com','Jpdlod+lwyman2@icloud.com','menisci-scrape-2s@icloud.com','mendozab06@nyckz.com','sales1@nyckz.com','clumpy-solver-0n@icloud.com','shan.sheldon@nyckz.com','06gerund_carrels@icloud.com','06rubr.55gb@nyckz.com','tendon-hound9i@icloud.com','kody.rollin95@nyckmail.net','dan@nyckz.com','nyerspeter6@nyckz.com','ondase-32us@nyckz.com','lisaduong2002US@nyckz.com','lopez.elvinUS@nyckz.com','pala-lanzados.01@icloud.com','pemeadows01@nyckmail.net','deoliv-10ca@nyckz.com','tamilovesu2@nyckz.com','jojoba_airdrop0u@icloud.com','20.spangly_arsenic@icloud.com','tmuench7@nyckz.com','eilymchamilton@nyckel.co','pawel1771@nyckz.com','Jpdlod+christsanort@icloud.com',
  // Tanda 4
  'antimi-3it@nyckz.com','malonehomes@nyckz.com','chaysemac10@nyckel.co','radius.offset8p@icloud.com','balks_earthy_8s@icloud.com','00_elvish.pinyin@icloud.com','merrittsmorgan@nyckz.com','codfish.graze0x@icloud.com','corric.4us@nyckz.com','perrin-69fr@nyckz.com',
  // Tanda 5
  'robert-35it@nyckz.com','joanna.lukaszczyk@nyckz.com','cay.eaglets-6v@icloud.com','colewebb2009@nyckmail.com','epaulet_cartoon.6a@icloud.com','comfort04cerium@icloud.com','a.dziakiewicz@nyckz.com','irizarryzavala@nyckz.com','peace.bourbon.7g@icloud.com','jacob.caron@nyckz.com','Jpdlod+kjvgolf@icloud.com','lucasmaberry@nyckmail.net','matt.hoover@nyckmail.com',
  // Tanda 6
  'pons.prior_0j@icloud.com','pwjg46-45pl@nyckz.com','migurs-47pl@nyckz.com','saner.leveler.0y@icloud.com','mrybak.17pl@nyckz.com','gherkin.sun_0q@icloud.com','craigtroj@nyckz.com','yeineippattottu@tupopets.com','pawelj-92pl@nyckz.com','optic.keener-3d@icloud.com',
  // Tanda 7
  'casareposa25+nn06@picpart.xyz','casareposa25+nn073@picpart.xyz','jaimeovallos26@picpart.xyz',
  // Tanda 8
  'manuelasandovall104@clickpar.net','Jpdlod+gissette.medina@icloud.com','eduardoalex2004@nyckmail.net','markup_pears_9r@icloud.com','metalico-07amapola@icloud.com','Jpdlod+siddharthkaul@icloud.com','what02.rents@icloud.com','gabriela_3304@nyckz.com','amoebic.violins-1y@icloud.com','05.riff_fizz@icloud.com','06_tissue.boxers@icloud.com','colic.tanner.0a@icloud.com','shrine.fleets.0w@icloud.com','progres55@nyckz.com','slices_refill.0a@icloud.com','nigh_hefty_0j@icloud.com','nivel.madera.01@icloud.com','kstayman91@nyckz.com','brandon.johnson0602@nyckz.com','spinier_swap0b@icloud.com','leblan-42fr@nyckz.com','reader_digger.03@icloud.com','reynolds_jen@nyckz.com','lower-even-00@icloud.com','donlastnamelong@nyckmail.com','tiki_foreign.0a@icloud.com','earners_earbud.0q@icloud.com',
  // Multi-fecha
  'ana.torres.dev@picnet.xyz','lucia.fernandez.vip@clickyop.xyz','elena.sanchez.77@picnet.xyz','carlos_rodriguez_92@panelstream.xyz','ricardo.morales.99@picpart.xyz','runtime_hiatus_0a@icloud.com','design.audits.2v@icloud.com','josema.garcia.88@picnet.xyz','kaysch-5us@nyckz.com','hotstu-81us@nyckz.com','corrinamartinez68@nyckmail.net','countessa618@nyckmail.com','jason8009@nyckz.com','jedlic-49us@nyckz.com','schmittm1214@nyckz.com','mehrha.53us@nyckz.com','mtalaf.64us@nyckz.com','emiliosantander661@panelstream.xyz','casareposa25+nn02n492603@clickyop.xyz','casareposa25+nn03n499490@clickpar.net','andersonandrescarrascal@picnet.xyz','MarielRolon2329@hotmail.com','casareposa25+nn02n485846@picpart.xyz','casareposa25+nn01n517100@picnet.xyz','casareposa25+nn@panelstream.xyz','casareposa25+nn04n511223@clickyop.xyz','casareposa25+nn05@picnet.xyz','pamela6vergara843@hotmail.com','actores_aguda.0n@icloud.com','diego.pombepro@picpart.xyz','oscar17banguero521@outlook.com','kiara_rodriguez41@panelstream.xyz','elena.sanch33@picnet.xyz','querubin12valencia305@outlook.com','arace.josua@clickpar.net','fernandezz.vip@clickyop.xyz','casareposa25+nn01n487283@clickpar.net','tamara9sabogal581@hotmail.com',
];

async function run() {
  const emailsLower = allEmails.map(e => e.toLowerCase());
  const emailList = emailsLower.map(e => `'${e}'`).join(', ');

  const sql = `SELECT email, sale_price_gs, provider_name FROM mother_accounts WHERE lower(email) = ANY(ARRAY[${emailList}]) ORDER BY email`;

  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
    body: JSON.stringify({ query: sql }),
  });

  const rows = await res.json();

  let ok = 0;
  const wrong = [], missing = [];

  const foundEmails = new Set(rows.map(r => r.email.toLowerCase()));
  emailsLower.forEach(e => { if (!foundEmails.has(e)) missing.push(e); });

  rows.forEach(r => {
    if (r.sale_price_gs === 30000 && r.provider_name === 'POP PREMIUM') {
      ok++;
    } else {
      wrong.push(r);
    }
  });

  console.log(`\n📊 VERIFICACIÓN COMPLETA`);
  console.log(`   Total correos a verificar: ${allEmails.length}`);
  console.log(`   Encontrados en BD:          ${rows.length}`);
  console.log(`   ✅ Con precio/proveedor OK: ${ok}`);
  console.log(`   ❌ Con datos incorrectos:   ${wrong.length}`);
  console.log(`   ⚠️  No encontrados en BD:   ${missing.length}`);

  if (wrong.length > 0) {
    console.log(`\n❌ DATOS INCORRECTOS:`);
    wrong.forEach(r => console.log(`   ${r.email} → precio: ${r.sale_price_gs}, proveedor: ${r.provider_name}`));
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  NO ENCONTRADOS EN BD:`);
    missing.forEach(e => console.log(`   - ${e}`));
  }

  if (wrong.length === 0) {
    console.log(`\n🎉 ¡Todos los correos encontrados tienen precio Gs. 30.000 y proveedor POP PREMIUM!`);
  }
}

run().catch(console.error);
