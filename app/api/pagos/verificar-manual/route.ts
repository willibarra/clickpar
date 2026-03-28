import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/pagos/verificar-manual
 *
 * Verifies or rejects a bank transfer transaction.
 * Called by n8n when it cannot auto-match, or by an admin UI for manual review.
 *
 * Body:
 * {
 *   secret: string,              // N8N_SECRET
 *   transaction_id: string,      // UUID of the transaction to process
 *   action: 'approve' | 'reject',
 *   subscription_id?: string,    // UUID of subscription to renew (if approve)
 *   notes?: string,              // Optional operator notes
 * }
 *
 * Response 200:
 * {
 *   success: true,
 *   transaction_id: string,
 *   action: string,
 *   subscription_renewed: boolean,
 * }
 */
export async function POST(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { secret, transaction_id, action, subscription_id, notes } = body;

        // ── Auth ──────────────────────────────────────────────
        if (secret !== N8N_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!transaction_id || !action) {
            return NextResponse.json(
                { error: 'Missing required fields: transaction_id, action' },
                { status: 400 }
            );
        }

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Must be "approve" or "reject"' },
                { status: 400 }
            );
        }

        // ── Fetch the transaction ──────────────────────────────
        const { data: transaction, error: txError } = await (supabase as any)
            .from('transactions')
            .select('*, profiles:customer_id(id, full_name, phone_number)')
            .eq('id', transaction_id)
            .single();

        if (txError || !transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const tx = transaction as any;

        if (tx.status === 'verified') {
            return NextResponse.json({ success: true, already_processed: true, action: 'approve' });
        }

        // ── APPROVE ───────────────────────────────────────────
        if (action === 'approve') {
            const now = new Date().toISOString();

            // 1. Update transaction to verified
            const { error: updateError } = await (supabase as any)
                .from('transactions')
                .update({
                    status: 'verified',
                    verified_at: now,
                    verified_by: 'manual',
                    n8n_notes: notes || null,
                    subscription_id: subscription_id || tx.subscription_id || null,
                })
                .eq('id', transaction_id);

            if (updateError) {
                console.error('[VerificarManual] Failed to update transaction:', updateError);
                return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
            }

            let subscriptionRenewed = false;
            const targetSubscriptionId = subscription_id || tx.subscription_id;

            // 2. Renew the subscription if we have a subscription_id
            if (targetSubscriptionId) {
                const { data: sub } = await (supabase as any)
                    .from('subscriptions')
                    .select('id, end_date, is_active')
                    .eq('id', targetSubscriptionId)
                    .single();

                if (sub) {
                    const s = sub as any;
                    // Extend from today or from current end_date, whichever is later
                    const today = new Date();
                    const currentEnd = s.end_date ? new Date(s.end_date) : today;
                    const startFrom = currentEnd > today ? currentEnd : today;
                    const newEndDate = new Date(startFrom);
                    newEndDate.setMonth(newEndDate.getMonth() + 1);

                    const { error: subError } = await (supabase as any)
                        .from('subscriptions')
                        .update({
                            end_date: newEndDate.toISOString(),
                            is_active: true,
                        })
                        .eq('id', targetSubscriptionId);

                    if (!subError) {
                        subscriptionRenewed = true;
                        console.log(
                            `[VerificarManual] Subscription ${targetSubscriptionId} renewed until ${newEndDate.toISOString().split('T')[0]}`
                        );
                    } else {
                        console.error('[VerificarManual] Failed to renew subscription:', subError);
                    }
                }
            }

            // 3. Notify customer via WhatsApp
            const customer = tx.profiles as any;
            if (customer?.phone_number) {
                const amountFormatted = Number(tx.amount).toLocaleString('es-PY');
                const message = [
                    `✅ *¡Pago verificado!*`,
                    ``,
                    `Hola ${customer.full_name || 'Cliente'} 👋`,
                    `Recibimos y verificamos tu transferencia de *Gs. ${amountFormatted}*. ¡Gracias!`,
                    subscriptionRenewed
                        ? `\n🔄 Tu suscripción ha sido renovada por 1 mes. ¡A disfrutar! 🎉`
                        : `\n_Si tenés alguna consulta, escribinos por acá._ 💬`,
                ].join('\n');

                try {
                    await sendText(customer.phone_number, message, {
                        customerId: customer.id,
                        templateKey: 'pago_verificado_manual',
                        skipRateLimiting: true, // Admin-triggered, skip rate limits
                    });
                } catch (waErr: any) {
                    console.error('[VerificarManual] WhatsApp send failed (non-fatal):', waErr.message);
                }
            }

            return NextResponse.json({
                success: true,
                transaction_id,
                action: 'approve',
                subscription_renewed: subscriptionRenewed,
            });
        }

        // ── REJECT ────────────────────────────────────────────
        if (action === 'reject') {
            const { error: rejectError } = await (supabase as any)
                .from('transactions')
                .update({
                    status: 'rejected',
                    verified_by: 'manual',
                    n8n_notes: notes || 'Rechazado manualmente',
                })
                .eq('id', transaction_id);

            if (rejectError) {
                console.error('[VerificarManual] Failed to reject transaction:', rejectError);
                return NextResponse.json({ error: 'Failed to reject transaction' }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                transaction_id,
                action: 'reject',
                subscription_renewed: false,
            });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error: any) {
        console.error('[VerificarManual] Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/pagos/verificar-manual
 *
 * Lists pending transactions for the admin review UI.
 * Requires the N8N_SECRET as a query param or x-n8n-secret header.
 *
 * Query params: ?secret=...&limit=20&offset=0
 */
export async function GET(request: NextRequest) {
    const supabase = await createAdminClient();

    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-n8n-secret');

    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    try {
        const { data: transactions, count } = await (supabase as any)
            .from('transactions')
            .select('*, profiles:customer_id(id, full_name, phone_number)', { count: 'exact' })
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        return NextResponse.json({
            success: true,
            transactions: transactions || [],
            total: count || 0,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('[VerificarManual GET] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
