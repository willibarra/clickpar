import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'reseller' && profile.role !== 'super_admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { platform, quantity_requested, notes } = body;

    if (!platform || !quantity_requested || quantity_requested < 1) {
        return NextResponse.json({ error: 'Plataforma y cantidad son requeridos' }, { status: 400 });
    }

    const { data, error } = await (supabase.from('reseller_stock_requests') as any)
        .insert({
            reseller_id: user.id,
            platform,
            quantity_requested,
            notes: notes || null,
            status: 'pending',
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
}
