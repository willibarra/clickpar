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

    // IMPORTANT: Never return slot email/password. Only return safe fields.
    let query = (supabase.from('reseller_stock') as any)
        .select('id, platform, slot_identifier, status, sale_price_gs, assigned_at')
        .order('platform')
        .order('status');

    if (profile.role === 'reseller') {
        query = query.eq('reseller_id', user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}
