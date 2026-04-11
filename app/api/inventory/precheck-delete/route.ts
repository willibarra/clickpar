

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Pre-check before deleting a mother account.
 * Returns warnings about active clients, expired clients, unexpired renewal, and store listing.
 * 
 * - activeClients: clients whose sale is_active AND end_date >= today → BLOCKS deletion
 * - expiredClients: clients whose sale is_active BUT end_date < today → auto-deactivated on delete
 */
export async function GET(request: NextRequest) {
    const accountId = request.nextUrl.searchParams.get('id');
    if (!accountId) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Get account info (status, renewal_date, show_in_store)
    const { data: account, error: accError } = await (supabase.from('mother_accounts') as any)
        .select('id, platform, email, status, renewal_date, show_in_store')
        .eq('id', accountId)
        .single();

    if (accError || !account) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    // 2. Get all slots with their status
    const { data: slots } = await (supabase.from('sale_slots') as any)
        .select('id, slot_identifier, status')
        .eq('mother_account_id', accountId);

    const allSlots = slots || [];
    const soldSlots = allSlots.filter((s: any) => s.status === 'sold');

    // 3. For sold slots, find active sales with customer info
    type ClientInfo = { name: string; phone: string; slot: string; end_date: string };
    const activeClients: ClientInfo[] = [];
    const expiredClients: ClientInfo[] = [];

    if (soldSlots.length > 0) {
        const slotIds = soldSlots.map((s: any) => s.id);
        const { data: sales } = await (supabase.from('sales') as any)
            .select(`
                id, end_date,
                slot_id,
                customers:customer_id (full_name, phone)
            `)
            .in('slot_id', slotIds)
            .eq('is_active', true);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (sales) {
            for (const sale of sales) {
                const slotInfo = soldSlots.find((s: any) => s.id === sale.slot_id);
                const client: ClientInfo = {
                    name: sale.customers?.full_name || 'Sin nombre',
                    phone: sale.customers?.phone || '',
                    slot: slotInfo?.slot_identifier || '—',
                    end_date: sale.end_date || '',
                };

                // Classify: truly active (end_date >= today or no end_date) vs expired
                const endDate = sale.end_date ? new Date(sale.end_date + 'T23:59:59') : null;
                if (endDate && endDate < today) {
                    expiredClients.push(client);
                } else {
                    activeClients.push(client);
                }
            }
        }
    }

    // 4. Check if renewal is still active (not expired)
    const isActive = account.status === 'active';
    const renewalDate = account.renewal_date;
    const isNotExpired = renewalDate
        ? new Date(renewalDate + 'T23:59:59') >= new Date()
        : false;

    // 5. Check if listed in store
    const isInStore = account.show_in_store === true;

    return NextResponse.json({
        platform: account.platform,
        email: account.email,
        status: account.status,
        activeClients,
        expiredClients,
        soldSlotsCount: soldSlots.length,
        totalSlotsCount: allSlots.length,
        isActive,
        isNotExpired,
        renewalDate,
        isInStore,
    });
}
