import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Verify admin role
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin' && profile?.role !== 'staff') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { data: pending, error } = await (admin.from('pending_activations') as any)
        .select(`
            *,
            customers:customer_id (full_name, phone)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Activaciones API] Error:', error);
        return NextResponse.json({ error: 'Error al obtener activaciones' }, { status: 500 });
    }

    return NextResponse.json({ success: true, pending });
}

export async function POST(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { activation_id, sale_id } = body;
    if (!activation_id || !sale_id) {
        return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Verify admin role
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin' && profile?.role !== 'staff') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Update activation status
    const { error: error1 } = await (admin.from('pending_activations') as any)
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', activation_id);

    if (error1) {
        return NextResponse.json({ error: 'Error al actualizar activación' }, { status: 500 });
    }

    // Mark sale as active
    const { error: error2 } = await (admin.from('sales') as any)
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', sale_id);

    if (error2) {
        return NextResponse.json({ error: 'Error al activar venta' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Activación completada' });
}
