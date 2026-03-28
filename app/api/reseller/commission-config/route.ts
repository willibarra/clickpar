import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST: upsert commission config for a reseller
export async function POST(request: Request) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { reseller_id, commission_percent } = body;

    if (!reseller_id || commission_percent == null) {
        return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Upsert
    const { data, error } = await (supabase.from('reseller_config') as any)
        .upsert({ reseller_id, commission_percent }, { onConflict: 'reseller_id' })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}
