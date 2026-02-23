import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/kommo/bot-responses?topic=precios|icloud|horario|codigo_hogar|contacto|metodo_pago
 * 
 * Centralized responses for the Kommo Salesbot.
 * Returns pre-formatted WhatsApp messages based on topic.
 * The Salesbot can call this API to get the right message for each situation.
 * 
 * Optional: ?customer_name=Juan to personalize the response.
 */
export async function GET(request: NextRequest) {
    const topic = request.nextUrl.searchParams.get('topic')?.toLowerCase();
    const customerName = request.nextUrl.searchParams.get('customer_name') || '';

    // Fetch live stock data for price list
    let stockInfo = '';
    if (topic === 'precios' || !topic) {
        try {
            const { data: slots } = await supabase
                .from('sale_slots')
                .select('id, mother_accounts!inner(platform, slot_price_gs)')
                .eq('status', 'available')
                .eq('mother_accounts.status', 'active');

            const platforms: Record<string, { available: number; price: number }> = {};
            for (const slot of (slots || []) as any[]) {
                const p = slot.mother_accounts?.platform;
                const price = slot.mother_accounts?.slot_price_gs || 0;
                if (!p) continue;
                if (!platforms[p]) platforms[p] = { available: 0, price };
                platforms[p].available++;
            }

            stockInfo = Object.entries(platforms)
                .filter(([_, info]) => info.available > 0)
                .map(([name, info]) => `• ${name}: ${info.available} disp. → Gs. ${info.price.toLocaleString()}`)
                .join('\n');
        } catch (_) { /* ignore */ }
    }

    const responses: Record<string, { title: string; message: string }> = {
        precios: {
            title: 'Lista de Precios',
            message:
                `🔥 PROMOS ACTIVAS 1 dispositivo 🔥

‼️‼️PRECIOS DE COMBOS‼️‼️‼️

💥 1 MES de Nεтflix + Spøtify 💥
└─💰 Precio: 50.000 Gs

💥2 MESES DE Nεтflix + HB0 Max💥
└─💰 Precio: 50.000 Gs

💥3 MESES DE HB0 Max + Amazon Pr!me V!deo💥
└─💰 Precio: 30.000 Gs


‼️‼️PRECIOS POR SEPARADO‼️‼️‼️

🎬 STREAMING (Video)

• Nεтflix
  └─ 1 mes → Gs. 30.000

• Amazon Pr!me V!deo
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

• Disnεy+ Prεmium (incluye ESPN)
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

• HB0 Max
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

• Crunch¥roll
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

• V!X
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

• Paramøunt+
  └─ 1 mes → Gs. 25.000
  └─ 3 meses → Gs. 50.000

───────────────

🎧 MÚSICA

• Spøtify Premium
  └─ 1 mes → Gs. 30.000
  └─ 2 meses → Gs. 50.000

• YøùTube Prεmium + YT Music
  └─ 1 mes → Gs. 30.000
  └─ 2 meses → Gs. 50.000

───────────────

☁️ iCløud (Giftcard original)

• Desde 10 USD hasta 50 USD
  └─ Precio según monto (consultar)

───────────────

📲 ¿En cuál servicio estás interesad@?${stockInfo ? `\n\n📊 Stock actual:\n${stockInfo}` : ''}`,
        },
        icloud: {
            title: 'Precios iCloud',
            message:
                `Los espacios para iCloud se realizan a través de Tarjetas Prepagas de iPhone.

Los Precios de las Tarjetas son:

10$: 100.000 ₲
25$: 240.000 ₲
50$: 450.000 ₲

Al realizar la compra de un Gift Card, por ejemplo el de 10 Dólares, nosotros te pasamos el código y vos cargas en tu iPhone, luego vos realizas la compra del espacio en iCloud.

1 Dólar por mes = 50 GB

suponiendo que tenes 10 dólares, entonces te dura 10 MESES la tarjeta,
si es que no usas en otras cosas tu Saldo de iPhone.`,
        },
        codigo_hogar: {
            title: 'Código Hogar Netflix',
            message:
                `🔥 PARA CONSULTAR TU CODIGO HOGAR 🔥

1. Selecciona la opción "estoy de viaje" si estas en tv, o "ver temporalmente" si estas en Cel

2. Selecciona la opción "Enviar Email"

3. Ingresa a la web: https://householdcode.com/es

(COLOCAR EL CORREO DE TU NETFLIX - DALE EN CONSULTAR)

4. Ahí estará el correo o CODIGO para colocar en tu Netflix

5. SOLO ACTIVAR 1 DISPOSITIVO`,
        },
        metodo_pago: {
            title: 'Métodos de Pago',
            message:
                `💵 Los pagos son mediante Giros Tigo, Personal, Claro, WALLY, ZIMPLE, Transferencia bancaria.

Cual método de pago preferirís?`,
        },
        giros: {
            title: 'Pago por Giros',
            message:
                `Los números disponibles para Giros son:

(0973) 682 124 (giros/billetera Personal)
(0985) 891 277 (giros/billetera Tigo)
(0994) 540 904 (giros/billetera Claro)

💵WALLY: (0994) 540 904
💶ZIMPLE: (0994) 540 904

Luego de realizar el pago me pasas la foto o captura del comprobante

Muchas Gracias!`,
        },
        transferencia: {
            title: 'Transferencia Bancaria',
            message:
                `💳 Transferencia Bancaria

~Alias Ueno Nº: 0994540904

~Alias Familiar CI: 1584830

Luego de realizar el pago me pasas foto o captura del comprobante`,
        },
        horario: {
            title: 'Horario de Atención',
            message:
                `Nuestro horario comercial es el siguiente:
Domingo: 2:00 PM - 8:00 PM
Lunes: 9:00 AM - 8:00 PM
Martes: 9:00 AM - 8:00 PM
Miércoles: 9:00 AM - 8:00 PM
Jueves: 9:00 AM - 8:00 PM
Viernes: 9:00 AM - 8:00 PM
Sábado: 2:00 PM - 8:00 PM`,
        },
        contacto: {
            title: 'Números de Contacto',
            message:
                `Contamos con dos números oficiales de atención para consultas, ventas y asistencia:

📱 0971 995 666
📱 0994 540 904

¡Estamos para ayudarte en cualquiera de nuestras líneas!`,
        },
    };

    // Personalize if customer name provided
    if (customerName && topic && responses[topic]) {
        responses[topic].message = responses[topic].message
            .replace(/Hola /g, `Hola ${customerName}, `)
            .replace(/interesad@/g, `interesad@ ${customerName}`);
    }

    if (topic && responses[topic]) {
        return NextResponse.json({
            success: true,
            topic,
            ...responses[topic],
        });
    }

    // Return all available topics
    return NextResponse.json({
        success: true,
        available_topics: Object.entries(responses).map(([key, value]) => ({
            id: key,
            title: value.title,
        })),
        message: 'Use ?topic=precios|icloud|codigo_hogar|metodo_pago|giros|transferencia|horario|contacto',
    });
}
