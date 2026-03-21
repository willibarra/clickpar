import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';
export const dynamic = 'force-dynamic';



const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

// =============================================
// PagoPar API Config
// =============================================
const PAGOPAR_PUBLIC_KEY = process.env.PAGOPAR_PUBLIC_KEY || '';
const PAGOPAR_PRIVATE_KEY = process.env.PAGOPAR_PRIVATE_KEY || '';
const PAGOPAR_API_URL = 'https://api.pagopar.com/api';

// =============================================
// Bancard API Config (alternative)
// =============================================
const BANCARD_PUBLIC_KEY = process.env.BANCARD_PUBLIC_KEY || '';
const BANCARD_PRIVATE_KEY = process.env.BANCARD_PRIVATE_KEY || '';
const BANCARD_API_URL = process.env.BANCARD_ENV === 'production'
    ? 'https://vpos.infonet.com.py'
    : 'https://vpos.infonet.com.py:8888';

/**
 * POST /api/n8n/generate-payment-qr
 *
 * Called by N8N to generate a QR payment link for a customer renewal.
 * Supports PagoPar (default) and Bancard.
 *
 * Body: {
 *   customer_id: string,
 *   sale_id?: string,        // existing sale being renewed (optional)
 *   amount_gs: number,       // amount in guaraníes
 *   concept: string,         // e.g. "Renovación Netflix - Perfil 2"
 *   platform?: string,       // e.g. "Netflix"
 *   gateway?: 'pagopar' | 'bancard',   // default: pagopar
 *   n8n_session_id?: string, // to correlate with N8N session
 * }
 *
 * Returns: {
 *   order_id: string,
 *   qr_url: string,          // URL of the QR image
 *   payment_url: string,     // URL customer can open to pay
 *   expires_at: string,      // ISO timestamp when QR expires
 *   amount_gs: number,
 * }
 */
export async function POST(request: NextRequest) {
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const {
            customer_id,
            sale_id = null,
            amount_gs,
            concept,
            platform = null,
            gateway = 'pagopar',
            n8n_session_id = null,
        } = body;

        if (!customer_id || !amount_gs || !concept) {
            return NextResponse.json(
                { error: 'Missing required fields: customer_id, amount_gs, concept' },
                { status: 400 }
            );
        }

        // Verify customer exists
        const { data: customer } = await (supabase as any)
            .from('customers')
            .select('id, full_name, phone')
            .eq('id', customer_id)
            .single();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const c = customer as any;

        // Generate a unique order ID for tracking
        const orderId = `CP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // QR expires in 30 minutes
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';
        const confirmUrl = `${baseUrl}/api/n8n/payment-confirm`;

        let result: { qr_url: string | null; payment_url: string; gateway_token: string | null };

        if (gateway === 'pagopar') {
            result = await generatePagoparQR({
                orderId,
                amountGs: amount_gs,
                concept,
                customerName: c.full_name || 'Cliente',
                customerPhone: c.phone,
                confirmUrl,
            });
        } else {
            result = await generateBancardQR({
                orderId,
                amountGs: amount_gs,
                concept,
                confirmUrl,
            });
        }

        // Save pending payment to DB
        const { error: dbError } = await (supabase as any)
            .from('pending_payments')
            .insert({
                order_id: orderId,
                customer_id,
                sale_id,
                amount_gs,
                concept,
                platform,
                status: 'pending',
                qr_url: result.qr_url,
                payment_gateway: gateway,
                gateway_token: result.gateway_token,
                expires_at: expiresAt,
                n8n_session_id,
            });

        if (dbError) {
            console.error('[Generate QR] DB insert error:', dbError);
        }

        return NextResponse.json({
            success: true,
            order_id: orderId,
            qr_url: result.qr_url,
            payment_url: result.payment_url,
            expires_at: expiresAt,
            amount_gs,
            concept,
            // WhatsApp-ready message for N8N to send
            whatsapp_message: buildPaymentMessage(concept, amount_gs, result.payment_url, expiresAt),
        });

    } catch (error: any) {
        console.error('[Generate QR] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// =============================================
// PagoPar QR Generation
// =============================================

async function generatePagoparQR(params: {
    orderId: string;
    amountGs: number;
    concept: string;
    customerName: string;
    customerPhone: string;
    confirmUrl: string;
}): Promise<{ qr_url: string | null; payment_url: string; gateway_token: string | null }> {
    if (!PAGOPAR_PUBLIC_KEY || !PAGOPAR_PRIVATE_KEY) {
        console.warn('[PagoPar] Keys not configured — returning mock QR');
        return mockQR(params.orderId, params.amountGs);
    }

    try {
        // PagoPar token: SHA1(private_key + public_key + amount)
        const token = crypto
            .createHash('sha1')
            .update(`${PAGOPAR_PRIVATE_KEY}${PAGOPAR_PUBLIC_KEY}${params.amountGs}`)
            .digest('hex');

        const payload = {
            public_key: PAGOPAR_PUBLIC_KEY,
            token,
            id_compra: params.orderId,
            description: params.concept,
            moneda: 'PYG',
            monto: params.amountGs,
            url_respuesta: params.confirmUrl,
            comprador: {
                nombre: params.customerName,
                telefono: params.customerPhone,
            },
            items: [
                {
                    nombre: params.concept,
                    costo_unitario: params.amountGs,
                    cantidad: 1,
                    total_linea: params.amountGs,
                },
            ],
        };

        const res = await fetch(`${PAGOPAR_API_URL}/pago/crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data?.respuesta === 'true') {
            return {
                qr_url: data?.link_qr || null,
                payment_url: data?.link_pago || `https://pagopar.com/checkout/${params.orderId}`,
                gateway_token: token,
            };
        }

        console.error('[PagoPar] API error:', data);
        return mockQR(params.orderId, params.amountGs);
    } catch (err: any) {
        console.error('[PagoPar] Request failed:', err.message);
        return mockQR(params.orderId, params.amountGs);
    }
}

