const { createClient } = require('@supabase/supabase-js');

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;

    if (!supabaseUrl || !supabaseKey || !evoUrl || !evoKey) {
        console.error('❌ Falta configuración en .env o .env.local');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const PHONE = '595973442773';

    console.log(`\nConfigurando Alerta Staff WA (Número: ${PHONE}) en Supabase...`);

    // Intentar insertar o actualizar el número de staff
    const { error: configError } = await supabase
        .from('app_config')
        .upsert({ key: 'staff_alert_phone', value: PHONE }, { onConflict: 'key' });

    if (configError) {
        console.error('❌ Error guardando en app_config:', configError.message);
    } else {
        console.log('✅ Número de alerta de staff guardado correctamente.');
    }

    console.log('\nConfigurando Webhook en Evolution API...');
    try {
        // Asumo que la instancia principal es 'clickpar-1', chequeamos instances.
        const resList = await fetch(`${evoUrl}/instance/fetchInstances`, {
            headers: { apikey: evoKey }
        });
        const instances = await resList.json();
        
        if (!instances || instances.length === 0) {
            console.error('❌ No hay instancias registradas en Evolution API');
            return;
        }

        // Buscamos clickpar-1 u otra conectada
        const instance = instances.find(i => i.name === 'clickpar-1' || i.connectionStatus === 'open') || instances[0];
        const instanceName = instance.name;
        
        const webhookUrl = 'https://clickpar.shop/api/tickets/webhook-wa';
        console.log(`➡️  Configurando webhook en la instancia: ${instanceName} apuntando a ${webhookUrl}`);

        const webhookPayload = {
            webhook: {
                enabled: true,
                url: webhookUrl,
                webhook_by_events: false,
                webhook_base64: false,
                events: [
                    "MESSAGES_UPSERT"
                ]
            }
        };

        const resWeb = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': evoKey
            },
            body: JSON.stringify(webhookPayload)
        });

        if (resWeb.ok) {
            console.log('✅ Webhook configurado exitosamente.');
        } else {
            console.error('❌ Error configurando webhook:', await resWeb.text());
        }

    } catch (e) {
         console.error('❌ Error contactando Evolution API:', e.message);
    }

    console.log('\n✅ Script completado.\n');
}

main();
