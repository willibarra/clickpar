/**
 * PagoPar Payment Gateway Helper
 * Docs: https://www.pagopar.com/panel/desarrollador/integrar-sitio-web
 * Token formula: sha1(PRIVATE_KEY + orderId + amountString)
 * Webhook verification: sha1(PRIVATE_KEY + hash_pedido)
 */

import crypto from 'crypto';

const API_BASE = 'https://api.pagopar.com/api/comercios/2.0';
const PUBLIC_KEY = process.env.PAGOPAR_PUBLIC_KEY!;
const PRIVATE_KEY = process.env.PAGOPAR_PRIVATE_KEY!;

// ─── Token helpers ────────────────────────────────────────────────────────────

/** Generate SHA1 token for creating a payment order */
export function generateOrderToken(orderId: string, amount: number): string {
    const str = PRIVATE_KEY + orderId + String(amount);
    return crypto.createHash('sha1').update(str).digest('hex');
}

/** Verify the SHA1 signature received in a PagoPar webhook */
export function verifyWebhookToken(hashPedido: string, receivedToken: string): boolean {
    const expected = crypto
        .createHash('sha1')
        .update(PRIVATE_KEY + hashPedido)
        .digest('hex');
    return expected === receivedToken;
}

// ─── Create payment order ─────────────────────────────────────────────────────

interface CreateOrderParams {
    orderId: string;         // Our internal transaction ID (used as id_pedido_comercio)
    amountGs: number;        // Amount in Guaranies (integer)
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerDoc?: string;    // CI or RUC
    platform: string;        // Platform name for the item description
}

interface CreateOrderResult {
    success: boolean;
    paymentUrl?: string;
    pagoparHash?: string;
    error?: string;
}

export async function createPaymentOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const {
        orderId,
        amountGs,
        customerName,
        customerEmail,
        customerPhone,
        customerDoc = '0',
        platform,
    } = params;

    // PagoPar requires fecha_maxima_pago — give 48 hours
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 48);
    const fechaMaxima = expiry
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

    const token = generateOrderToken(orderId, amountGs);

    const payload = {
        token,
        public_key: PUBLIC_KEY,
        monto_total: amountGs,
        id_pedido_comercio: orderId,
        fecha_maxima_pago: fechaMaxima,
        comprador: {
            nombre: customerName,
            email: customerEmail,
            telefono: customerPhone.replace(/\D/g, ''),
            documento: customerDoc,
            tipo_documento: 'CI',
        },
        compras_items: [
            {
                nombre: `Renovación ${platform} - ClickPar`,
                cantidad: 1,
                precio_unitario: amountGs,
                ciudad: 'Asunción',
            },
        ],
    };

    try {
        const res = await fetch(`${API_BASE}/iniciar-transaccion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data.data) {
            console.error('[PagoPar] Error creating order:', data);
            return { success: false, error: data.message || 'Error al crear orden en PagoPar' };
        }

        const pagoparHash: string = data.data;
        return {
            success: true,
            pagoparHash,
            paymentUrl: `https://www.pagopar.com/pagos/${pagoparHash}`,
        };
    } catch (err: any) {
        console.error('[PagoPar] Network error:', err);
        return { success: false, error: 'Error de conexión con PagoPar' };
    }
}
