import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/kommo/payment-info?method=giros|transferencia|all
 * Returns payment instructions for the Kommo Salesbot.
 * 
 * Query params:
 *   method: giros | transferencia | wally | zimple | all
 *   customer_name: optional, to personalize the message
 */
export async function GET(request: NextRequest) {
    const method = request.nextUrl.searchParams.get('method')?.toLowerCase();
    const customerName = request.nextUrl.searchParams.get('customer_name') || '';

    const paymentMethods: Record<string, {
        name: string;
        message: string;
    }> = {
        giros: {
            name: 'Giros (Tigo/Personal/Claro)',
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
            name: 'Transferencia Bancaria',
            message:
                `💳 Transferencia Bancaria

~Alias Ueno Nº: 0994540904

~Alias Familiar CI: 1584830

Luego de realizar el pago me pasas foto o captura del comprobante`,
        },
        metodos: {
            name: 'Todos los métodos',
            message:
                `💵 Los pagos son mediante Giros Tigo, Personal, Claro, WALLY, ZIMPLE, Transferencia bancaria.

Cual método de pago preferirís?`,
        },
    };

    if (method && paymentMethods[method]) {
        const pm = paymentMethods[method];
        return NextResponse.json({
            success: true,
            payment: { name: pm.name, message: pm.message },
        });
    }

    // Return all available methods summary
    return NextResponse.json({
        success: true,
        available_methods: Object.entries(paymentMethods).map(([key, value]) => ({
            id: key,
            name: value.name,
        })),
        default_message: paymentMethods.metodos.message,
    });
}
