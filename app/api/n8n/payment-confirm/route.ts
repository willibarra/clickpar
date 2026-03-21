import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { sendSaleCredentials } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';



const PAGOPAR_PRIVATE_KEY = process.env.PAGOPAR_PRIVATE_KEY || '';
const BANCARD_PRIVATE_KEY = process.env.BANCARD_PRIVATE_KEY || '';

/**
 * POST /api/n8n/payment-confirm
 *
 * Webhook called by PagoPar or Bancard when a payment is confirmed.
 * Also used by N8N to manually confirm a payment (e.g. after manual verification).
 *
 * For PagoPar, body includes: { id_compra, token, estado }
 * For Bancard, body includes: { operation: { shop_process_id, token, ... } }
 * For manual (N8N): { source: 'manual', order_id, secret: N8N_SECRET }
 */
export async function POST(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();

        // ── Determine the source ──────────────────────────────
        let orderId: string | null = null;
        let isPaid = false;
        let gateway: 'pagopar' | 'bancard' | 'manual' = 'manual';

        // Manual confirmation (N8N operator override)
        if (body.source === 'manual') {
            const n8nSecret = process.env.N8N_SECRET || 'clickpar-n8n-2024';
            if (body.secret !== n8nSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            orderId = body.order_id;
            isPaid = true;
            gateway = 'manual';
        }
        // PagoPar webhook
        else if (body.id_compra) {
            orderId = body.id_compra;
            gateway = 'pagopar';

            // Validate PagoPar token: SHA1(private_key + public_key + estado)
            const expectedToken = crypto
                .createHash('sha1')
                .update(`${PAGOPAR_PRIVATE_KEY}${process.env.PAGOPAR_PUBLIC_KEY}${body.estado}`)
                .digest('hex');

            if (body.token !== expectedToken) {
                console.error('[PaymentConfirm] Invalid PagoPar token');
                return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
            }

            isPaid = body.estado === 'PAGO-CONFIRMADO';
        }
        // Bancard webhook
        else if (body.operation?.shop_process_id) {
            orderId = body.operation.shop_process_id;
            gateway = 'bancard';

            // Validate Bancard token: MD5(private_key + shop_process_id + amount + currency + "confirmacion")
            const op = body.operation;
            const expectedToken = crypto
                .createHash('md5')
                .update(`${BANCARD_PRIVATE_KEY}${orderId}${op.amount}${op.currency}confirmacion`)
                .digest('hex');

            if (op.token !== expectedToken) {
                console.error('[PaymentConfirm] Invalid Bancard token');
                return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
            }

            isPaid = op.response_code === '00';
        }

        if (!orderId) {
            return NextResponse.json({ error: 'Could not identify order' }, { status: 400 });
        }

        // ── Find the pending payment ──────────────────────────
        const { data: pending } = await (supabase as any)
            .from('pending_payments')
            .select('*')
            .eq('order_id', orderId)
            .single();

        if (!pending) {
            console.warn(`[PaymentConfirm] Order not found: ${orderId}`);
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const p = pending as any;

        if (p.status === 'paid') {
            // Already processed — idempotent
            return NextResponse.json({ success: true, already_processed: true });
        }

        if (!isPaid) {
            // Update status to failed
            await (supabase as any)
                .from('pending_payments')
                .update({ status: 'failed', updated_at: new Date().toISOString() })
                .eq('order_id', orderId);

            return NextResponse.json({ success: true, paid: false });
        }

        // ── Payment confirmed — create or renew sale ──────────
        const { data: customer } = await (supabase as any)
            .from('customers')
            .select('id, full_name, phone, whatsapp_instance')
            .eq('id', p.customer_id)
            .single();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const c = customer as any;
        let newSaleId: string | null = null;

        if (p.sale_id) {
            // Renewal: deactivate old sale, find slot → create new sale
            const { data: oldSale } = await (supabase as any)
                .from('sales')
                .select('slot_id, end_date')
                .eq('id', p.sale_id)
                .single();

            const oldSaleData = oldSale as any;

            // Deactivate old sale
            await (supabase as any)
                .from('sales')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', p.sale_id);

            // Create new sale (1 month from today or from current end_date, whichever is later)
            const today = new Date();
            const currentEnd = oldSaleData?.end_date ? new Date(oldSaleData.end_date + 'T00:00:00') : today;
            const startFrom = currentEnd > today ? currentEnd : today;
            const newEndDate = new Date(startFrom);
            newEndDate.setMonth(newEndDate.getMonth() + 1);

            const startDate = startFrom.toISOString().split('T')[0];
            const endDate = newEndDate.toISOString().split('T')[0];

            const { data: newSale, error: saleError } = await (supabase as any)
                .from('sales')
                .insert({
                    customer_id: p.customer_id,
                    slot_id: oldSaleData?.slot_id,
                    amount_gs: p.amount_gs,
                    payment_method: `${gateway}_auto`,
                    start_date: startDate,
                    end_date: endDate,
                    is_active: true,
                    notes: `Renovación automática via WhatsApp. Orden: ${orderId}`,
                })
                .select('id')
                .single();

            if (saleError) {
                console.error('[PaymentConfirm] Failed to create sale:', saleError);
                return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 });
            }

            newSaleId = (newSale as any)?.id;
        }

        // ── Mark pending payment as paid ──────────────────────
        await (supabase as any)
            .from('pending_payments')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('order_id', orderId);

        // ── Send credentials via WhatsApp ─────────────────────
        if (newSaleId) {
            try {
                await sendCredentialsForSale(newSaleId, c);
            } catch (err: any) {
                console.error('[PaymentConfirm] Failed to send credentials:', err.message);
                // Don't fail the webhook — payment is registered regardless
            }
        } else {
            // No sale_id (new customer or generic payment) — send confirmation only
            const { sendText } = await import('@/lib/whatsapp');
            await sendText(
                c.phone,
                `✅ *¡Pago confirmado!*\n\nGracias ${c.full_name || 'Cliente'} 🙏\nYa recibimos tu pago de Gs. ${p.amount_gs.toLocaleString('es-PY')}.\n\n_En breve vas a recibir más información por este mismo chat._`,
                { customerId: c.id, instanceName: c.whatsapp_instance }
            );
        }

        return NextResponse.json({
            success: true,
            paid: true,
            order_id: orderId,
            sale_id: newSaleId,
        });

    } catch (error: any) {
        console.error('[PaymentConfirm] Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── Helper: send credentials for a newly created sale ────────────────────────

async function sendCredentialsForSale(saleId: string, customer: any) {
    const { data: sale } = await (supabase as any)
        .from('sales')
        .select(`
            id, amount_gs, end_date,
            sale_slots:slot_id (
                slot_identifier, pin_code,
                mother_accounts:mother_account_id (
                    platform, email, password
                )
            )
        `)
        .eq('id', saleId)
        .single();

    if (!sale) return;

    const s = sale as any;
    const slot = s.sale_slots;
    const account = slot?.mother_accounts;

    if (!account?.email || !account?.password) return;

    await sendSaleCredentials({
        customerPhone: customer.phone,
        customerName: customer.full_name || 'Cliente',
        platform: account.platform,
        email: account.email,
        password: account.password,
        profile: slot?.slot_identifier || 'Tu perfil',
        pin: slot?.pin_code || undefined,
        expirationDate: s.end_date || 'N/D',
        customerId: customer.id,
        saleId,
        instanceName: customer.whatsapp_instance,
    });
}
