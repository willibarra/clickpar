import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPaymentOrder } from '@/lib/pagopar';
import { resolveCustomer } from '@/lib/utils/resolve-customer';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pagopar/crear-pago
 *
 * Mode 1 — Subscription renewal (default):
 *   Body: { sale_id: string }
 *
 * Mode 2 — Wallet top-up:
 *   Body: { type: 'wallet_topup', amount_gs: number }
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Parse body
    let saleId: string | undefined;
    let transactionType: 'subscription_renewal' | 'wallet_topup' = 'subscription_renewal';
    let topupAmountGs: number | undefined;
    try {
        const body = await req.json();
        saleId = body.sale_id;
        if (body.type === 'wallet_topup') {
            transactionType = 'wallet_topup';
            topupAmountGs = Number(body.amount_gs);
            if (!topupAmountGs || topupAmountGs <= 0) throw new Error('Monto inválido para recarga');
            if (topupAmountGs < 5000) throw new Error('El monto mínimo de recarga es Gs. 5.000');
        } else if (!saleId) {
            throw new Error('Falta sale_id');
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Body inválido.' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // 3. Resolve customer (centralized helper)
    const customer = await resolveCustomer(admin, user.id, user.email);

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 5 & 6. For subscription renewals: fetch sale + resolve platform name
    let sale: any = null;
    let platformName = 'Streaming';

    if (transactionType === 'subscription_renewal') {
        const { data: saleData, error: saleError } = await (admin.from('sales') as any)
            .select('id, amount_gs, end_date, is_active, customer_id, slot_id')
            .eq('id', saleId)
            .eq('customer_id', customer.id)
            .single();

        if (saleError || !saleData) {
            return NextResponse.json({ error: 'Venta no encontrada o no pertenece al usuario' }, { status: 404 });
        }
        sale = saleData;

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
    }

    const amountGs = transactionType === 'wallet_topup'
        ? topupAmountGs!
        : Math.round(sale.amount_gs);

    if (!amountGs || amountGs <= 0) {
        return NextResponse.json({ error: 'El monto es inválido' }, { status: 400 });
    }

    // 7. Create a pending transaction record to get a stable order ID
    const { data: transaction, error: txError } = await (admin.from('transactions') as any)
        .insert({
            customer_id: user.id,
            amount: amountGs,
            currency: 'PYG',
            status: 'pending',
            origin_source: 'pagopar',
            subscription_id: transactionType === 'subscription_renewal' ? saleId : null,
            transaction_type: transactionType,
        })
        .select('id')
        .single();

    if (txError || !transaction) {
        console.error('[PagoPar] Error inserting transaction:', txError);
        return NextResponse.json({ error: 'Error al crear la transacción' }, { status: 500 });
    }

    const orderId = transaction.id as string;

    // 8. Call PagoPar API
    const customerName = customer.full_name || 'Cliente ClickPar';
    const customerPhone = customer.phone || '595994540904';
    const customerEmail = user.email || 'cliente@clickpar.shop';
    const paymentDescription = transactionType === 'wallet_topup'
        ? 'Recarga de Saldo'
        : platformName;

    const result = await createPaymentOrder({
        orderId,
        amountGs,
        customerName,
        customerPhone,
        customerEmail,
        platform: paymentDescription,
    });

    if (!result.success || !result.paymentUrl) {
        // Clean up the pending transaction on failure
        await (admin.from('transactions') as any).delete().eq('id', orderId);
        return NextResponse.json({ error: result.error || 'Error al crear orden en PagoPar' }, { status: 502 });
    }

    // 9. Save the PagoPar hash back into the transaction
    await (admin.from('transactions') as any)
        .update({
            pagopar_hash: result.pagoparHash,
            pagopar_order_id: orderId,
            reference_code: result.pagoparHash,
        })
        .eq('id', orderId);

    return NextResponse.json({
        success: true,
        paymentUrl: result.paymentUrl,
        transactionId: orderId,
    });
}
