#!/usr/bin/env node
/**
 * Script: sync-netflix-customers.js
 * Vincula números de teléfono de clientes a sus slots de Netflix correspondientes.
 * Estrategia:
 *  1. Buscar el slot por email de cuenta madre + identificador de perfil.
 *  2. Buscar cliente existente por teléfono (o crearlo si no existe).
 *  3. Si ya hay una venta activa para ese slot sin cliente → actualizarla.
 *     Si no hay venta activa → crear una nueva venta mínima.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ============================================================
// DATOS PROPORCIONADOS POR EL USUARIO
// formato: [email, perfil (número), teléfono]
// ============================================================
const DATA = [
  ['00_elvish.pinyin@icloud.com',        '2', '34624831503'],
  ['00_elvish.pinyin@icloud.com',        '3', '595983480133'],
  // Perfil 4: No encontrado → omitido
  ['00_elvish.pinyin@icloud.com',        '5', '595986889566'],
  ['06gerund_carrels@icloud.com',        '1', '595982768785'],
  ['06gerund_carrels@icloud.com',        '2', '595983797825'],
  ['06gerund_carrels@icloud.com',        '3', '595982143381'],
  ['06gerund_carrels@icloud.com',        '4', '595981506686'],
  ['06gerund_carrels@icloud.com',        '5', '595973183275'],
  ['06rubr.55gb@nyckz.com',              '1', '595983585000'],
  ['06rubr.55gb@nyckz.com',              '3', '595987381272'],
  ['06rubr.55gb@nyckz.com',              '4', '595986884590'],
  ['06rubr.55gb@nyckz.com',              '5', '595983879667'],
  ['20.spangly_arsenic@icloud.com',      '1', '595985439137'],
  ['20.spangly_arsenic@icloud.com',      '3', '595993335186'],
  ['amybarnes30@nyckel.co',              '1', '595973170242'],
  ['annaji-61us@nyckz.com',              '1', '595986172258'],
  ['annaji-61us@nyckz.com',              '2', '595986284196'],
  ['annaji-61us@nyckz.com',              '3', '595982384730'],
  ['annaji-61us@nyckz.com',              '4', '595994290506'],
  ['annaji-61us@nyckz.com',              '5', '595976113888'],
  ['antimi-3it@nyckz.com',               '1', '595985323513'],
  ['antimi-3it@nyckz.com',               '2', '595985697555'],
  ['antimi-3it@nyckz.com',               '3', '595973852456'],
  ['antimi-3it@nyckz.com',               '4', '595983333435'],
  ['antimi-3it@nyckz.com',               '5', '595987263'],
  ['author-debit5i@icloud.com',          '3', '595982752957'],
  ['author-debit5i@icloud.com',          '4', '595973412109'],
  ['author-debit5i@icloud.com',          '5', '595971760663'],
  ['balks_earthy_8s@icloud.com',         '2', '595973611760'],
  ['balks_earthy_8s@icloud.com',         '4', '595991725162'],
  ['balks_earthy_8s@icloud.com',         '5', '595985759141'],
  ['breayo-40us@nyckz.com',              '1', '595975802387'],
  ['breayo-40us@nyckz.com',              '2', '595991998757'],
  ['brinks.strewn.09@icloud.com',        '1', '595983880064'],
  ['brinks.strewn.09@icloud.com',        '3', '595986588921'],
  ['carrier.swatch0c@icloud.com',        '3', '595986531735'],
  ['claudiapowell4@nyckmail.net',        '1', '595986267871'],
  ['claudiapowell4@nyckmail.net',        '2', '595991755450'],
  ['claudiapowell4@nyckmail.net',        '3', '595991755450'],
  ['clumpy-solver-0n@icloud.com',        '1', '595981846080'],
  ['clumpy-solver-0n@icloud.com',        '2', '595981260182'],
  ['clumpy-solver-0n@icloud.com',        '3', '595982864749'],
  ['clumpy-solver-0n@icloud.com',        '4', '595993261512'],
  ['clumpy-solver-0n@icloud.com',        '5', '595973788858'],
  ['codfish.graze0x@icloud.com',         '1', '34604003531'],
  ['codfish.graze0x@icloud.com',         '2', '595986922526'],
  ['codfish.graze0x@icloud.com',         '3', '595981443497'],
  ['codfish.graze0x@icloud.com',         '4', '595983173818'],
  ['codfish.graze0x@icloud.com',         '5', '595971351434'],
  ['corric.4us@nyckz.com',               '1', '595984767497'],
  ['corric.4us@nyckz.com',               '3', '595986232070'],
  ['corric.4us@nyckz.com',               '4', '595986630862'],
  ['corric.4us@nyckz.com',               '5', '595973680060'],
  ['cya2door@nyckz.com',                 '1', '595981812406'],
  ['cya2door@nyckz.com',                 '2', '595974583619'],
  ['cya2door@nyckz.com',                 '3', '595984531327'],
  ['cya2door@nyckz.com',                 '4', '34613852574'],
  ['cya2door@nyckz.com',                 '5', '595974618397'],
  ['d.ands1@nyckz.com',                  '3', '595981357425'],
  ['d.ands1@nyckz.com',                  '4', '595975885340'],
  ['dan@nyckz.com',                      '4', '595985360802'],
  ['deborah.akridge@nyckmail.com',       '2', '595981815999'],
  ['deborah.akridge@nyckmail.com',       '3', '595985923175'],
  ['deborah.akridge@nyckmail.com',       '4', '595971737226'],
  ['deborah.akridge@nyckmail.com',       '5', '595973840151'],
  ['deoliv-10ca@nyckz.com',              '1', '595973742787'],
  ['deoliv-10ca@nyckz.com',              '2', '595981728034'],
  ['deoliv-10ca@nyckz.com',              '3', '595971490108'],
  ['deoliv-10ca@nyckz.com',              '4', '595972576156'],
  ['deoliv-10ca@nyckz.com',              '5', '595981448044'],
  ['dory.firebug.0h@icloud.com',         '1', '595984460839'],
  ['dory.firebug.0h@icloud.com',         '2', '595973753244'],
  ['dory.firebug.0h@icloud.com',         '3', '595974523317'],
  ['dory.firebug.0h@icloud.com',         '4', '595982652649'],
  ['eilymchamilton@nyckel.co',           '1', '595994949961'],
  ['eilymchamilton@nyckel.co',           '2', '595983222070'],
  ['eilymchamilton@nyckel.co',           '3', '595991536586'],
  ['eilymchamilton@nyckel.co',           '4', '595973503633'],
  ['ericcu.33us@nyckz.com',              '2', '595982903873'],
  ['ericcu.33us@nyckz.com',              '3', '595975332928'],
  ['ericcu.33us@nyckz.com',              '4', '595982176990'],
  ['fernanda.falves@tupopets.com',       '1', '595994363522'],
  ['fernanda.falves@tupopets.com',       '2', '595983295587'],
  ['fernanda.falves@tupopets.com',       '4', '595984420437'],
  ['fernanda.falves@tupopets.com',       '5', '595981920743'],
  ['frizze.26us@nyckz.com',              '1', '595982982573'],
  ['frizze.26us@nyckz.com',              '2', '595984043659'],
  ['frizze.26us@nyckz.com',              '3', '595982735733'],
  ['frizze.26us@nyckz.com',              '4', '595983967654'],
  ['frizze.26us@nyckz.com',              '5', '595991283271'],
  ['hlittl1582@tupopets.net',            '1', '595994244999'],
  ['hlittl1582@tupopets.net',            '2', '595972878675'],
  ['hlittl1582@tupopets.net',            '3', '595973335533'],
  ['hlittl1582@tupopets.net',            '4', '595994671735'],
  ['jfrinaldi@nyckz.com',                '1', '595982777771'],
  ['jfrinaldi@nyckz.com',                '2', '595991835533'],
  ['jfrinaldi@nyckz.com',                '3', '595986333062'],
  ['jfrinaldi@nyckz.com',                '4', '595983837169'],
  ['jfrinaldi@nyckz.com',                '5', '595975831661'],
  ['jojoba_airdrop0u@icloud.com',        '2', '595973701439'],
  ['jojoba_airdrop0u@icloud.com',        '3', '34643668598'],
  ['jojoba_airdrop0u@icloud.com',        '4', '595983119437'],
  ['jojoba_airdrop0u@icloud.com',        '5', '595992345038'],
  ['joseraimundonet@tupopets.com',       '1', '595984014448'],
  ['joseraimundonet@tupopets.com',       '2', '595971884667'],
  ['joseraimundonet@tupopets.com',       '3', '595984868092'],
  ['joseraimundonet@tupopets.com',       '4', '595981423551'],
  ['joseraimundonet@tupopets.com',       '5', '595991316814'],
  ['Jpdlod+christsanort@icloud.com',     '1', '595984492517'],
  ['Jpdlod+christsanort@icloud.com',     '3', '595972809627'],
  ['Jpdlod+christsanort@icloud.com',     '4', '595984949971'],
  ['Jpdlod+lwyman2@icloud.com',          '1', '595973666921'],
  ['Jpdlod+lwyman2@icloud.com',          '2', '595982235991'],
  ['Jpdlod+lwyman2@icloud.com',          '3', '595981372633'],
  ['Jpdlod+lwyman2@icloud.com',          '4', '595971221926'],
  ['Jpdlod+lwyman2@icloud.com',          '5', '595982568210'],
  ['jumper_fiats.2t@icloud.com',         '3', '595986799439'],
  ['jumper_fiats.2t@icloud.com',         '4', '5959365705'],
  ['karolina0808@nyckz.com',             '3', '595984700035'],
  ['karolina0808@nyckz.com',             '4', '595976160174'],
  ['kiema1.62pl@nyckz.com',              '1', '595981878283'],
  ['kiema1.62pl@nyckz.com',              '2', '5493765397729'],
  ['kiema1.62pl@nyckz.com',              '4', '595982936979'],
  ['kody.rollin95@nyckmail.net',         '1', '595973845118'],
  ['kody.rollin95@nyckmail.net',         '2', '595975385055'],
  ['kody.rollin95@nyckmail.net',         '3', '595976478666'],
  ['kody.rollin95@nyckmail.net',         '4', '595992716401'],
  ['kody.rollin95@nyckmail.net',         '5', '595973657478'],
  ['leap.hearer-6s@icloud.com',          '1', '595973834400'],
  ['leap.hearer-6s@icloud.com',          '2', '595991262703'],
  ['leap.hearer-6s@icloud.com',          '3', '595983067850'],
  ['leap.hearer-6s@icloud.com',          '5', '595973885152'],
  ['leilanikapani@tupopets.com',         '2', '595985824579'],
  ['lisaduong2002US@nyckz.com',          '2', '595972793008'],
  ['lisaduong2002US@nyckz.com',          '4', '595976498373'],
  ['lisaduong2002US@nyckz.com',          '5', '595983548248'],
  ['lit-retry-8n@icloud.com',            '2', '595971365188'],
  ['lit-retry-8n@icloud.com',            '3', '595971515493'],
  ['lit-retry-8n@icloud.com',            '4', '595973414739'],
  ['lit-retry-8n@icloud.com',            '5', '595983630408'],
  ['lopez.elvinUS@nyckz.com',            '1', '595991892833'],
  ['lopez.elvinUS@nyckz.com',            '4', '595982212132'],
  ['lopez.elvinUS@nyckz.com',            '5', '34656379291'],
  ['malonehomes@nyckz.com',              '1', '595982173274'],
  ['malonehomes@nyckz.com',              '3', '595991644268'],
  ['mariai.8it@nyckz.com',               '1', '595994180646'],
  ['mariai.8it@nyckz.com',               '2', '595992761987'],
  ['mariai.8it@nyckz.com',               '3', '595972405890'],
  ['mariai.8it@nyckz.com',               '4', '595975433642'],
  ['mariai.8it@nyckz.com',               '5', '595983847044'],
  ['marta-turowska1994@nyckz.com',       '2', '595973643174'],
  ['marta-turowska1994@nyckz.com',       '4', '595973431560'],
  ['massifs.zine.3w@icloud.com',         '2', '595992710591'],
  ['matthewpetillo@nyckmail.net',        '1', '595982061631'],
  ['matthewpetillo@nyckmail.net',        '3', '595986521356'],
  ['matthewpetillo@nyckmail.net',        '4', '595984826383'],
  ['matthewpetillo@nyckmail.net',        '5', '595973431560'],
  ['maxime-3fr@nyckz.com',               '2', '59598149502'],
  ['maxime-3fr@nyckz.com',               '3', '595994292890'],
  ['mendozab06@nyckz.com',               '1', '595992286125'],
  ['mendozab06@nyckz.com',               '4', '595984532152'],
  ['menisci-scrape-2s@icloud.com',       '1', '595975987446'],
  ['menisci-scrape-2s@icloud.com',       '3', '34613885792'],
  ['merrittsmorgan@nyckz.com',           '1', '595994425478'],
  ['merrittsmorgan@nyckz.com',           '2', '595971270694'],
  ['merrittsmorgan@nyckz.com',           '3', '595986661455'],
  ['merrittsmorgan@nyckz.com',           '4', '595986434040'],
  ['merrittsmorgan@nyckz.com',           '5', '595973759663'],
  ['ondase-32us@nyckz.com',              '1', '595991223494'],
  ['ondase-32us@nyckz.com',              '2', '595971835366'],
  ['ondase-32us@nyckz.com',              '4', '595983952756'],
  ['pala-lanzados.01@icloud.com',        '1', '595975512571'],
  ['pala-lanzados.01@icloud.com',        '2', '595985831604'],
  ['pala-lanzados.01@icloud.com',        '3', '595973443931'],
  ['pala-lanzados.01@icloud.com',        '4', '595986412979'],
  ['pala-lanzados.01@icloud.com',        '5', '34603464968'],
  ['pawel1771@nyckz.com',                '4', '595993514835'],
  ['pawel1771@nyckz.com',                '5', '595986670854'],
  ['pemeadows01@nyckmail.net',           '2', '595972741510'],
  ['pemeadows01@nyckmail.net',           '3', '595981585025'],
  ['pemeadows01@nyckmail.net',           '5', '595972740718'],
  ['perrin-69fr@nyckz.com',              '1', '595971727888'],
  ['perrin-69fr@nyckz.com',              '2', '595971727888'],
  ['perrin-69fr@nyckz.com',              '3', '595973514377'],
  ['perrin-69fr@nyckz.com',              '4', '595986111545'],
  ['pileups-yarrow.1h@icloud.com',       '1', '595971565071'],
  ['pileups-yarrow.1h@icloud.com',       '2', '595984160746'],
  ['pileups-yarrow.1h@icloud.com',       '4', '595992594219'],
  ['proof-sworn-7c@icloud.com',          '1', '595986364724'],
  ['proof-sworn-7c@icloud.com',          '2', '595991206536'],
  ['proof-sworn-7c@icloud.com',          '5', '595991642669'],
  ['radius.offset8p@icloud.com',         '1', '595981051343'],
  ['radius.offset8p@icloud.com',         '4', '595973881408'],
  ['radius.offset8p@icloud.com',         '5', '595984987859'],
  ['regina-28us@nyckz.com',              '4', '595984488952'],
  ['regina-28us@nyckz.com',              '5', '595985320215'],
  ['relapse-46-ravine@icloud.com',       '1', '595991206536'],
  ['sagecharles12@nyckmail.net',         '1', '595992584300'],
  ['sagecharles12@nyckmail.net',         '3', '595992247248'],
  ['sagecharles12@nyckmail.net',         '4', '595976915067'],
  ['sagecharles12@nyckmail.net',         '5', '595992277363'],
  ['sales1@nyckz.com',                   '2', '595982846473'],
  ['sales1@nyckz.com',                   '3', '595971886472'],
  ['sales1@nyckz.com',                   '5', '595984774894'],
  ['savoy-silky.1l@icloud.com',          '2', '595983978755'],
  ['savoy-silky.1l@icloud.com',          '3', '595973706773'],
  ['savoy-silky.1l@icloud.com',          '5', '34613195025'],
  ['sdarkin@nyckz.com',                  '5', '595975165984'],
  ['shan.sheldon@nyckz.com',             '1', '595981665354'],
  ['shan.sheldon@nyckz.com',             '2', '595982600108'],
  ['shan.sheldon@nyckz.com',             '3', '595972337132'],
  ['shan.sheldon@nyckz.com',             '4', '595991431858'],
  ['shan.sheldon@nyckz.com',             '5', '595972429016'],
  ['stittl-45us@nyckz.com',              '1', '5959148882'],
  ['stittl-45us@nyckz.com',              '2', '595983181711'],
  ['stittl-45us@nyckz.com',              '3', '595971185734'],
  ['stittl-45us@nyckz.com',              '4', '595975821772'],
  ['stittl-45us@nyckz.com',              '5', '595974612080'],
  ['tamilovesu2@nyckz.com',              '3', '595992265250'],
  ['tamilovesu2@nyckz.com',              '5', '595982918314'],
  ['tendon-hound9i@icloud.com',          '1', '595973660140'],
  ['tendon-hound9i@icloud.com',          '2', '595973735409'],
  ['tendon-hound9i@icloud.com',          '3', '595983139912'],
  ['tendon-hound9i@icloud.com',          '4', '595972167040'],
  ['tendon-hound9i@icloud.com',          '5', '595961518552'],
  ['thanashs01@nyckmail.com',            '2', '595992548218'],
  ['thanashs01@nyckmail.com',            '3', '595992945026'],
  ['thanashs01@nyckmail.com',            '5', '595983891486'],
  ['tmuench7@nyckz.com',                 '1', '595983458705'],
  ['tmuench7@nyckz.com',                 '5', '595982777390'],
  ['tony.marcum11@nyckz.com',            '2', '595983481390'],
  ['tony.marcum11@nyckz.com',            '4', '595982204692'],
  ['venison_quicker.5f@icloud.com',      '1', '595971719684'],
  ['venison_quicker.5f@icloud.com',      '2', '595985247624'],
  ['venison_quicker.5f@icloud.com',      '4', '595982495066'],
  ['venison_quicker.5f@icloud.com',      '5', '595984867786'],
];

// ============================================================
// CONTADORES
// ============================================================
let ok = 0, skipped = 0, errors = 0;
const log = [];

async function findOrCreateCustomer(phone) {
  // Buscar cliente existente por teléfono
  const { data: existing } = await supabase
    .from('customers')
    .select('id, full_name, phone')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) return { customer: existing, created: false };

  // Crear cliente nuevo con solo el teléfono
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({ phone, full_name: `Cliente ${phone}` })
    .select('id, full_name, phone')
    .single();

  if (error) throw new Error(`Error creando cliente ${phone}: ${error.message}`);
  return { customer: newCustomer, created: true };
}

async function processEntry(email, profileNum, phone) {
  const slotIdentifier = `Perfil ${profileNum}`;

  // 1. Buscar cuenta madre por email (case-insensitive)
  const { data: account } = await supabase
    .from('mother_accounts')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle();

  if (!account) {
    return { status: 'SKIP', reason: `Cuenta madre no encontrada: ${email}` };
  }

  // 2. Buscar slot
  const { data: slot } = await supabase
    .from('sale_slots')
    .select('id, status, slot_identifier')
    .eq('mother_account_id', account.id)
    .eq('slot_identifier', slotIdentifier)
    .maybeSingle();

  if (!slot) {
    return { status: 'SKIP', reason: `Slot no encontrado: ${email} - ${slotIdentifier}` };
  }

  // 3. Buscar o crear cliente
  const { customer, created: customerCreated } = await findOrCreateCustomer(phone);

  // 4. Buscar venta activa para este slot
  const { data: existingSale } = await supabase
    .from('sales')
    .select('id, customer_id')
    .eq('slot_id', slot.id)
    .eq('is_active', true)
    .maybeSingle();

  if (existingSale) {
    if (existingSale.customer_id) {
      // La venta ya tiene un cliente → no sobreescribir
      return { status: 'SKIP', reason: `Venta ya tiene cliente asignado. Slot: ${slotIdentifier}` };
    }
    // Actualizar customer_id en la venta existente
    const { error } = await supabase
      .from('sales')
      .update({ customer_id: customer.id })
      .eq('id', existingSale.id);

    if (error) throw new Error(`Error actualizando venta ${existingSale.id}: ${error.message}`);
    return { status: 'OK', action: `Venta actualizada (cliente ${customerCreated ? 'CREADO' : 'existente'})` };
  }

  // 5. No hay venta activa → crear una nueva
  const { error: saleError } = await supabase
    .from('sales')
    .insert({
      slot_id: slot.id,
      customer_id: customer.id,
      is_active: true,
      amount_gs: 0,
      original_price_gs: 0,
      override_price: false,
      payment_method: 'cash',
      start_date: new Date().toISOString().split('T')[0],
      end_date: null,
    });


  if (saleError) throw new Error(`Error creando venta para slot ${slot.id}: ${saleError.message}`);

  // Asegurar que el slot quede como sold
  if (slot.status !== 'sold') {
    await supabase.from('sale_slots').update({ status: 'sold' }).eq('id', slot.id);
  }

  return { status: 'OK', action: `Venta CREADA (cliente ${customerCreated ? 'CREADO' : 'existente'})` };
}

async function main() {
  console.log(`\n🚀 Iniciando sincronización de ${DATA.length} entradas...\n`);

  for (const [email, profileNum, phone] of DATA) {
    const label = `${email} - Perfil ${profileNum} (${phone})`;
    try {
      const result = await processEntry(email, profileNum, phone);
      if (result.status === 'OK') {
        ok++;
        console.log(`✅ ${label} → ${result.action}`);
      } else {
        skipped++;
        console.log(`⏭️  SKIP: ${label} → ${result.reason}`);
      }
      log.push({ label, ...result });
    } catch (err) {
      errors++;
      console.error(`❌ ERROR: ${label} → ${err.message}`);
      log.push({ label, status: 'ERROR', reason: err.message });
    }
  }

  console.log('\n============================================');
  console.log(`✅ OK:       ${ok}`);
  console.log(`⏭️  Saltados: ${skipped}`);
  console.log(`❌ Errores:  ${errors}`);
  console.log('============================================\n');

  if (errors > 0) {
    console.log('Entradas con error:');
    log.filter(l => l.status === 'ERROR').forEach(l => console.log(` - ${l.label}: ${l.reason}`));
  }
}

main().catch(console.error);
