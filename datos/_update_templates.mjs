import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Actualizar vencimiento_hoy → "vence hoy"
const { error: e1 } = await supabase
  .from('whatsapp_templates')
  .update({
    message: `Hola 👋\n\nTu servicio de *{plataforma}* vence hoy.\n\n💰 Precio renovación: Gs. {precio}\n\nSi querés seguir disfrutando, respondé RENOVAR o contactanos.`,
    updated_at: new Date().toISOString(),
  })
  .eq('key', 'vencimiento_hoy');

if (e1) console.error('❌ Error actualizando vencimiento_hoy:', e1.message);
else console.log('✅ vencimiento_hoy actualizado');

// 2. Crear (o actualizar) vencimiento_vencido → "venció el {fecha}"
const { data: existing } = await supabase
  .from('whatsapp_templates')
  .select('id')
  .eq('key', 'vencimiento_vencido')
  .maybeSingle();

if (existing) {
  const { error: e2 } = await supabase
    .from('whatsapp_templates')
    .update({
      message: `Hola 👋\n\nTu servicio de *{plataforma}* venció el {fecha_vencimiento}.\n\n💰 Precio renovación: Gs. {precio}\n\nSi querés seguir disfrutando, respondé RENOVAR o contactanos.`,
      updated_at: new Date().toISOString(),
    })
    .eq('key', 'vencimiento_vencido');
  if (e2) console.error('❌ Error actualizando vencimiento_vencido:', e2.message);
  else console.log('✅ vencimiento_vencido actualizado');
} else {
  const { error: e3 } = await supabase
    .from('whatsapp_templates')
    .insert({
      key: 'vencimiento_vencido',
      name: 'Servicio Vencido',
      message: `Hola 👋\n\nTu servicio de *{plataforma}* venció el {fecha_vencimiento}.\n\n💰 Precio renovación: Gs. {precio}\n\nSi querés seguir disfrutando, respondé RENOVAR o contactanos.`,
      enabled: true,
    });
  if (e3) console.error('❌ Error creando vencimiento_vencido:', e3.message);
  else console.log('✅ vencimiento_vencido creado');
}
