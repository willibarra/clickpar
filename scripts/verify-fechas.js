#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

// Mapa de fecha esperada por correo según la tanda
const expected = {
  // Tanda 2 - 07/04/2026
  'deborah.akridge@nyckmail.com': '2026-04-07',
  // Tanda 4 - 09/03/2026
  'codfish.graze0x@icloud.com':   '2026-03-09',
  'antimi-3it@nyckz.com':         '2026-03-09',
  'chaysemac10@nyckel.co':        '2026-03-09',
  'perrin-69fr@nyckz.com':        '2026-03-09',
  'corric.4us@nyckz.com':         '2026-03-09',
  'balks_earthy_8s@icloud.com':   '2026-03-09',
  'radius.offset8p@icloud.com':   '2026-03-09',
  'malonehomes@nyckz.com':        '2026-03-09',
  'merrittsmorgan@nyckz.com':     '2026-03-09',
  '00_elvish.pinyin@icloud.com':  '2026-03-09',
  // Tanda 5 - 11/03/2026
  'peace.bourbon.7g@icloud.com':  '2026-03-11',
  'lucasmaberry@nyckmail.net':     '2026-03-11',
  'jpdlod+kjvgolf@icloud.com':    '2026-03-11',
  'joanna.lukaszczyk@nyckz.com':  '2026-03-11',
  'jacob.caron@nyckz.com':        '2026-03-11',
  'irizarryzavala@nyckz.com':     '2026-03-11',
  'colewebb2009@nyckmail.com':    '2026-03-11',
  'robert-35it@nyckz.com':        '2026-03-11',
  'a.dziakiewicz@nyckz.com':      '2026-03-11',
  'comfort04cerium@icloud.com':   '2026-03-11',
  'matt.hoover@nyckmail.com':     '2026-03-11',
  'cay.eaglets-6v@icloud.com':    '2026-03-11',
  'epaulet_cartoon.6a@icloud.com':'2026-03-11',
};

// Correos no pertenecen a ninguna tanda procesada (se ignoran si no están en BD)
const notInBatches = [
  'diego4elupi@bagreen.uk',
  'savoy-silky.1l@icloud.com',
  'juan.perez2024@picpart.xyz',
  'marta.garcia.88@picnet.xyz',
  'dory.firebug.0h@icloud.com',
  'jfrinaldi@nyckz.com',
];

const allEmails = [
  'diego4elupi@bagreen.uk',
  'deborah.akridge@nyckmail.com',
  'savoy-silky.1l@icloud.com',
  'juan.perez2024@picpart.xyz',
  'marta.garcia.88@picnet.xyz',
  'dory.firebug.0h@icloud.com',
  'codfish.graze0x@icloud.com',
  'antimi-3it@nyckz.com',
  'chaysemac10@nyckel.co',
  'perrin-69fr@nyckz.com',
  'corric.4us@nyckz.com',
  'balks_earthy_8s@icloud.com',
  'radius.offset8p@icloud.com',
  'malonehomes@nyckz.com',
  'merrittsmorgan@nyckz.com',
  '00_elvish.pinyin@icloud.com',
  'jfrinaldi@nyckz.com',
  'peace.bourbon.7g@icloud.com',
  'lucasmaberry@nyckmail.net',
  'Jpdlod+kjvgolf@icloud.com',
  'joanna.lukaszczyk@nyckz.com',
  'jacob.caron@nyckz.com',
  'irizarryzavala@nyckz.com',
  'colewebb2009@nyckmail.com',
  'robert-35it@nyckz.com',
  'a.dziakiewicz@nyckz.com',
  'comfort04cerium@icloud.com',
  'matt.hoover@nyckmail.com',
  'cay.eaglets-6v@icloud.com',
  'epaulet_cartoon.6a@icloud.com',
];

async function run() {
  console.log('🔍 Verificando fechas de renovación...\n');

  let ok = 0, wrong = 0, notFound = 0, noExpected = 0;

  for (const email of allEmails) {
    const { data, error } = await sb
      .from('mother_accounts')
      .select('email, renewal_date, status')
      .ilike('email', email)
      .maybeSingle();

    const expectedDate = expected[email.toLowerCase()];

    if (error) {
      console.log(`❌ Error: ${email}: ${error.message}`);
      continue;
    }
    if (!data) {
      console.log(`⚪ NO EN BD (ignorado): ${email}`);
      notFound++;
      continue;
    }
    if (!expectedDate) {
      console.log(`🔵 NO EN TANDAS: ${email} → BD tiene: ${data.renewal_date}`);
      noExpected++;
      continue;
    }

    const match = data.renewal_date === expectedDate;
    if (match) {
      console.log(`✅ OK:   ${email} → ${data.renewal_date}`);
      ok++;
    } else {
      console.log(`❌ MAL:  ${email} → BD: ${data.renewal_date}  |  Esperado: ${expectedDate}`);
      wrong++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Correctos:       ${ok}`);
  console.log(`❌ Incorrectos:     ${wrong}`);
  console.log(`⚪ No en BD:        ${notFound}`);
  console.log(`🔵 Sin tanda previa: ${noExpected}`);
}

run().catch(console.error);
