import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
    const { request_id, status, admin_notes } = body;

    if (!request_id || !status || !['approved', 'rejected'].includes(status)) {
        return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const { data, error } = await (supabase.from('reseller_stock_requests') as any)
        .update({
            status,
            admin_notes: admin_notes || null,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', request_id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}
