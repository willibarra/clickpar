import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/customers/wallet/topup
 * Admin-only: Manually credits a customer's wallet balance.
 * Body: { customer_id: string, amount: number, note: string }
 *
 * Uses the atomic `credit_wallet` RPC to prevent race conditions.
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Verify admin role
    const admin = await createAdminClient();
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['super_admin', 'staff'].includes(profile.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // 3. Parse body
    let customerId: string;
    let amount: number;
    let note: string;

    try {
        const body = await req.json();
        customerId = body.customer_id;
        amount = Number(body.amount);
        note = (body.note || '').trim();

        if (!customerId) throw new Error('Falta customer_id');
        if (!amount || amount <= 0) throw new Error('El monto debe ser mayor a 0');
        if (amount > 50_000_000) throw new Error('Monto excede el límite permitido');
        if (!note) throw new Error('La nota/referencia es obligatoria');
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Body inválido' }, { status: 400 });
    }

    // 4. Verify customer exists
    const { data: customer, error: custErr } = await (admin.from('customers') as any)
        .select('id, full_name')
        .eq('id', customerId)
        .single();

    if (custErr || !customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 5. Credit wallet atomically via RPC
    const concept = `Carga manual — ${note}`;
    const { data: result, error: rpcError } = await (admin.rpc as any)('credit_wallet', {
        p_customer_id: customerId,
        p_amount: amount,
        p_concept: concept,
        p_reference_id: null,
    });

    if (rpcError) {
        console.error('[Admin/Wallet/Topup] RPC error:', rpcError);
        return NextResponse.json({ error: 'Error al acreditar saldo' }, { status: 500 });
    }

    if (!(result as any)?.success) {
        return NextResponse.json({ error: (result as any)?.error || 'Error desconocido' }, { status: 400 });
    }

    const newBalance = (result as any).new_balance;

    console.log(`[Admin/Wallet/Topup] Admin ${user.id} credited Gs.${amount} to customer ${customerId} (${customer.full_name}). Note: "${note}". New balance: Gs.${newBalance}`);

    return NextResponse.json({
        success: true,
        new_balance: newBalance,
        customer_name: customer.full_name,
    });
}
