import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';



const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * GET /api/n8n/payment-methods
 * 
 * Returns all active payment methods for N8N to use in the
 * renewal conversation flow. N8N sends these options to the
 * customer when they want to renew.
 * 
 * Also supports:
 * GET /api/n8n/payment-methods?key=tigo_money
 * → Returns instructions for a specific payment method
 */
export async function GET(request: NextRequest) {
    // Verify N8N secret
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAdminClient();

    try {
        const key = request.nextUrl.searchParams.get('key');

        if (key) {
            // Get specific payment method
            const { data, error } = await supabase
                .from('payment_methods' as any)
                .select('key, name, emoji, instructions')
                .eq('key', key)
                .eq('is_active', true)
                .single();

            if (error || !data) {
                return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
            }

            return NextResponse.json(data);
        }

        // Get all active payment methods
        const { data, error } = await supabase
            .from('payment_methods' as any)
            .select('key, name, emoji, instructions')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ methods: data || [] });

    } catch (error: any) {
        console.error('[N8N Payment Methods] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
