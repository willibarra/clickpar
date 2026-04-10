import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const variants = [
  // Variante 1
`⚠️ *Recordatorio de Pago*

Hola {nombre}, te recordamos que el pago de tu servicio de *{plataforma}* se encuentra pendiente.

💰 Renovación: Gs. {precio}

si desea renovar nos decis con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje`,

  // Variante 2
`⚠️ *Recordatorio de Pago*

Hola {nombre}, te avisamos que tu servicio de *{plataforma}* tiene el pago pendiente.

💰 Renovación: Gs. {precio}

si deseas renovar indicanos el metodo de pago.
de lo contrario si ya no necesitas ignorar este mensaje`,

  // Variante 3
`⚠️ *Recordatorio de Pago*

Hola {nombre}, te informamos que el pago de tu *{plataforma}* aún no fue realizado.

💰 Renovación: Gs. {precio}

si desea renovar nos avisa con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje`,

  // Variante 4
`⚠️ *Recordatorio de Pago*

Hola {nombre}, queremos recordarte que tu servicio de *{plataforma}* está pendiente de pago.

💰 Renovación: Gs. {precio}

si desea renovar nos comenta con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje`,

  // Variante 5
`⚠️ *Recordatorio de Pago*

Hola {nombre}, te escribimos para recordarte que el pago de *{plataforma}* se encuentra pendiente.

💰 Renovación: Gs. {precio}

si deseas renovar decinos el metodo de pago.
de lo contrario si ya no necesitas ignorar este mensaje`,
];

async function main() {
  const { data: templates, error } = await supabase
    .from('whatsapp_templates')
    .select('id, key, name, variant, message')
    .eq('key', 'vencimiento_vencido')
    .order('variant');

  if (error) {
    console.error('Error fetching templates:', error);
    return;
  }

  console.log(`Found ${templates.length} vencimiento_vencido templates\n`);

  for (const t of templates) {
    const newMsg = variants[t.variant - 1];
    if (!newMsg) { console.error(`No variant text for variant ${t.variant}`); continue; }

    console.log(`Updating variant ${t.variant} (id: ${t.id})...`);
    
    const { error: updateErr } = await supabase
      .from('whatsapp_templates')
      .update({ 
        name: 'Recordatorio de Pago',
        message: newMsg,
        updated_at: new Date().toISOString()
      })
      .eq('id', t.id);

    if (updateErr) {
      console.error(`  ❌ Error:`, updateErr.message);
    } else {
      console.log(`  ✅ Updated`);
    }
  }

  // Verify
  const { data: updated } = await supabase
    .from('whatsapp_templates')
    .select('id, key, name, variant, message')
    .eq('key', 'vencimiento_vencido')
    .order('variant');

  console.log('\n=== VERIFICATION ===');
  for (const t of updated) {
    console.log(`\nVariant ${t.variant}:`);
    console.log(t.message);
    console.log('---');
  }
}

main();
