import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/wallet
 * Returns the wallet balance and last 50 wallet_transactions for the authenticated customer.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Resolve customer via portal_user_id or phone
    let customer: any = null;

    const { data: byPortalId } = await (admin.from('customers') as any)
        .select('id, full_name, wallet_balance')
        .eq('portal_user_id', user.id)
        .maybeSingle();

    if (byPortalId) {
        customer = byPortalId;
    } else {
        // Fallback: find by phone extracted from email
        let resolvedPhone: string | null = null;
        const { data: profile } = await (admin.from('profiles') as any)
            .select('phone_number')
            .eq('id', user.id)
            .single();
        resolvedPhone = profile?.phone_number || null;
        if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
            const extracted = user.email.replace('@clickpar.shop', '');
            if (extracted) resolvedPhone = `+${extracted}`;
        }
        if (resolvedPhone) {
            const phonesToTry = [
                normalizePhone(resolvedPhone),
                resolvedPhone,
                resolvedPhone.replace(/^\+/, ''),
            ];
            for (const phone of phonesToTry) {
                const { data } = await (admin.from('customers') as any)
                    .select('id, full_name, wallet_balance')
                    .eq('phone', phone)
                    .maybeSingle();
                if (data) { customer = data; break; }
            }
        }
    }

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Fetch wallet movement history
    const { data: movements, error } = await (admin.from('wallet_transactions') as any)
        .select('id, amount, type, concept, reference_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('[Wallet API] Error fetching movements:', error);
        return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        balance: Number(customer.wallet_balance ?? 0),
        movements: movements || [],
    });
}
