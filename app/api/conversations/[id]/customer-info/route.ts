import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/[id]/customer-info
 * Returns enriched customer info for a conversation: contact, active sales, last 5 sales, open tickets.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createAdminClient();

    // Get conversation with customer
    const { data: conv } = await (supabase
        .from('conversations' as any) as any)
        .select('customer_id, wa_phone')
        .eq('id', id)
        .single();

    if (!conv?.customer_id) {
        return NextResponse.json({ error: 'No customer linked' }, { status: 404 });
    }

    // Fetch customer details
    const { data: customer } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, created_at')
        .eq('id', conv.customer_id)
        .single();

    if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Active sales with platform
    const { data: activeSales } = await supabase
        .from('sales')
        .select(`
            id, end_date, amount_gs, is_active, created_at,
            sale_slots:slot_id (
                id,
                slot_identifier,
                mother_accounts:mother_account_id (
                    platform, email
                )
            )
        `)
        .eq('customer_id', conv.customer_id)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    // Last 5 inactive sales (history)
    const { data: pastSales } = await supabase
        .from('sales')
        .select(`
            id, end_date, amount_gs, is_active, created_at,
            sale_slots:slot_id (
                slot_identifier,
                mother_accounts:mother_account_id (
                    platform
                )
            )
        `)
        .eq('customer_id', conv.customer_id)
        .eq('is_active', false)
        .order('end_date', { ascending: false })
        .limit(5);

    // Open tickets
    const { data: tickets } = await (supabase
        .from('tickets' as any) as any)
        .select('id, subject, status, created_at')
        .eq('customer_id', conv.customer_id)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(5);

    return NextResponse.json({
        customer,
        active_sales: activeSales || [],
        past_sales: pastSales || [],
        tickets: tickets || [],
        wa_phone: conv.wa_phone,
    });
}
