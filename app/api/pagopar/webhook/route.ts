import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyWebhookToken } from '@/lib/pagopar';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pagopar/webhook
 * Receives payment confirmation from PagoPar.
 * Verifies SHA1 signature, renews subscription, and sends WhatsApp confirmation.
 */
export async function POST(req: NextRequest) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // PagoPar sends: { resultado: [{ pagado, hash_pedido, token, numero_pedido }], respuesta }
    const resultado = body?.resultado;
    if (!Array.isArray(resultado) || resultado.length === 0) {
        return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const payment = resultado[0];
    const { pagado, hash_pedido, token: receivedToken, numero_pedido } = payment;

    // 1. Verify the SHA1 signature
    if (!hash_pedido || !receivedToken) {
        console.warn('[PagoPar Webhook] Missing hash_pedido or token');
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    const isValid = verifyWebhookToken(hash_pedido, receivedToken);
    if (!isValid) {
        console.error('[PagoPar Webhook] Invalid token signature!', { hash_pedido });
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    // 2. If not paid, just acknowledge
    if (!pagado) {
        console.log('[PagoPar Webhook] Payment not completed yet:', hash_pedido);
        return NextResponse.json({ success: true, message: 'Pago pendiente' });
    }

    const admin = await createAdminClient();

    // 3. Find the transaction by pagopar_hash
    const { data: transaction, error: txError } = await (admin.from('transactions') as any)
        .select('id, customer_id, amount, subscription_id, status')
        .eq('pagopar_hash', hash_pedido)
        .maybeSingle();

    if (txError || !transaction) {
        console.error('[PagoPar Webhook] Transaction not found for hash:', hash_pedido, txError);
        return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    // 4. Idempotency — if already verified, skip processing but return success
    if (transaction.status === 'verified') {
        console.log('[PagoPar Webhook] Already processed:', hash_pedido);
        return NextResponse.json({ success: true, message: 'Ya procesado' });
    }

    // 5. Mark transaction as verified
    await (admin.from('transactions') as any)
        .update({ status: 'verified' })
        .eq('id', transaction.id);

    // 6. Renew the subscription: add 30 days to end_date
    let customerPhone: string | null = null;
    let customerName: string = 'Cliente';
    let platformName: string = 'Streaming';

    if (transaction.subscription_id) {
        // Fetch the sale
        const { data: sale } = await (admin.from('sales') as any)
            .select('id, end_date, customer_id, slot_id')
            .eq('id', transaction.subscription_id)
            .single();

        if (sale) {
            const currentEnd = new Date(sale.end_date);
            const now = new Date();
            // If already expired, start from today; otherwise extend from current end
            const baseDate = currentEnd < now ? now : currentEnd;
            const newEndDate = new Date(baseDate);
            newEndDate.setDate(newEndDate.getDate() + 30);

            await (admin.from('sales') as any)
                .update({
                    end_date: newEndDate.toISOString(),
                    is_active: true,
                })
                .eq('id', sale.id);

            console.log(`[PagoPar Webhook] Renewed sale ${sale.id} → new end_date: ${newEndDate.toISOString()}`);

            // Get platform name for WhatsApp message
            if (sale.slot_id) {
                const { data: slot } = await (admin.from('sale_slots') as any)
                    .select('mother_account_id')
                    .eq('id', sale.slot_id)
                    .single();
                if (slot?.mother_account_id) {
                    const { data: account } = await (admin.from('mother_accounts') as any)
                        .select('platform')
                        .eq('id', slot.mother_account_id)
                        .single();
                    if (account?.platform) platformName = account.platform;
                }
            }

            // Get customer phone & name
            const { data: customer } = await (admin.from('customers') as any)
                .select('phone, full_name')
                .eq('id', sale.customer_id)
                .maybeSingle();
            if (customer) {
                customerPhone = customer.phone;
                customerName = customer.full_name || 'Cliente';
            }
        }
    }

    // 7. Send WhatsApp confirmation to the customer
    if (customerPhone) {
        const amountFormatted = new Intl.NumberFormat('es-PY').format(transaction.amount);

        const message = [
            `✅ *¡Pago confirmado!*`,
            ``,
            `Hola ${customerName.split(' ')[0]}! Tu renovación fue procesada con éxito 🎉`,
            ``,
            `📺 *Servicio:* ${platformName}`,
            `💰 *Monto:* Gs. ${amountFormatted}`,
            `📅 *Válido por:* 30 días`,
            ``,
            `Ya podés disfrutar tu contenido favorito 🚀`,
            `_ClickPar - Streaming inteligente_`,
        ].join('\n');

        sendText(customerPhone, message, {
            templateKey: 'pagopar_confirmacion',
            skipRateLimiting: true, // Payment confirmations must always go through
        }).catch((err) => {
            console.error('[PagoPar Webhook] WhatsApp send failed:', err);
        });
    }

    return NextResponse.json({ success: true });
}
