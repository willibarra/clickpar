import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';



const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/n8n/renewal-data
 * 
 * Called by N8N to get enriched customer + sale data for building 
 * AI-generated renewal messages.
 * 
 * Body: { customer_id: string, sale_id: string }
 * Returns: { customer, sale, platform, paymentMethods, history }
 */
export async function POST(request: NextRequest) {
    // Verify N8N secret
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { customer_id, sale_id } = body;

        if (!customer_id || !sale_id) {
            return NextResponse.json({ error: 'Missing customer_id or sale_id' }, { status: 400 });
        }

        // Get customer info
        const { data: customer } = await supabase
            .from('customers' as any)
            .select('id, full_name, phone, customer_type, whatsapp_instance')
            .eq('id', customer_id)
            .single();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // Get sale + platform info
        const { data: sale } = await supabase
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
            .eq('id', sale_id)
            .single();

        // Get platform display name (nickname)
        const platformName = (sale as any)?.sale_slots?.mother_accounts?.platform || 'Servicio';
        const { data: platformData } = await supabase
            .from('platforms' as any)
            .select('nicknames')
            .eq('name', platformName)
            .eq('is_active', true)
            .single();

        const displayName = (platformData as any)?.nicknames?.[0] || platformName;

        // Get customer payment history (last 5 sales)
        const { data: history } = await supabase
            .from('sales' as any)
            .select('id, amount_gs, payment_method, created_at')
            .eq('customer_id', customer_id)
            .order('created_at', { ascending: false })
            .limit(5);

        // Get active payment methods
        const { data: paymentMethods } = await supabase
            .from('payment_methods' as any)
            .select('key, name, emoji, instructions')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';

        return NextResponse.json({
            customer: {
                id: (customer as any).id,
                name: (customer as any).full_name || 'Cliente',
                phone: (customer as any).phone,
                type: (customer as any).customer_type,
                whatsapp_instance: (customer as any).whatsapp_instance,
                portal_url: `${baseUrl}/portal`,
            },
            sale: {
                id: (sale as any)?.id,
                amount_gs: (sale as any)?.amount_gs || 0,
                start_date: (sale as any)?.start_date,
                end_date: (sale as any)?.end_date,
                platform: platformName,
                platform_display: displayName,
                profile: (sale as any)?.sale_slots?.slot_identifier || null,
            },
            history: (history || []).map((h: any) => ({
                amount: h.amount_gs,
                method: h.payment_method,
                date: h.created_at,
            })),
            paymentMethods: paymentMethods || [],
        });

    } catch (error: any) {
        console.error('[N8N Renewal Data] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
