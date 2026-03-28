import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'reseller' && profile.role !== 'super_admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let query = (supabase.from('reseller_commissions') as any)
        .select('id, commission_percent, base_amount_gs, commission_gs, status, paid_at, created_at, reseller_sale_id')
        .order('created_at', { ascending: false });

    if (profile.role === 'reseller') {
        query = query.eq('reseller_id', user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}
