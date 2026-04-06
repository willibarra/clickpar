import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveCustomer } from '@/lib/utils/resolve-customer';
export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/store/comprar
 * Body: { account_id: string }
 *
 * Purchases an available slot from the store using the customer's wallet balance.
 * Uses the `purchase_from_store` PostgreSQL RPC for full atomicity:
 *  - SELECT FOR UPDATE on customer row (prevents double-spend)
 *  - FOR UPDATE SKIP LOCKED on slots (prevents double-assign)
 *  - Atomic balance deduction + sale creation + ledger entry
 *  - Automatic rollback if any step fails
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

    // 3. Resolve customer (centralized helper)
    const customer = await resolveCustomer(admin, user.id, user.email);
    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 4. Execute atomic purchase via RPC
    const { data: result, error: rpcError } = await (admin.rpc as any)('purchase_from_store', {
        p_customer_id: customer.id,
        p_account_id: accountId,
        p_user_id: user.id,
    });

    if (rpcError) {
        console.error('[Store/Comprar] RPC error:', rpcError);
        return NextResponse.json({ error: 'Error al procesar la compra. Intentá nuevamente.' }, { status: 500 });
    }

    const rpcResult = result as { success: boolean; error?: string; code?: string; sale_id?: string; platform?: string; amount?: number; new_balance?: number; required?: number; available?: number };

    if (!rpcResult.success) {
        // Map RPC errors to HTTP statuses
        const status = rpcResult.code === 'INSUFFICIENT_BALANCE' ? 400
            : rpcResult.error?.includes('no disponible') ? 404
            : rpcResult.error?.includes('slots') ? 409
            : 400;

        const errorMsg = rpcResult.code === 'INSUFFICIENT_BALANCE'
            ? `Saldo insuficiente. Necesitás Gs. ${(rpcResult.required ?? 0).toLocaleString('es-PY')} y tenés Gs. ${(rpcResult.available ?? 0).toLocaleString('es-PY')}.`
            : rpcResult.error;

        return NextResponse.json({
            error: errorMsg,
            code: rpcResult.code,
        }, { status });
    }

    console.log(`[Store/Comprar] Sale created: customer=${customer.id}, platform=${rpcResult.platform}, sale=${rpcResult.sale_id}`);

    return NextResponse.json({
        success: true,
        message: `¡Tu servicio de ${rpcResult.platform} fue activado!`,
        saleId: rpcResult.sale_id,
    });
}
