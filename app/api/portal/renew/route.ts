import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveCustomer } from '@/lib/utils/resolve-customer';
export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/renew
 * Body: { sale_id: string }
 *
 * Renews an existing active sale using the customer's wallet balance.
 * Extends end_date by 30 days and debits the wallet.
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate
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

    // 3. Resolve customer
    const customer = await resolveCustomer(admin, user.id, user.email);
    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 4. Get the sale and verify it belongs to this customer
    const { data: sale, error: saleError } = await (admin.from('sales') as any)
        .select('id, amount_gs, end_date, customer_id, is_active')
        .eq('id', saleId)
        .single();

    if (saleError || !sale) {
        return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    if (sale.customer_id !== customer.id) {
        return NextResponse.json({ error: 'Esta venta no te pertenece' }, { status: 403 });
    }

    if (!sale.is_active) {
        return NextResponse.json({ error: 'Esta venta ya no está activa' }, { status: 400 });
    }

    const renewalAmount = Number(sale.amount_gs);
    if (!renewalAmount || renewalAmount <= 0) {
        return NextResponse.json({ error: 'No se puede determinar el monto de renovación' }, { status: 400 });
    }

    // 5. Check wallet balance
    const { data: customerData } = await (admin.from('customers') as any)
        .select('wallet_balance')
        .eq('id', customer.id)
        .single();

    const currentBalance = Number(customerData?.wallet_balance ?? 0);

    if (currentBalance < renewalAmount) {
        return NextResponse.json({
            error: `Saldo insuficiente. Necesitás Gs. ${renewalAmount.toLocaleString('es-PY')} y tenés Gs. ${currentBalance.toLocaleString('es-PY')}.`,
            code: 'INSUFFICIENT_BALANCE',
            required: renewalAmount,
            available: currentBalance,
        }, { status: 400 });
    }

    // 6. Compute new end_date (extend from current end_date or from today if expired)
    const now = new Date();
    const currentEnd = sale.end_date ? new Date(sale.end_date) : now;
    const baseDate = currentEnd > now ? currentEnd : now;
    const newEndDate = new Date(baseDate);
    newEndDate.setDate(newEndDate.getDate() + 30);
    const newEndDateStr = newEndDate.toISOString().split('T')[0];

    // 7. Execute atomically: debit wallet + update sale + log ledger entry
    // Debit wallet
    const { error: debitError } = await (admin.from('customers') as any)
        .update({ wallet_balance: currentBalance - renewalAmount })
        .eq('id', customer.id);

    if (debitError) {
        console.error('[Renew] Error debiting wallet:', debitError);
        return NextResponse.json({ error: 'Error al debitar saldo' }, { status: 500 });
    }

    // Update sale end_date
    const { error: updateError } = await (admin.from('sales') as any)
        .update({ end_date: newEndDateStr })
        .eq('id', saleId);

    if (updateError) {
        // Rollback wallet debit
        await (admin.from('customers') as any)
            .update({ wallet_balance: currentBalance })
            .eq('id', customer.id);
        console.error('[Renew] Error updating sale:', updateError);
        return NextResponse.json({ error: 'Error al renovar. Saldo restaurado.' }, { status: 500 });
    }

    // Log wallet movement
    await (admin.from('wallet_ledger') as any).insert({
        customer_id: customer.id,
        amount: -renewalAmount,
        type: 'debit',
        concept: `Renovación de servicio`,
        reference_id: saleId,
    });

    console.log(`[Renew] Sale ${saleId} renewed: customer=${customer.id}, amount=${renewalAmount}, newEnd=${newEndDateStr}`);

    return NextResponse.json({
        success: true,
        message: '¡Tu servicio fue renovado!',
        newEndDate: newEndDateStr,
        newBalance: currentBalance - renewalAmount,
    });
}
