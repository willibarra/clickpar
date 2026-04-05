import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/store
 * Returns all mother_accounts where show_in_store = true.
 * Does NOT expose credentials — only public catalog info.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch visible products with available slot count
    const { data: accounts, error } = await (admin.from('mother_accounts') as any)
        .select(`
            id,
            platform,
            slot_price_gs,
            max_slots,
            sale_slots!inner(id, status)
        `)
        .eq('show_in_store', true)
        .eq('status', 'active')
        .eq('sale_slots.status', 'available');

    if (error) {
        // If no slots available per INNER JOIN, fall back to accounts without available slots
        const { data: allAccounts, error: err2 } = await (admin.from('mother_accounts') as any)
            .select('id, platform, slot_price_gs, max_slots')
            .eq('show_in_store', true)
            .eq('status', 'active');

        if (err2) {
            console.error('[Store API] Error:', err2);
            return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
        }

        const products = (allAccounts || []).map((acc: any) => ({
            id: acc.id,
            platform: acc.platform,
            priceGs: Number(acc.slot_price_gs ?? 25000),
            availableSlots: 0,
        }));

        return NextResponse.json({ success: true, products });
    }

    // Group by mother account — count available slots
    const accountMap = new Map<string, any>();
    for (const row of (accounts || [])) {
        if (!accountMap.has(row.id)) {
            accountMap.set(row.id, {
                id: row.id,
                platform: row.platform,
                priceGs: Number(row.slot_price_gs ?? 25000),
                availableSlots: 0,
            });
        }
        accountMap.get(row.id)!.availableSlots += 1;
    }

    const products = Array.from(accountMap.values());

    return NextResponse.json({ success: true, products });
}
