import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';

    if (q.length < 2) {
        return NextResponse.json({ inventoryCount: 0, customersCount: 0 });
    }

    const supabase = await createAdminClient();
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    // ── 1. Check Inventory (mother accounts + slots with matching customer) ──
    let inventoryCount = 0;
    try {
        // Search mother accounts by platform/email
        const { data: accounts } = await supabase
            .from('mother_accounts')
            .select('id, platform, email')
            .is('deleted_at', null);

        const matchingAccounts = (accounts || []).filter((a: any) => {
            const vec = `${a.platform} ${a.email}`.toLowerCase();
            return vec.includes(qLower);
        });

        // Search customers by name/phone, then find their active sales/slots
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone');

        const matchingCustomers = (customers || []).filter((c: any) => {
            const nameMatch = (c.full_name || '').toLowerCase().includes(qLower);
            if (nameMatch) return true;
            if (qDigits.length >= 4) {
                return (c.phone || '').replace(/\D/g, '').includes(qDigits);
            }
            return (c.phone || '').includes(q);
        });

        const matchingCustomerIds = matchingCustomers.map((c: any) => c.id);

        let slotsWithMatchingCustomer = 0;
        if (matchingCustomerIds.length > 0) {
            const { data: activeSales } = await supabase
                .from('sales')
                .select('slot_id')
                .eq('is_active', true)
                .in('customer_id', matchingCustomerIds);
            slotsWithMatchingCustomer = (activeSales || []).length;
        }

        inventoryCount = matchingAccounts.length + slotsWithMatchingCustomer;
    } catch (_) {
        inventoryCount = 0;
    }

    // ── 2. Check Customers table ──
    let customersCount = 0;
    let firstCustomerId: string | null = null;
    try {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone')
            .order('created_at', { ascending: false });

        const matches = (customers || []).filter((c: any) => {
            const nameMatch = (c.full_name || '').toLowerCase().includes(qLower);
            if (nameMatch) return true;
            if (qDigits.length >= 4) {
                return (c.phone || '').replace(/\D/g, '').includes(qDigits);
            }
            return (c.phone || '').includes(q);
        });

        customersCount = matches.length;
        firstCustomerId = matches[0]?.id || null;
    } catch (_) {
        customersCount = 0;
    }

    return NextResponse.json({
        inventoryCount,
        customersCount,
        firstCustomerId,
        query: q,
    });
}
