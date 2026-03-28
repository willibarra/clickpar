import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/payments
 * Returns transaction payment history for the authenticated customer.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch transactions for this user (customer_id = auth user id)
    const { data: transactions, error } = await (admin.from('transactions') as any)
        .select('id, amount, currency, status, origin_source, created_at')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('[Portal Payments] Error:', error);
        return NextResponse.json({ error: 'Error al obtener pagos' }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        payments: transactions || [],
    });
}
