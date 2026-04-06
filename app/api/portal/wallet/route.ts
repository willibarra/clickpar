import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveCustomer } from '@/lib/utils/resolve-customer';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/wallet
 * Returns the wallet balance and last 50 wallet_transactions for the authenticated customer.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Resolve customer via centralized helper
    const customer = await resolveCustomer(admin, user.id, user.email);

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Fetch wallet movement history
    const { data: movements, error } = await (admin.from('wallet_transactions') as any)
        .select('id, amount, type, concept, reference_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('[Wallet API] Error fetching movements:', error);
        return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        balance: Number(customer.wallet_balance ?? 0),
        movements: movements || [],
    });
}
