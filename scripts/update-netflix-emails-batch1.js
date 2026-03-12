#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// 1ra tanda de correos a actualizar
const emails = [
  'relapse-46-ravine@icloud.com',
  'leap.hearer-6s@icloud.com',
  'mariai.8it@nyckz.com',
  'fernanda.falves@tupopets.com',
  'hlittl1582@tupopets.net',
  'joseraimundonet@tupopets.com',
  'lit-retry-8n@icloud.com',
  'massifs.zine.3w@icloud.com',
];

// Datos a aplicar a todos
const updateData = {
  platform: 'Netflix',
  status: 'active',
  purchase_cost_usdt: 10,
  purchase_cost_gs: 70000,
  renewal_date: '2026-04-06',
  target_billing_day: 6,
  max_slots: 5,
  notes: '',
};

async function run() {
  console.log('🔍 Buscando y actualizando cuentas...\n');

  const found = [];
  const notFound = [];

  for (const email of emails) {
    // Buscar la cuenta madre por email
    const { data, error } = await supabase
      .from('mother_accounts')
      .select('id, email, platform, status, purchase_cost_usdt, purchase_cost_gs, renewal_date, target_billing_day, max_slots, notes')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      console.error(`❌ Error buscando ${email}:`, error.message);
      continue;
    }

    if (!data) {
      console.log(`⚠️  NO ENCONTRADO: ${email}`);
      notFound.push(email);
      continue;
    }

    console.log(`✅ Encontrado: ${email} (ID: ${data.id})`);
    console.log(`   Antes → platform: ${data.platform}, status: ${data.status}, cost_usdt: ${data.purchase_cost_usdt}, cost_gs: ${data.purchase_cost_gs}, renewal: ${data.renewal_date}, billing_day: ${data.target_billing_day}, max_slots: ${data.max_slots}`);

    // Actualizar
    const { error: updateError } = await supabase
      .from('mother_accounts')
      .update(updateData)
      .eq('id', data.id);

    if (updateError) {
      console.error(`❌ Error actualizando ${email}:`, updateError.message);
    } else {
      console.log(`   Después → platform: Netflix, status: active, cost_usd: 10, cost_local: 70000, renewal: 2026-04-06, billing_day: 6, max_slots: 5, notes: (vacío)`);
      found.push(email);
    }

    console.log('');
  }

  console.log('─────────────────────────────────────');
  console.log(`✅ Actualizados exitosamente: ${found.length}/${emails.length}`);
  if (notFound.length > 0) {
    console.log(`⚠️  No encontrados en BD (${notFound.length}):`);
    notFound.forEach(e => console.log(`   - ${e}`));
  }
}

run().catch(console.error);
