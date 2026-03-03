import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

/**
 * GET /api/portal/services
 * Returns active services for the authenticated customer.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Get profile with phone
    const { data: profile } = await (admin.from('profiles') as any)
        .select('id, full_name, phone_number')
        .eq('id', user.id)
        .single();

    if (!profile?.phone_number) {
        return NextResponse.json({
            success: true,
            customer: { name: profile?.full_name || user.email, phone: null },
            services: [],
            totalActive: 0,
        });
    }

    // Find customer by phone
    const { data: customer } = await (admin.from('customers') as any)
        .select('id, full_name')
        .eq('phone', normalizePhone(profile.phone_number))
        .single();

    if (!customer) {
        return NextResponse.json({
            success: true,
            customer: { name: profile.full_name || user.email, phone: profile.phone_number },
            services: [],
            totalActive: 0,
        });
    }

    // Step 1: Get active sales
    const { data: sales, error: salesError } = await (admin.from('sales') as any)
        .select('id, amount_gs, start_date, end_date, is_active, slot_id')
        .eq('customer_id', customer.id)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    if (salesError) {
        console.error('[Portal] Error fetching sales:', salesError);
        return NextResponse.json({ error: 'Error al obtener servicios' }, { status: 500 });
    }

    if (!sales || sales.length === 0) {
        return NextResponse.json({
            success: true,
            customer: { name: profile.full_name || customer.full_name, phone: profile.phone_number },
            services: [],
            totalActive: 0,
        });
    }

    // Step 2: Get slot details for each sale
    const slotIds = sales.map((s: any) => s.slot_id).filter(Boolean);
    let slotMap = new Map<string, any>();

    if (slotIds.length > 0) {
        const { data: slots } = await (admin.from('sale_slots') as any)
            .select('id, slot_identifier, pin_code, status, mother_account_id')
            .in('id', slotIds);

        if (slots) {
            // Step 3: Get mother account details
            const accountIds = [...new Set(slots.map((s: any) => s.mother_account_id).filter(Boolean))];
            let accountMap = new Map<string, any>();

            if (accountIds.length > 0) {
                const { data: accounts } = await admin
                    .from('mother_accounts')
                    .select('id, platform, email, password, renewal_date, status')
                    .in('id', accountIds);

                (accounts || []).forEach((a: any) => accountMap.set(a.id, a));
            }

            slots.forEach((s: any) => {
                slotMap.set(s.id, {
                    ...s,
                    mother_account: accountMap.get(s.mother_account_id) || null,
                });
            });
        }
    }

    // Build services array
    const services = sales.map((sale: any) => {
        const slot = slotMap.get(sale.slot_id);
        const account = slot?.mother_account;
        return {
            saleId: sale.id,
            platform: account?.platform || 'Desconocido',
            email: account?.email || '',
            password: account?.password || '',
            pin: slot?.pin_code || null,
            profile: slot?.slot_identifier || null,
            startDate: sale.start_date,
            expiresAt: sale.end_date,
            renewalDate: account?.renewal_date || null,
            amount: sale.amount_gs,
        };
    }).filter((s: any) => s.email);

    return NextResponse.json({
        success: true,
        customer: {
            name: profile.full_name || customer.full_name || user.email,
            phone: profile.phone_number,
        },
        services,
        totalActive: services.length,
    });
}
