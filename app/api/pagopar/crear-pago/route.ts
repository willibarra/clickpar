import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPaymentOrder } from '@/lib/pagopar';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pagopar/crear-pago
 * Body: { sale_id: string }
 * Creates a PagoPar payment order for the authenticated customer and returns the payment URL.
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Parse body
    let saleId: string;
    try {
        const body = await req.json();
        saleId = body.sale_id;
        if (!saleId) throw new Error('Falta sale_id');
    } catch {
        return NextResponse.json({ error: 'Body inválido. Se requiere sale_id.' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // 3. Get user profile & phone
    const { data: profile } = await (admin.from('profiles') as any)
        .select('id, full_name, phone_number')
        .eq('id', user.id)
        .single();

    let resolvedPhone: string | null = profile?.phone_number || null;
    if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
        const extracted = user.email.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    // 4. Find customer record (to get full_name and verify this sale belongs to them)
    let customer: any = null;
    if (resolvedPhone) {
        const phonesToTry = [
            normalizePhone(resolvedPhone),
            resolvedPhone,
            resolvedPhone.replace(/^\+/, ''),
        ];
        for (const phone of phonesToTry) {
            const { data } = await (admin.from('customers') as any)
                .select('id, full_name, phone')
                .eq('phone', phone)
                .maybeSingle();
            if (data) { customer = data; break; }
        }
    }

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 5. Fetch the sale and verify it belongs to this customer
    const { data: sale, error: saleError } = await (admin.from('sales') as any)
        .select('id, amount_gs, end_date, is_active, customer_id, slot_id')
        .eq('id', saleId)
        .eq('customer_id', customer.id)
        .single();

    if (saleError || !sale) {
        return NextResponse.json({ error: 'Venta no encontrada o no pertenece al usuario' }, { status: 404 });
    }

    // 6. Get platform name from slot → mother_account
    let platformName = 'Streaming';
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

    const amountGs = Math.round(sale.amount_gs);
    if (!amountGs || amountGs <= 0) {
        return NextResponse.json({ error: 'El monto de la venta es inválido' }, { status: 400 });
    }

    // 7. Create a pending transaction record to get a stable order ID
    const { data: transaction, error: txError } = await (admin.from('transactions') as any)
        .insert({
            customer_id: user.id,
            amount: amountGs,
            currency: 'PYG',
            status: 'pending',
            origin_source: 'pagopar',
            subscription_id: saleId,
        })
        .select('id')
        .single();

    if (txError || !transaction) {
        console.error('[PagoPar] Error inserting transaction:', txError);
        return NextResponse.json({ error: 'Error al crear la transacción' }, { status: 500 });
    }

    const orderId = transaction.id as string;

    // 8. Call PagoPar API
    const customerName = customer.full_name || profile?.full_name || 'Cliente ClickPar';
    const customerPhone = customer.phone || resolvedPhone || '595994540904';
    const customerEmail = user.email || 'cliente@clickpar.shop';

    const result = await createPaymentOrder({
        orderId,
        amountGs,
        customerName,
        customerPhone,
        customerEmail,
        platform: platformName,
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
