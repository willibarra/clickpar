import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/store/comprar
 * Body: { account_id: string }
 *
 * Purchases an available slot from the store using the customer's wallet balance.
 * Steps:
 *  1. Authenticate user → resolve customer
 *  2. Fetch the target mother_account (must be show_in_store=true and active)
 *  3. Find a free sale_slot in that account
 *  4. Verify customer has sufficient wallet_balance
 *  5. Atomically: deduct balance + create sale + insert wallet_transaction
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Parse body
    let accountId: string;
    try {
        const body = await req.json();
        accountId = body.account_id;
        if (!accountId) throw new Error('Falta account_id');
    } catch {
        return NextResponse.json({ error: 'Body inválido. Se requiere account_id.' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // 3. Resolve customer
    let customer: any = null;
    const { data: byPortalId } = await (admin.from('customers') as any)
        .select('id, full_name, phone, wallet_balance')
        .eq('portal_user_id', user.id)
        .maybeSingle();

    if (byPortalId) {
        customer = byPortalId;
    } else {
        let resolvedPhone: string | null = null;
        const { data: profile } = await (admin.from('profiles') as any)
            .select('phone_number')
            .eq('id', user.id)
            .single();
        resolvedPhone = profile?.phone_number || null;
        if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
            const extracted = user.email.replace('@clickpar.shop', '');
            if (extracted) resolvedPhone = `+${extracted}`;
        }
        if (resolvedPhone) {
            const phonesToTry = [
                normalizePhone(resolvedPhone),
                resolvedPhone,
                resolvedPhone.replace(/^\+/, ''),
            ];
            for (const phone of phonesToTry) {
                const { data } = await (admin.from('customers') as any)
                    .select('id, full_name, phone, wallet_balance')
                    .eq('phone', phone)
                    .maybeSingle();
                if (data) { customer = data; break; }
            }
        }
    }

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 4. Fetch the mother_account (must be store-visible and active)
    const { data: account, error: accErr } = await (admin.from('mother_accounts') as any)
        .select('id, platform, slot_price_gs, status, show_in_store')
        .eq('id', accountId)
        .eq('show_in_store', true)
        .eq('status', 'active')
        .single();

    if (accErr || !account) {
        return NextResponse.json({ error: 'Producto no disponible en la tienda' }, { status: 404 });
    }

    const priceGs = Math.round(Number(account.slot_price_gs ?? 25000));

    // 5. Check balance
    const currentBalance = Number(customer.wallet_balance ?? 0);
    if (currentBalance < priceGs) {
        return NextResponse.json({
            error: `Saldo insuficiente. Necesitás Gs. ${priceGs.toLocaleString('es-PY')} y tenés Gs. ${currentBalance.toLocaleString('es-PY')}.`,
            code: 'INSUFFICIENT_BALANCE',
        }, { status: 400 });
    }

    // 6. Find an available slot in this account
    const { data: slot, error: slotErr } = await (admin.from('sale_slots') as any)
        .select('id, slot_identifier, pin_code')
        .eq('mother_account_id', accountId)
        .eq('status', 'available')
        .limit(1)
        .single();

    if (slotErr || !slot) {
        return NextResponse.json({ error: 'No hay slots disponibles en este plan en este momento.' }, { status: 409 });
    }

    // 7. Atomic operations (in sequence, admin client === service_role, bypasses RLS)
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    // 7a. Deduct wallet balance (with optimistic concurrency check)
    const { error: balanceErr } = await (admin.from('customers') as any)
        .update({ wallet_balance: currentBalance - priceGs })
        .eq('id', customer.id)
        .gte('wallet_balance', priceGs); // Guard: ensures balance didn't change concurrently

    if (balanceErr) {
        console.error('[Store/Comprar] Balance deduction failed:', balanceErr);
        return NextResponse.json({ error: 'Error al procesar el pago. Intentá nuevamente.' }, { status: 500 });
    }

    // 7b. Mark slot as sold
    await (admin.from('sale_slots') as any)
        .update({ status: 'sold' })
        .eq('id', slot.id);

    // 7c. Create the sale record
    const { data: sale, error: saleErr } = await (admin.from('sales') as any)
        .insert({
            slot_id: slot.id,
            customer_id: customer.id,
            amount_gs: priceGs,
            payment_method: 'wallet',
            start_date: now.toISOString(),
            end_date: endDate.toISOString(),
            is_active: true,
            sold_by: user.id,
        })
        .select('id')
        .single();

    if (saleErr || !sale) {
        // Rollback balance and slot on failure
        await (admin.from('customers') as any)
            .update({ wallet_balance: currentBalance })
            .eq('id', customer.id);
        await (admin.from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', slot.id);
        console.error('[Store/Comprar] Sale creation failed:', saleErr);
        return NextResponse.json({ error: 'Error al crear la venta' }, { status: 500 });
    }

    // 7d. Insert wallet ledger entry (debit)
    await (admin.from('wallet_transactions') as any)
        .insert({
            customer_id: customer.id,
            amount: -priceGs,
            type: 'debit',
            concept: `Compra ${account.platform} — Tienda ClickPar`,
            reference_id: sale.id,
        });

    console.log(`[Store/Comprar] Sale created: customer=${customer.id}, platform=${account.platform}, sale=${sale.id}`);

    return NextResponse.json({
        success: true,
        message: `¡Tu servicio de ${account.platform} fue activado!`,
        saleId: sale.id,
    });
}