// =============================================
// Bancard QR Generation
// =============================================

async function generateBancardQR(params: {
    orderId: string;
    amountGs: number;
    concept: string;
    confirmUrl: string;
}): Promise<{ qr_url: string | null; payment_url: string; gateway_token: string | null }> {
    if (!BANCARD_PUBLIC_KEY || !BANCARD_PRIVATE_KEY) {
        console.warn('[Bancard] Keys not configured — returning mock QR');
        return mockQR(params.orderId, params.amountGs);
    }

    try {
        // Bancard token: MD5(private_key + shop_process_id + amount + currency + "request")
        const amountFormatted = (params.amountGs / 100).toFixed(2); // PYG cents format
        const token = crypto
            .createHash('md5')
            .update(`${BANCARD_PRIVATE_KEY}${params.orderId}${amountFormatted}PYG${'request'}`)
            .digest('hex');

        const payload = {
            public_key: BANCARD_PUBLIC_KEY,
            operation: {
                token,
                shop_process_id: params.orderId,
                currency: 'PYG',
                amount: amountFormatted,
                additional_data: '',
                description: params.concept,
                return_url: params.confirmUrl,
                cancel_url: params.confirmUrl,
            },
        };

        const res = await fetch(`${BANCARD_API_URL}/vpos/api/0.3/single_buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data?.status === 'success') {
            const processId = data?.process_id;
            const paymentUrl = `${BANCARD_API_URL}/checkout/new?process_id=${processId}`;
            return {
                qr_url: null, // Bancard doesn't return a QR image directly — customer opens the URL
                payment_url: paymentUrl,
                gateway_token: token,
            };
        }

        console.error('[Bancard] API error:', data);
        return mockQR(params.orderId, params.amountGs);
    } catch (err: any) {
        console.error('[Bancard] Request failed:', err.message);
        return mockQR(params.orderId, params.amountGs);
    }
}

// =============================================
// Mock QR (when gateway not configured yet)
// =============================================

function mockQR(orderId: string, amountGs: number) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';
    return {
        qr_url: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`${baseUrl}/pay/${orderId}`)}&size=300x300`,
        payment_url: `${baseUrl}/pay/${orderId}`,
        gateway_token: null,
    };
}

// =============================================
// WhatsApp message builder
// =============================================

function buildPaymentMessage(concept: string, amountGs: number, paymentUrl: string, expiresAt: string): string {
    const expiry = new Date(expiresAt);
    const expiryTime = expiry.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    const formattedAmount = amountGs.toLocaleString('es-PY');

    return [
        `💳 *Pago de renovación*`,
        ``,
        `📋 Concepto: ${concept}`,
        `💰 Monto: *Gs. ${formattedAmount}*`,
        ``,
        `Podés pagar desde cualquier billetera digital (Tigo Money, Personal Pay, Zimple, etc) escaneando el QR o haciendo clic en el enlace:`,
        ``,
        `🔗 ${paymentUrl}`,
        ``,
        `⏰ Válido hasta las *${expiryTime}*`,
        ``,
        `_Una vez confirmado el pago, recibís tus credenciales automáticamente. ✅_`,
    ].join('\n');
}
