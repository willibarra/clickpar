import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

/**
 * GET /api/portal/history
 * Returns payment history for the authenticated customer.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Get profile phone
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    if (!profile?.phone_number) {
        return NextResponse.json({ success: true, history: [], totalSpent: 0, totalServices: 0 });
    }

    // Find customer by phone
    const { data: customer } = await (admin.from('customers') as any)
        .select('id')
        .eq('phone', normalizePhone(profile.phone_number))
        .single();

    if (!customer) {
        return NextResponse.json({ success: true, history: [], totalSpent: 0, totalServices: 0 });
    }

    // Step 1: Get all sales
    const { data: sales, error } = await (admin.from('sales') as any)
        .select('id, amount_gs, start_date, end_date, is_active, slot_id')
        .eq('customer_id', customer.id)
        .order('start_date', { ascending: false })
        .limit(50);

    if (error) {
        console.error('[Portal] Error fetching history:', error);
        return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 });
    }

    if (!sales || sales.length === 0) {
        return NextResponse.json({ success: true, history: [], totalSpent: 0, totalServices: 0 });
    }

    // Step 2: Get slot→platform mapping
    const slotIds = [...new Set(sales.map((s: any) => s.slot_id).filter(Boolean))];
    let platformMap = new Map<string, { platform: string; profile: string }>();

    if (slotIds.length > 0) {
        const { data: slots } = await (admin.from('sale_slots') as any)
            .select('id, slot_identifier, mother_account_id')
            .in('id', slotIds);

        if (slots) {
            const accountIds = [...new Set(slots.map((s: any) => s.mother_account_id).filter(Boolean))];
            let accountPlatforms = new Map<string, string>();

            if (accountIds.length > 0) {
                const { data: accounts } = await admin
                    .from('mother_accounts')
                    .select('id, platform')
                    .in('id', accountIds);
                (accounts || []).forEach((a: any) => accountPlatforms.set(a.id, a.platform));
            }

            slots.forEach((s: any) => {
                platformMap.set(s.id, {
                    platform: accountPlatforms.get(s.mother_account_id) || 'Desconocido',
                    profile: s.slot_identifier || null,
                });
            });
        }
    }

    const history = sales.map((sale: any) => {
        const info = platformMap.get(sale.slot_id);
        return {
            id: sale.id,
            platform: info?.platform || 'Desconocido',
            amount: sale.amount_gs,
            startDate: sale.start_date,
            endDate: sale.end_date,
            isActive: sale.is_active,
            profile: info?.profile || null,
        };
    });

    const totalSpent = history.reduce((sum: number, h: any) => sum + (h.amount || 0), 0);

    return NextResponse.json({
        success: true,
        history,
        totalSpent,
        totalServices: history.length,
    });
}
