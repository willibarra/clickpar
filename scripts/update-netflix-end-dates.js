#!/usr/bin/env node
/**
 * Script: update-netflix-end-dates.js
 * Actualiza el end_date de las ventas de slots Netflix.
 * REGLA: Si la venta ya tiene end_date = hoy (2026-03-12) o ayer (2026-03-11), NO modificar.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Fecha actual y ayer (hora local PY = UTC-3)
const TODAY = '2026-03-12';
const YESTERDAY = '2026-03-11';

// ============================================================
// DATOS: [email, número de perfil, fecha de vencimiento]
// ============================================================
const DATA = [
  ['00_elvish.pinyin@icloud.com',        '2', '2026-03-28'],
  ['00_elvish.pinyin@icloud.com',        '3', '2026-03-10'],
  // Perfil 4: No encontrado → omitido
  ['00_elvish.pinyin@icloud.com',        '5', '2026-04-01'],
  ['06gerund_carrels@icloud.com',        '1', '2026-04-03'],
  ['06gerund_carrels@icloud.com',        '2', '2026-04-07'],
  ['06gerund_carrels@icloud.com',        '3', '2026-04-04'],
  ['06gerund_carrels@icloud.com',        '4', '2026-03-10'],
  ['06gerund_carrels@icloud.com',        '5', '2026-03-26'],
  ['06rubr.55gb@nyckz.com',              '1', '2026-03-29'],
  ['06rubr.55gb@nyckz.com',              '3', '2026-03-31'],
  ['06rubr.55gb@nyckz.com',              '4', '2026-04-03'],
  ['06rubr.55gb@nyckz.com',              '5', '2026-03-31'],
  ['20.spangly_arsenic@icloud.com',      '1', '2026-03-29'],
  ['20.spangly_arsenic@icloud.com',      '3', '2026-03-30'],
  ['amybarnes30@nyckel.co',              '1', '2026-04-05'],
  ['annaji-61us@nyckz.com',              '1', '2026-03-27'],
  ['annaji-61us@nyckz.com',              '2', '2026-08-05'],
  ['annaji-61us@nyckz.com',              '3', '2026-04-04'],
  ['annaji-61us@nyckz.com',              '4', '2026-03-30'],
  ['annaji-61us@nyckz.com',              '5', '2026-03-21'],
  ['antimi-3it@nyckz.com',               '1', '2026-03-15'],
  ['antimi-3it@nyckz.com',               '2', '2026-03-17'],
  ['antimi-3it@nyckz.com',               '3', '2026-04-06'],
  ['antimi-3it@nyckz.com',               '4', '2026-04-02'],
  ['antimi-3it@nyckz.com',               '5', '2026-03-31'],
  ['author-debit5i@icloud.com',          '3', '2026-03-22'],
  ['author-debit5i@icloud.com',          '4', '2026-04-08'],
  ['author-debit5i@icloud.com',          '5', '2026-03-22'],
  ['balks_earthy_8s@icloud.com',         '2', '2026-04-20'],
  ['balks_earthy_8s@icloud.com',         '4', '2026-04-05'],
  ['balks_earthy_8s@icloud.com',         '5', '2026-03-22'],
  ['breayo-40us@nyckz.com',              '1', '2026-03-19'],
  ['breayo-40us@nyckz.com',              '2', '2026-05-09'],
  ['brinks.strewn.09@icloud.com',        '1', '2026-03-30'],
  ['brinks.strewn.09@icloud.com',        '3', '2026-03-30'],
  ['carrier.swatch0c@icloud.com',        '3', '2026-03-18'],
  ['claudiapowell4@nyckmail.net',        '1', '2026-03-26'],
  ['claudiapowell4@nyckmail.net',        '2', '2026-03-19'],
  ['claudiapowell4@nyckmail.net',        '3', '2026-03-19'],
  ['clumpy-solver-0n@icloud.com',        '1', '2026-03-28'],
  ['clumpy-solver-0n@icloud.com',        '2', '2026-03-19'],
  ['clumpy-solver-0n@icloud.com',        '3', '2026-03-30'],
  ['clumpy-solver-0n@icloud.com',        '4', '2026-03-19'],
  ['clumpy-solver-0n@icloud.com',        '5', '2026-03-31'],
  ['codfish.graze0x@icloud.com',         '1', '2026-05-14'],
  ['codfish.graze0x@icloud.com',         '2', '2026-03-31'],
  ['codfish.graze0x@icloud.com',         '3', '2026-04-08'],
  ['codfish.graze0x@icloud.com',         '4', '2026-03-21'],
  ['codfish.graze0x@icloud.com',         '5', '2026-04-04'],
  ['corric.4us@nyckz.com',               '1', '2026-03-12'],
  ['corric.4us@nyckz.com',               '3', '2026-03-28'],
  ['corric.4us@nyckz.com',               '4', '2026-03-23'],
  ['corric.4us@nyckz.com',               '5', '2026-05-20'],
  ['cya2door@nyckz.com',                 '1', '2026-03-19'],
  ['cya2door@nyckz.com',                 '2', '2026-03-12'],
  ['cya2door@nyckz.com',                 '3', '2026-03-14'],
  ['cya2door@nyckz.com',                 '4', '2026-05-26'],
  ['cya2door@nyckz.com',                 '5', '2026-04-18'],
  ['d.ands1@nyckz.com',                  '3', '2026-03-16'],
  ['d.ands1@nyckz.com',                  '4', '2026-03-26'],
  ['dan@nyckz.com',                      '4', '2026-04-02'],
  ['deborah.akridge@nyckmail.com',       '2', '2026-03-30'],
  ['deborah.akridge@nyckmail.com',       '3', '2026-04-08'],
  ['deborah.akridge@nyckmail.com',       '4', '2026-03-29'],
  ['deborah.akridge@nyckmail.com',       '5', '2026-03-27'],
  ['deoliv-10ca@nyckz.com',              '1', '2026-03-12'],
  ['deoliv-10ca@nyckz.com',              '2', '2026-03-13'],
  ['deoliv-10ca@nyckz.com',              '3', '2026-03-24'],
  ['deoliv-10ca@nyckz.com',              '4', '2026-04-06'],
  ['deoliv-10ca@nyckz.com',              '5', '2026-03-24'],
  ['dory.firebug.0h@icloud.com',         '1', '2026-04-05'],
  ['dory.firebug.0h@icloud.com',         '2', '2026-03-29'],
  ['dory.firebug.0h@icloud.com',         '3', '2026-03-17'],
  ['dory.firebug.0h@icloud.com',         '4', '2026-03-22'],
  ['eilymchamilton@nyckel.co',           '1', '2026-03-15'],
  ['eilymchamilton@nyckel.co',           '2', '2026-03-26'],
  ['eilymchamilton@nyckel.co',           '3', '2026-03-26'],
  ['eilymchamilton@nyckel.co',           '4', '2026-04-08'],
  ['ericcu.33us@nyckz.com',              '2', '2026-03-29'],
  ['ericcu.33us@nyckz.com',              '3', '2026-04-01'],
  ['ericcu.33us@nyckz.com',              '4', '2026-03-25'],
  ['fernanda.falves@tupopets.com',       '1', '2026-03-15'],
  ['fernanda.falves@tupopets.com',       '2', '2026-04-17'],
  ['fernanda.falves@tupopets.com',       '4', '2026-04-05'],
  ['fernanda.falves@tupopets.com',       '5', '2026-03-22'],
  ['frizze.26us@nyckz.com',              '1', '2026-04-03'],
  ['frizze.26us@nyckz.com',              '2', '2026-03-30'],
  ['frizze.26us@nyckz.com',              '3', '2026-04-01'],
  ['frizze.26us@nyckz.com',              '4', '2026-05-04'],
  ['frizze.26us@nyckz.com',              '5', '2026-03-21'],
  ['hlittl1582@tupopets.net',            '1', '2026-03-26'],
  ['hlittl1582@tupopets.net',            '2', '2026-05-20'],
  ['hlittl1582@tupopets.net',            '3', '2026-03-12'],
  ['hlittl1582@tupopets.net',            '4', '2026-03-30'],
  ['jfrinaldi@nyckz.com',                '1', '2026-03-12'],
  ['jfrinaldi@nyckz.com',                '2', '2026-04-01'],
  ['jfrinaldi@nyckz.com',                '3', '2026-04-05'],
  ['jfrinaldi@nyckz.com',                '4', '2026-04-01'],
  ['jfrinaldi@nyckz.com',                '5', '2026-03-19'],
  ['jojoba_airdrop0u@icloud.com',        '2', '2026-04-08'],
  ['jojoba_airdrop0u@icloud.com',        '3', '2026-04-02'],
  ['jojoba_airdrop0u@icloud.com',        '4', '2026-04-04'],
  ['jojoba_airdrop0u@icloud.com',        '5', '2026-03-23'],
  ['joseraimundonet@tupopets.com',       '1', '2026-04-10'],
  ['joseraimundonet@tupopets.com',       '2', '2026-05-17'],
  ['joseraimundonet@tupopets.com',       '3', '2026-04-03'],
  ['joseraimundonet@tupopets.com',       '4', '2026-03-22'],
  ['joseraimundonet@tupopets.com',       '5', '2026-03-30'],
  ['Jpdlod+christsanort@icloud.com',     '1', '2026-03-31'],
  ['Jpdlod+christsanort@icloud.com',     '3', '2026-03-16'],
  ['Jpdlod+christsanort@icloud.com',     '4', '2026-03-12'],
  ['Jpdlod+lwyman2@icloud.com',          '1', '2026-03-17'],
  ['Jpdlod+lwyman2@icloud.com',          '2', '2026-04-25'],
  ['Jpdlod+lwyman2@icloud.com',          '3', '2026-04-08'],
  ['Jpdlod+lwyman2@icloud.com',          '4', '2026-05-13'],
  ['Jpdlod+lwyman2@icloud.com',          '5', '2026-03-28'],
  ['jumper_fiats.2t@icloud.com',         '3', '2026-04-24'],
  ['jumper_fiats.2t@icloud.com',         '4', '2026-04-04'],
  ['karolina0808@nyckz.com',             '3', '2026-03-20'],
  ['karolina0808@nyckz.com',             '4', '2026-03-17'],
  ['kiema1.62pl@nyckz.com',              '1', '2026-03-25'],
  ['kiema1.62pl@nyckz.com',              '2', '2026-03-25'],
  ['kiema1.62pl@nyckz.com',              '4', '2026-03-26'],
  ['kody.rollin95@nyckmail.net',         '1', '2026-04-01'],
  ['kody.rollin95@nyckmail.net',         '2', '2026-03-30'],
  ['kody.rollin95@nyckmail.net',         '3', '2026-03-22'],
  ['kody.rollin95@nyckmail.net',         '4', '2026-03-29'],
  ['kody.rollin95@nyckmail.net',         '5', '2026-03-29'],
  ['leap.hearer-6s@icloud.com',          '1', '2026-04-02'],
  ['leap.hearer-6s@icloud.com',          '2', '2026-03-30'],
  ['leap.hearer-6s@icloud.com',          '3', '2026-03-30'],
  ['leap.hearer-6s@icloud.com',          '5', '2026-04-03'],
  ['leilanikapani@tupopets.com',         '2', '2026-03-30'],
  ['lisaduong2002US@nyckz.com',          '2', '2026-03-17'],
  ['lisaduong2002US@nyckz.com',          '4', '2026-03-20'],
  ['lisaduong2002US@nyckz.com',          '5', '2026-03-29'],
  ['lit-retry-8n@icloud.com',            '2', '2026-04-03'],
  ['lit-retry-8n@icloud.com',            '3', '2026-03-17'],
  ['lit-retry-8n@icloud.com',            '4', '2026-04-01'],
  ['lit-retry-8n@icloud.com',            '5', '2026-03-30'],
  ['lopez.elvinUS@nyckz.com',            '1', '2026-04-14'],
  ['lopez.elvinUS@nyckz.com',            '4', '2026-05-01'],
  ['lopez.elvinUS@nyckz.com',            '5', '2026-04-08'],
  ['malonehomes@nyckz.com',              '1', '2026-03-28'],
  ['malonehomes@nyckz.com',              '3', '2026-05-02'],
  ['mariai.8it@nyckz.com',               '1', '2026-03-18'],
  ['mariai.8it@nyckz.com',               '2', '2026-03-24'],
  ['mariai.8it@nyckz.com',               '3', '2026-04-02'],
  ['mariai.8it@nyckz.com',               '4', '2026-04-03'],
  ['mariai.8it@nyckz.com',               '5', '2026-03-23'],
  ['marta-turowska1994@nyckz.com',       '2', '2026-06-20'],
  ['marta-turowska1994@nyckz.com',       '4', '2026-03-20'],
  ['massifs.zine.3w@icloud.com',         '2', '2026-04-24'],
  ['matthewpetillo@nyckmail.net',        '1', '2026-03-30'],
  ['matthewpetillo@nyckmail.net',        '3', '2026-04-15'],
  ['matthewpetillo@nyckmail.net',        '4', '2026-03-27'],
  ['matthewpetillo@nyckmail.net',        '5', '2026-03-20'],
  ['maxime-3fr@nyckz.com',               '2', '2026-03-26'],
  ['maxime-3fr@nyckz.com',               '3', '2026-03-30'],
  ['mendozab06@nyckz.com',               '1', '2026-03-22'],
  ['mendozab06@nyckz.com',               '4', '2026-04-05'],
  ['menisci-scrape-2s@icloud.com',       '1', '2026-03-23'],
  ['menisci-scrape-2s@icloud.com',       '3', '2026-03-23'],
  ['merrittsmorgan@nyckz.com',           '1', '2026-04-21'],
  ['merrittsmorgan@nyckz.com',           '2', '2026-04-22'],
  ['merrittsmorgan@nyckz.com',           '3', '2026-03-30'],
  ['merrittsmorgan@nyckz.com',           '4', '2026-04-07'],
  ['merrittsmorgan@nyckz.com',           '5', '2026-03-20'],
  ['ondase-32us@nyckz.com',              '1', '2026-03-23'],
  ['ondase-32us@nyckz.com',              '2', '2026-03-28'],
  ['ondase-32us@nyckz.com',              '4', '2026-04-13'],
  ['pala-lanzados.01@icloud.com',        '1', '2026-04-01'],
  ['pala-lanzados.01@icloud.com',        '2', '2026-03-18'],
  ['pala-lanzados.01@icloud.com',        '3', '2026-03-28'],
  ['pala-lanzados.01@icloud.com',        '4', '2026-04-07'],
  ['pala-lanzados.01@icloud.com',        '5', '2026-03-22'],
  ['pawel1771@nyckz.com',                '4', '2026-03-10'],
  ['pawel1771@nyckz.com',                '5', '2026-04-10'],
  ['pemeadows01@nyckmail.net',           '2', '2026-03-21'],
  ['pemeadows01@nyckmail.net',           '3', '2026-03-28'],
  ['pemeadows01@nyckmail.net',           '5', '2026-03-14'],
  ['perrin-69fr@nyckz.com',              '1', '2026-03-30'],
  ['perrin-69fr@nyckz.com',              '2', '2026-03-30'],
  ['perrin-69fr@nyckz.com',              '3', '2026-03-14'],
  ['perrin-69fr@nyckz.com',              '4', '2026-03-30'],
  ['pileups-yarrow.1h@icloud.com',       '1', '2026-03-13'],
  ['pileups-yarrow.1h@icloud.com',       '2', '2026-04-03'],
  ['pileups-yarrow.1h@icloud.com',       '4', '2026-06-02'],
  ['proof-sworn-7c@icloud.com',          '1', '2026-03-31'],
  ['proof-sworn-7c@icloud.com',          '2', '2026-03-16'],
  ['proof-sworn-7c@icloud.com',          '5', '2026-03-29'],
  ['radius.offset8p@icloud.com',         '1', '2026-04-01'],
  ['radius.offset8p@icloud.com',         '4', '2026-06-02'],
  ['radius.offset8p@icloud.com',         '5', '2026-03-22'],
  ['regina-28us@nyckz.com',              '4', '2026-03-27'],
  ['regina-28us@nyckz.com',              '5', '2026-05-13'],
  ['relapse-46-ravine@icloud.com',       '1', '2026-03-16'],
  ['sagecharles12@nyckmail.net',         '1', '2026-04-25'],
  ['sagecharles12@nyckmail.net',         '3', '2026-03-23'],
  ['sagecharles12@nyckmail.net',         '4', '2026-03-26'],
  ['sagecharles12@nyckmail.net',         '5', '2026-03-12'],
  ['savoy-silky.1l@icloud.com',          '2', '2026-06-08'],
  ['savoy-silky.1l@icloud.com',          '3', '2026-03-29'],
  ['savoy-silky.1l@icloud.com',          '5', '2026-03-20'],
  ['sdarkin@nyckz.com',                  '5', '2026-03-27'],
  ['shan.sheldon@nyckz.com',             '1', '2026-03-23'],
  ['shan.sheldon@nyckz.com',             '2', '2026-04-05'],
  ['shan.sheldon@nyckz.com',             '3', '2026-04-02'],
  ['shan.sheldon@nyckz.com',             '4', '2026-03-16'],
  ['shan.sheldon@nyckz.com',             '5', '2026-05-19'],
  ['stittl-45us@nyckz.com',              '1', '2026-04-04'],
  ['stittl-45us@nyckz.com',              '2', '2026-03-21'],
  ['stittl-45us@nyckz.com',              '3', '2026-03-28'],
  ['stittl-45us@nyckz.com',              '4', '2026-03-25'],
  ['stittl-45us@nyckz.com',              '5', '2026-03-09'],
  ['tamilovesu2@nyckz.com',              '3', '2026-04-03'],
  ['tamilovesu2@nyckz.com',              '5', '2026-03-21'],
  ['tendon-hound9i@icloud.com',          '1', '2026-05-12'],
  ['tendon-hound9i@icloud.com',          '2', '2026-04-05'],
  ['tendon-hound9i@icloud.com',          '3', '2026-03-31'],
  ['tendon-hound9i@icloud.com',          '4', '2026-03-06'],
  ['tendon-hound9i@icloud.com',          '5', '2026-04-22'],
  ['thanashs01@nyckmail.com',            '2', '2026-03-08'],
  ['thanashs01@nyckmail.com',            '3', '2026-03-12'],
  ['thanashs01@nyckmail.com',            '5', '2026-03-23'],
  ['tmuench7@nyckz.com',                 '1', '2026-03-28'],
  ['tmuench7@nyckz.com',                 '5', '2026-03-23'],
  ['tony.marcum11@nyckz.com',            '2', '2026-03-24'],
  ['tony.marcum11@nyckz.com',            '4', '2026-03-23'],
  ['venison_quicker.5f@icloud.com',      '1', '2026-04-06'],
  ['venison_quicker.5f@icloud.com',      '2', '2026-03-12'],
  ['venison_quicker.5f@icloud.com',      '4', '2026-03-30'],
  ['venison_quicker.5f@icloud.com',      '5', '2026-03-06'],
];

let updated = 0, skippedRecent = 0, skippedNoSale = 0, errors = 0;

async function processEntry(email, profileNum, newEndDate) {
  const slotIdentifier = `Perfil ${profileNum}`;
  const label = `${email} - ${slotIdentifier}`;

  // 1. Buscar cuenta madre
  const { data: account } = await supabase
    .from('mother_accounts')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (!account) return { status: 'SKIP_NO_SALE', reason: 'Cuenta no encontrada' };

  // 2. Buscar slot
  const { data: slot } = await supabase
    .from('sale_slots')
    .select('id')
    .eq('mother_account_id', account.id)
    .eq('slot_identifier', slotIdentifier)
    .maybeSingle();

  if (!slot) return { status: 'SKIP_NO_SALE', reason: 'Slot no encontrado' };

  // 3. Buscar venta activa
  const { data: sale } = await supabase
    .from('sales')
    .select('id, end_date')
    .eq('slot_id', slot.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!sale) return { status: 'SKIP_NO_SALE', reason: 'Venta activa no encontrada' };

  // 4. Verificar si el end_date actual es hoy o ayer → no tocar
  const currentEndDate = sale.end_date ? sale.end_date.substring(0, 10) : null;
  if (currentEndDate === TODAY || currentEndDate === YESTERDAY) {
    return { status: 'SKIP_RECENT', reason: `end_date actual es ${currentEndDate} (hoy/ayer)` };
  }

  // 5. Actualizar end_date
  const { error } = await supabase
    .from('sales')
    .update({ end_date: newEndDate })
    .eq('id', sale.id);

  if (error) throw new Error(error.message);

  return { status: 'OK', old: currentEndDate, new: newEndDate };
}

async function main() {
  console.log(`\n🗓️  Actualizando fechas de vencimiento (${DATA.length} entradas)...`);
  console.log(`📅 Hoy: ${TODAY} | Ayer: ${YESTERDAY} (no se tocarán estos)\n`);

  for (const [email, profileNum, endDate] of DATA) {
    const label = `${email} - Perfil ${profileNum}`;
    try {
      const result = await processEntry(email, profileNum, endDate);
      if (result.status === 'OK') {
        updated++;
        console.log(`✅ ${label}: ${result.old || 'NULL'} → ${result.new}`);
      } else if (result.status === 'SKIP_RECENT') {
        skippedRecent++;
        console.log(`🛡️  PROTEGIDO: ${label} (${result.reason})`);
      } else {
        skippedNoSale++;
        console.log(`⏭️  SKIP: ${label} → ${result.reason}`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ ERROR: ${label} → ${err.message}`);
    }
  }

  console.log('\n============================================');
  console.log(`✅ Actualizados:    ${updated}`);
  console.log(`🛡️  Protegidos:     ${skippedRecent}`);
  console.log(`⏭️  Sin venta:      ${skippedNoSale}`);
  console.log(`❌ Errores:        ${errors}`);
  console.log('============================================\n');
}

main().catch(console.error);
