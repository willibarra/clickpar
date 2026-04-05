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
        .select('id, customer_id, amount, subscription_id, status, transaction_type')
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

    // 6. Bifurcate: wallet top-up vs subscription renewal
    const txType: string = transaction.transaction_type ?? 'subscription_renewal';

    if (txType === 'wallet_topup') {
        // ── WALLET TOP-UP ──────────────────────────────────────────────
        // Find the customer record linked to this auth user
        const { data: profileRow } = await (admin.from('profiles') as any)
            .select('phone_number')
            .eq('id', transaction.customer_id)
            .single();

        let customer: any = null;

        // Try portal_user_id first
        const { data: byPortalId } = await (admin.from('customers') as any)
            .select('id, full_name, phone, wallet_balance')
            .eq('portal_user_id', transaction.customer_id)
            .maybeSingle();
        customer = byPortalId;

        // Fallback: resolve by phone
        if (!customer && profileRow?.phone_number) {
            const { data: byPhone } = await (admin.from('customers') as any)
                .select('id, full_name, phone, wallet_balance')
                .eq('phone', profileRow.phone_number)
                .maybeSingle();
            customer = byPhone;
        }

        if (!customer) {
            console.error('[PagoPar Webhook] Cannot find customer for wallet top-up, tx:', transaction.id);
            return NextResponse.json({ error: 'Cliente no encontrado para acreditar saldo' }, { status: 404 });
        }

        const currentBalance = Number(customer.wallet_balance ?? 0);
        const newBalance = currentBalance + Number(transaction.amount);

        // Credit wallet_balance
        await (admin.from('customers') as any)
            .update({ wallet_balance: newBalance })
            .eq('id', customer.id);

        // Insert ledger entry
        await (admin.from('wallet_transactions') as any)
            .insert({
                customer_id: customer.id,
                amount: Number(transaction.amount),
                type: 'credit',
                concept: 'Recarga de Saldo — PagoPar',
                reference_id: transaction.id,
            });

        console.log(`[PagoPar Webhook] Wallet top-up: customer=${customer.id}, +Gs.${transaction.amount} → new balance: Gs.${newBalance}`);

        // Send WhatsApp confirmation
        if (customer.phone) {
            const amountFormatted = new Intl.NumberFormat('es-PY').format(transaction.amount);
            const msg = [
                `✅ *¡Recarga confirmada!*`,
                ``,
                `Hola ${customer.full_name?.split(' ')[0] ?? 'Cliente'}! Tu saldo fue acreditado 💰`,
                ``,
                `💰 *Monto recargado:* Gs. ${amountFormatted}`,
                `💳 *Nuevo saldo:* Gs. ${new Intl.NumberFormat('es-PY').format(newBalance)}`,
                ``,
                `Ya podés usar tu saldo en la Tienda ClickPar 🛒`,
                `_ClickPar - Streaming inteligente_`,
            ].join('\n');

            sendText(customer.phone, msg, {
                templateKey: 'pagopar_topup_confirmacion',
                skipRateLimiting: true,
            }).catch((err) => {
                console.error('[PagoPar Webhook] WhatsApp send failed (topup):', err);
            });
        }

        return NextResponse.json({ success: true });
    }

    // ── SUBSCRIPTION RENEWAL (default) ────────────────────────────────
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
