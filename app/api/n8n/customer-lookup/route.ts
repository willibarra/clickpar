import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/utils/phone';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/n8n/customer-lookup
 *
 * Called by N8N to identify a customer by their WhatsApp phone number.
 * Returns: customer info + their active sales + portal URL.
 *
 * Body: { phone: string }
 */
export async function POST(request: NextRequest) {
    // Verify N8N secret
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const rawPhone = body.phone as string | undefined;

        if (!rawPhone) {
            return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
        }

        const phone = normalizePhone(rawPhone);

        // Find customer by phone — try both normalized and common variants
        const { data: customer } = await supabase
            .from('customers' as any)
            .select('id, full_name, phone, customer_type, whatsapp_instance, portal_password')
            .or(`phone.eq.${phone},phone.eq.0${phone.slice(3)}`)
            .limit(1)
            .single();

        if (!customer) {
            return NextResponse.json({
                found: false,
                message: 'No se encontró ningún cliente con ese número',
            });
        }

        const c = customer as any;

        // Get active sales for this customer
        const { data: sales } = await supabase
            .from('sales' as any)
            .select(`
                id, amount_gs, start_date, end_date, is_active,
                sale_slots:slot_id (
                    slot_identifier,
                    mother_accounts:mother_account_id (
                        platform, email
                    )
                )
            `)
            .eq('customer_id', c.id)
            .eq('is_active', true)
            .order('end_date', { ascending: true });

        // Build portal URL for this customer
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';
        const portalUrl = `${baseUrl}/portal`;

        // Compute days remaining for each sale
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeSales = (sales || []).map((s: any) => {
            const endDate = s.end_date ? new Date(s.end_date + 'T00:00:00') : null;
            const daysRemaining = endDate
                ? Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
                : null;
            const platform = s.sale_slots?.mother_accounts?.platform || 'Servicio';

            return {
                id: s.id,
                platform,
                profile: s.sale_slots?.slot_identifier || null,
                amount_gs: s.amount_gs,
                end_date: s.end_date,
                days_remaining: daysRemaining,
                is_expiring_soon: daysRemaining !== null && daysRemaining <= 5,
                is_overdue: daysRemaining !== null && daysRemaining < 0,
            };
        });

        return NextResponse.json({
            found: true,
            customer: {
                id: c.id,
                name: c.full_name || 'Cliente',
                phone: c.phone,
                type: c.customer_type,
                whatsapp_instance: c.whatsapp_instance,
                portal_url: portalUrl,
                // Do NOT expose portal_password here for security
            },
            active_sales: activeSales,
            has_expiring_soon: activeSales.some((s: any) => s.is_expiring_soon),
            has_overdue: activeSales.some((s: any) => s.is_overdue),
        });

    } catch (error: any) {
        console.error('[N8N Customer Lookup] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
