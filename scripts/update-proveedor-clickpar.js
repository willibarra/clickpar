#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const emails = [
  'manuelasandovall104@clickpar.net',
  'josema.garcia.88@picnet.xyz',
  'diego.pombepro@picpart.xyz',
  'oscar17banguero521@outlook.com',
  'kiara_rodriguez41@panelstream.xyz',
  'elena.sanch33@picnet.xyz',
  'querubin12valencia305@outlook.com',
  'fernandezz.vip@clickyop.xyz',
  'tamara9sabogal581@hotmail.com',
  'MarielRolon2329@hotmail.com',
  'arace.josua@clickpar.net',
  'ana.torres.dev@picnet.xyz',
  'lucia.fernandez.vip@clickyop.xyz',
  'elena.sanchez.77@picnet.xyz',
  'carlos_rodriguez_92@panelstream.xyz',
  'sofia.castro.2026@clickyop.xyz',
  'ricardo.morales.99@picpart.xyz',
  'casareposa25+nn06@picpart.xyz',
  'casareposa25+nn073@picpart.xyz',
  'jaimeovallos26@picpart.xyz',
  'emiliosantander661@panelstream.xyz',
  'casareposa25+nn02n492603@clickyop.xyz',
  'casareposa25+nn03n499490@clickpar.net',
  'andersonandrescarrascal@picnet.xyz',
  'casareposa25+nn02n485846@picpart.xyz',
  'casareposa25+nn01n517100@picnet.xyz',
  'casareposa25+nn@panelstream.xyz',
  'casareposa25+nn04n511223@clickyop.xyz',
  'casareposa25+nn05@picnet.xyz',
  'pamela6vergara843@hotmail.com',
  'casareposa25+nn01n487283@clickpar.net',
];

async function run() {
  const emailsLower = emails.map(e => e.toLowerCase());
  const emailList = emailsLower.map(e => `'${e}'`).join(', ');

  const sql = `
    UPDATE mother_accounts
    SET provider_name = 'CLICKPAR'
    WHERE lower(email) = ANY(ARRAY[${emailList}])
    RETURNING email, provider_name;
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

  const rows = await res.json();

  if (!res.ok) {
    console.error('❌ Error:', rows);
    return;
  }

  const updatedEmails = new Set(rows.map(r => r.email.toLowerCase()));
  const notFound = emailsLower.filter(e => !updatedEmails.has(e));

  console.log(`\n✅ Proveedor → CLICKPAR`);
  console.log(`   Actualizados: ${rows.length}/${emails.length}`);
  rows.forEach(r => console.log(`   ✅ ${r.email}`));

  if (notFound.length > 0) {
    console.log(`\n⚠️  No encontrados en BD (${notFound.length}):`);
    notFound.forEach(e => console.log(`   - ${e}`));
  }
}

run().catch(console.error);
