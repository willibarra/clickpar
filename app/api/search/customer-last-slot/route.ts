import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/search/customer-last-slot?customerId=...&platform=...
 *
 * Finds the customer's most recent INACTIVE sale for the given platform (optional),
 * checks if that slot is still available, and returns the slot info.
 *
 * Response:
 *   { found: false }                          — no previous sale
 *   { found: true, slotAvailable: false, ... } — had a slot but it's taken
 *   { found: true, slotAvailable: true,  ... } — had a slot AND it's free → suggest it!
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const platform = searchParams.get('platform'); // optional filter

    if (!customerId) {
        return NextResponse.json({ found: false });
    }

    const supabase = await createAdminClient();

    // 1. Find the most recent inactive sale for this customer
    //    (is_active = false means the subscription ended / was suspended)
    let query = (supabase.from('sales') as any)
        .select('id, slot_id, start_date, end_date, amount_gs')
        .eq('customer_id', customerId)
        .eq('is_active', false)
        .order('start_date', { ascending: false })
        .limit(10); // grab a few in case some have no slot

    const { data: inactiveSales } = await query;

    if (!inactiveSales || inactiveSales.length === 0) {
        return NextResponse.json({ found: false });
    }

    // 2. Get slot info for each inactive sale
    const slotIds = inactiveSales
        .filter((s: any) => s.slot_id)
        .map((s: any) => s.slot_id);

    if (slotIds.length === 0) {
        return NextResponse.json({ found: false });
    }

    const { data: slots } = await (supabase.from('sale_slots') as any)
        .select('id, status, slot_identifier, pin_code, mother_accounts:mother_account_id(id, platform, email, status, deleted_at)')
        .in('id', slotIds);

    if (!slots || slots.length === 0) {
        return NextResponse.json({ found: false });
    }

    // Build a map for quick lookup
    const slotMap = new Map<string, any>(slots.map((s: any) => [s.id, s]));

    // 3. Find the best match:
    //    - If platform is specified, prefer that platform
    //    - Prefer a slot that is currently 'available'
    //    - Fall back to any slot from the most recent sale

    // Filter by platform if provided
    const candidates = inactiveSales
        .filter((sale: any) => sale.slot_id && slotMap.has(sale.slot_id))
        .map((sale: any) => {
            const slot = slotMap.get(sale.slot_id);
            const acct = slot?.mother_accounts;
            return {
                sale,
                slot,
                platform: acct?.platform || null,
                accountEmail: acct?.email || null,
                accountDeleted: !!acct?.deleted_at,
                accountStatus: acct?.status || null,
                slotStatus: slot?.status || null,
                slotIdentifier: slot?.slot_identifier || null,
                pinCode: slot?.pin_code || null,
            };
        })
        .filter((c: any) => !c.accountDeleted && c.accountStatus === 'active'); // skip if account was deleted

    if (candidates.length === 0) {
        // Account was deleted or inactive — return "found but not available"
        const lastSale = inactiveSales[0];
        const slot = slotMap.get(lastSale.slot_id);
        const acct = slot?.mother_accounts;
        return NextResponse.json({
            found: true,
            slotAvailable: false,
            platform: acct?.platform || null,
            accountEmail: acct?.email || null,
            slotIdentifier: slot?.slot_identifier || null,
            lastSaleDate: lastSale.start_date,
            reason: 'account_unavailable',
        });
    }

    // Prefer matching platform if specified
    const platformCandidates = platform
        ? candidates.filter((c: any) => c.platform === platform)
        : candidates;

    const pool = platformCandidates.length > 0 ? platformCandidates : candidates;

    // Prefer available slots
    const available = pool.filter((c: any) => c.slotStatus === 'available');
    const best = available[0] || pool[0];

    return NextResponse.json({
        found: true,
        slotAvailable: best.slotStatus === 'available',
        slotId: best.slot.id,
        slotIdentifier: best.slotIdentifier,
        pinCode: best.pinCode,
        platform: best.platform,
        accountEmail: best.accountEmail,
        lastSaleDate: best.sale.start_date,
        lastAmount: best.sale.amount_gs,
        reason: best.slotStatus === 'available' ? 'slot_free' : 'slot_taken',
    });
}
