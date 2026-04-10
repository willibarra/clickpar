// Temporary script to add the variant column via a temp API + seed templates
// Uses the Supabase Management API (port 8000 on self-hosted)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.clickpar.shop';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    
    console.log('=== Step 1: Creating temp RPC function for DDL ===');
    
    // First, try creating a temporary function using PostgREST
    // Since we can't run DDL via REST, we'll create a database function via the special schema endpoint
    // Actually, we can use the rpc approach: first create the function, then call it
    
    // Alternative approach: Use the SQL endpoint that self-hosted Supabase exposes
    // Self-hosted Supabase typically has a pg-meta endpoint
    
    // Try pg-meta API (meta is at /pg/)
    const metaEndpoints = [
        `${SUPABASE_URL}/pg/query`,
        `${SUPABASE_URL}/pg-meta/query`,  
    ];
    
    const ddlSQL = `
        ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS variant integer DEFAULT 1;
        UPDATE whatsapp_templates SET variant = 1 WHERE variant IS NULL;
        ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_key_variant_unique;
        ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_templates_key_variant_unique UNIQUE (key, variant);
    `;
    
    let ddlDone = false;
    
    for (const endpoint of metaEndpoints) {
        try {
            console.log(`  Trying ${endpoint}...`);
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                },
                body: JSON.stringify({ query: ddlSQL }),
            });
            console.log(`  Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                console.log('  DDL Response:', JSON.stringify(data).slice(0, 200));
                ddlDone = true;
                break;
            } else {
                const text = await res.text();
                console.log('  Error:', text.slice(0, 200));
            }
        } catch (e) {
            console.log(`  Failed: ${e.message}`);
        }
    }
    
    if (!ddlDone) {
        console.log('\n  ⚠️ Could not run DDL via REST. Trying alternative: direct insert with variant field...');
        // In self-hosted Supabase, PostgREST might auto-accept the variant field if Postgres has it
        // Let's try inserting a test row with variant to see if the column exists
        const { data: testInsert, error: testErr } = await supabase
            .from('whatsapp_templates')
            .insert({
                key: '_test_variant',
                name: 'Test',
                message: 'test',
                variant: 1,
                enabled: false,
            })
            .select('id');
        
        if (testErr) {
            if (testErr.message.includes('variant')) {
                console.log('\n❌ The variant column does not exist. You need to run this SQL manually:');
                console.log('─'.repeat(60));
                console.log(ddlSQL);
                console.log('─'.repeat(60));
                console.log('\nRun it in your Supabase SQL editor at:');
                console.log(`${SUPABASE_URL.replace('db.', '')}/project/default/sql`);
                console.log('Or via psql on your VPS.');
                console.log('\nThen re-run: node supabase/migrations/run_template_variants.js');
                return;
            }
            console.log('  Test insert error (non-variant):', testErr.message);
        } else {
            console.log('  ✅ variant column already exists! Cleaning up test...');
            await supabase.from('whatsapp_templates').delete().eq('key', '_test_variant');
            ddlDone = true;
        }
    }
    
    if (!ddlDone) return;
    
    // Now seed templates
    console.log('\n=== Step 2: Deleting existing templates ===');
    const { error: delErr } = await supabase
        .from('whatsapp_templates')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (delErr) {
        console.error('  Delete error:', delErr.message);
        return;
    }
    console.log('  ✅ Cleared');
    
    console.log('\n=== Step 3: Inserting 25 template variants ===');
    const templates = [
        // CREDENCIALES ACTUALIZADAS
        { key: 'credenciales_actualizadas', name: 'Credenciales Actualizadas', variant: 1, enabled: true, message: 'Hola {nombre} 😊\n\nLas credenciales de tu *{plataforma}* fueron actualizadas:\n\n📧 Nuevo email: {email}\n🔑 Nueva contraseña: {password}\n📺 Tu perfil: {perfil}\n🔒 PIN: {pin}\n\nSi tenés dudas, escribinos.' },
        { key: 'credenciales_actualizadas', name: 'Credenciales Actualizadas', variant: 2, enabled: true, message: 'Hey {nombre}! 👋\n\nActualizamos los datos de tu *{plataforma}*:\n\n✉️ Email: {email}\n🔐 Contraseña: {password}\n👤 Perfil: {perfil}\n🔢 PIN: {pin}\n\nCualquier consulta, estamos para ayudarte.' },
        { key: 'credenciales_actualizadas', name: 'Credenciales Actualizadas', variant: 3, enabled: true, message: '{nombre}, te informamos que tus datos de *{plataforma}* cambiaron 🔄\n\n📩 Email: {email}\n🗝️ Pass: {password}\n🖥️ Perfil: {perfil}\n📌 PIN: {pin}\n\nGuardá estos datos. ¡Saludos!' },
        { key: 'credenciales_actualizadas', name: 'Credenciales Actualizadas', variant: 4, enabled: true, message: 'Hola {nombre}! 🙌\n\nTus nuevas credenciales de *{plataforma}* están listas:\n\n📬 Email: {email}\n🔑 Contraseña: {password}\n📺 Perfil: {perfil}\n🔒 PIN: {pin}\n\nEscribinos si necesitás ayuda.' },
        { key: 'credenciales_actualizadas', name: 'Credenciales Actualizadas', variant: 5, enabled: true, message: 'Buenas {nombre} ✌️\n\nTe compartimos tus credenciales actualizadas de *{plataforma}*:\n\n📧 Correo: {email}\n🔐 Clave: {password}\n👤 Perfil asignado: {perfil}\n🔢 PIN: {pin}\n\nCualquier duda nos avisás.' },
        // PRE-VENCIMIENTO
        { key: 'pre_vencimiento', name: 'Pre-Vencimiento', variant: 1, enabled: true, message: 'Hola 👋\n\nTu suscripción de *{plataforma}* vence en {dias_restantes} días ({fecha_vencimiento}).\n\n💰 Renovar: Gs. {precio}\n\n¿Querés renovar? Respondé este mensaje.' },
        { key: 'pre_vencimiento', name: 'Pre-Vencimiento', variant: 2, enabled: true, message: 'Hey {nombre}! ⏰\n\nTe recordamos que tu *{plataforma}* vence el {fecha_vencimiento} (en {dias_restantes} días).\n\n💵 Precio de renovación: Gs. {precio}\n\nEscribinos para renovar y seguir disfrutando del servicio 🙌' },
        { key: 'pre_vencimiento', name: 'Pre-Vencimiento', variant: 3, enabled: true, message: '{nombre}, aviso importante 📢\n\nTu servicio de *{plataforma}* está por vencer en {dias_restantes} días ({fecha_vencimiento}).\n\n🏷️ Renovación: Gs. {precio}\n\nNo te quedes sin acceso, respondé para renovar ✅' },
        { key: 'pre_vencimiento', name: 'Pre-Vencimiento', variant: 4, enabled: true, message: 'Hola {nombre} 👋\n\nSe acerca el vencimiento de tu *{plataforma}* ({fecha_vencimiento} - faltan {dias_restantes} días).\n\n💰 Gs. {precio} para renovar.\n\n¿Renovamos? Escribinos 📲' },
        { key: 'pre_vencimiento', name: 'Pre-Vencimiento', variant: 5, enabled: true, message: 'Buenas {nombre}! 😊\n\nTu *{plataforma}* vence pronto: {fecha_vencimiento} ({dias_restantes} días restantes).\n\n💵 Renovar: Gs. {precio}\n\nAvisanos y lo renovamos al toque 🚀' },
        // VENCIMIENTO HOY
        { key: 'vencimiento_hoy', name: 'Vencimiento', variant: 1, enabled: true, message: 'Hola 👋\n\nTu servicio de *{plataforma}* vence hoy.\n\n✅ Escribinos para renovar y no perder el acceso.\n\n💰 Renovar: Gs. {precio}' },
        { key: 'vencimiento_hoy', name: 'Vencimiento', variant: 2, enabled: true, message: '{nombre}, tu *{plataforma}* vence HOY 🔴\n\nSi no renovás, mañana se suspenderá tu acceso.\n\n💰 Renovación: Gs. {precio}\n\nEscribinos ahora para renovar ✅' },
        { key: 'vencimiento_hoy', name: 'Vencimiento', variant: 3, enabled: true, message: '⚠️ {nombre}, último día de tu *{plataforma}*!\n\nHoy vence tu servicio. Renovalo para seguir disfrutando sin interrupción.\n\n💵 Renovar: Gs. {precio}\n\nRespondé este mensaje para renovar 📲' },
        { key: 'vencimiento_hoy', name: 'Vencimiento', variant: 4, enabled: true, message: 'Hola {nombre} 🔔\n\nTu suscripción de *{plataforma}* vence hoy ({fecha_vencimiento}).\n\n💰 Gs. {precio} para renovar.\n\nEscribinos antes de que se suspenda el acceso.' },
        { key: 'vencimiento_hoy', name: 'Vencimiento', variant: 5, enabled: true, message: '{nombre}, te avisamos que hoy vence tu *{plataforma}* ⏳\n\n💵 Precio de renovación: Gs. {precio}\n\nNo pierdas tu acceso, contactanos para renovar 🙌' },
        // SERVICIO VENCIDO
        { key: 'vencimiento_vencido', name: 'Servicio Vencido', variant: 1, enabled: true, message: 'Hola {nombre} 👋\n\nTu servicio de *{plataforma}* venció ayer.\n\nEs tu última oportunidad antes de la cancelación definitiva.\n\n💰 Renovar: Gs. {precio}\n\nEscribinos 📲' },
        { key: 'vencimiento_vencido', name: 'Servicio Vencido', variant: 2, enabled: true, message: '{nombre}, tu *{plataforma}* ya venció ⚠️\n\nSi querés mantener tu acceso, tenés que renovar lo antes posible.\n\n💵 Gs. {precio} para reactivar.\n\nRespondé para que lo activemos de inmediato ✅' },
        { key: 'vencimiento_vencido', name: 'Servicio Vencido', variant: 3, enabled: true, message: 'Aviso urgente {nombre} 🔴\n\nTu servicio de *{plataforma}* está vencido. Tu acceso será cancelado pronto.\n\n💰 Renovar ahora: Gs. {precio}\n\nEscribinos y lo solucionamos al toque.' },
        { key: 'vencimiento_vencido', name: 'Servicio Vencido', variant: 4, enabled: true, message: 'Hola {nombre}!\n\nTu suscripción de *{plataforma}* venció.\n\nSi no renovás, perderás el acceso definitivamente.\n\n💵 Renovación: Gs. {precio}\n\nAvisanos para renovar 📲' },
        { key: 'vencimiento_vencido', name: 'Servicio Vencido', variant: 5, enabled: true, message: '{nombre}, tu *{plataforma}* ya no está activo ⏳\n\nTodavía estás a tiempo de renovar antes de la cancelación total.\n\n💰 Gs. {precio}\n\nEscribinos y lo reactivamos enseguida 🙌' },
        // CREDENCIALES DE VENTA
        { key: 'venta_credenciales', name: 'Credenciales de Venta', variant: 1, enabled: true, message: 'Hola {nombre} 😊\n\nTus credenciales de *{plataforma}* están listas:\n\n📧 Email: {email}\n🔑 Contraseña: {password}\n📺 Tu perfil: {perfil}\n🔒 PIN: {pin}\n\n📅 Vence: {fecha_vencimiento}\n\nSi tenés dudas, escribinos.' },
        { key: 'venta_credenciales', name: 'Credenciales de Venta', variant: 2, enabled: true, message: 'Hey {nombre}! 🎉\n\nYa tenés acceso a *{plataforma}*:\n\n✉️ Correo: {email}\n🔐 Clave: {password}\n👤 Perfil: {perfil}\n🔢 PIN: {pin}\n\n📆 Vigencia hasta: {fecha_vencimiento}\n\n¡Disfrutalo! Cualquier consulta nos avisás.' },
        { key: 'venta_credenciales', name: 'Credenciales de Venta', variant: 3, enabled: true, message: '{nombre}, tu *{plataforma}* está activado ✅\n\n📧 Email: {email}\n🔑 Pass: {password}\n🖥️ Perfil: {perfil}\n📌 PIN: {pin}\n\n📅 Válido hasta: {fecha_vencimiento}\n\nGuardá estos datos. ¡Saludos!' },
        { key: 'venta_credenciales', name: 'Credenciales de Venta', variant: 4, enabled: true, message: 'Hola {nombre}! 🙌\n\nAcá van tus datos de acceso a *{plataforma}*:\n\n📬 Email: {email}\n🔑 Contraseña: {password}\n📺 Perfil: {perfil}\n🔒 PIN: {pin}\n\n📆 Fecha de vencimiento: {fecha_vencimiento}\n\nEscribinos si necesitás ayuda.' },
        { key: 'venta_credenciales', name: 'Credenciales de Venta', variant: 5, enabled: true, message: 'Buenas {nombre} ✌️\n\nTe compartimos tu acceso a *{plataforma}*:\n\n📩 Email: {email}\n🔐 Contraseña: {password}\n👤 Perfil asignado: {perfil}\n🔢 PIN: {pin}\n\n📅 Vence el: {fecha_vencimiento}\n\nCualquier duda, estamos disponibles.' },
    ];
    
    const { data: inserted, error: insertErr } = await supabase
        .from('whatsapp_templates')
        .insert(templates)
        .select('id, key, variant');
    
    if (insertErr) {
        console.error('  Insert error:', insertErr.message);
        return;
    }
    console.log(`  ✅ Inserted ${inserted?.length} templates`);
    
    console.log('\n=== Step 4: Setting up rotation counters ===');
    const rotationKeys = [
        { key: 'template_rotation_credenciales_actualizadas', value: '0', label: 'Rotation: credenciales_actualizadas' },
        { key: 'template_rotation_pre_vencimiento', value: '0', label: 'Rotation: pre_vencimiento' },
        { key: 'template_rotation_vencimiento_hoy', value: '0', label: 'Rotation: vencimiento_hoy' },
        { key: 'template_rotation_vencimiento_vencido', value: '0', label: 'Rotation: vencimiento_vencido' },
        { key: 'template_rotation_venta_credenciales', value: '0', label: 'Rotation: venta_credenciales' },
    ];
    
    for (const rk of rotationKeys) {
        await supabase.from('app_config').upsert(rk, { onConflict: 'key' });
    }
    console.log('  ✅ Rotation counters ready');
    
    // Verify
    const { data: final } = await supabase
        .from('whatsapp_templates')
        .select('key, variant, enabled')
        .order('key')
        .order('variant');
    
    console.log('\n=== Verification ===');
    const byKey = {};
    for (const t of (final || [])) {
        if (!byKey[t.key]) byKey[t.key] = [];
        byKey[t.key].push(`V${t.variant}${t.enabled ? '✅' : '❌'}`);
    }
    for (const [k, vars] of Object.entries(byKey)) {
        console.log(`  ${k}: ${vars.join(' ')}`);
    }
    console.log(`\nTotal: ${final?.length} templates`);
}

main().catch(console.error);
