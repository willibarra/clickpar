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

    const resellerId = profile.role === 'super_admin'
        ? undefined // admin can see all
        : user.id;

    let query = (supabase.from('reseller_sales') as any)
        .select('*')
        .order('fecha_venta', { ascending: false });

    if (resellerId) query = query.eq('reseller_id', resellerId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}

export async function POST(request: Request) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    // Verify role
    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'reseller' && profile.role !== 'super_admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { reseller_stock_id, cliente_nombre, cliente_telefono, precio_venta_gs, end_date, notes } = body;

    if (!reseller_stock_id || !cliente_nombre || !precio_venta_gs) {
        return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // Verify stock belongs to this reseller and is available
    const { data: stockItem } = await (supabase.from('reseller_stock') as any)
        .select('id, platform, slot_identifier, status, reseller_id')
        .eq('id', reseller_stock_id)
        .single();

    if (!stockItem) return NextResponse.json({ error: 'Stock no encontrado' }, { status: 404 });
    if (profile.role === 'reseller' && stockItem.reseller_id !== user.id) {
        return NextResponse.json({ error: 'Este perfil no es tuyo' }, { status: 403 });
    }
    if (stockItem.status !== 'available') {
        return NextResponse.json({ error: 'Este perfil ya fue vendido' }, { status: 409 });
    }

    // Insert the sale (triggers will auto-create commission and mark stock as sold)
    const { data: sale, error: insertError } = await (supabase.from('reseller_sales') as any)
        .insert({
            reseller_id: profile.role === 'reseller' ? user.id : stockItem.reseller_id,
            reseller_stock_id,
            cliente_nombre,
            cliente_telefono,
            plataforma: stockItem.platform,
            slot_identifier: stockItem.slot_identifier,
            precio_venta_gs,
            end_date: end_date || null,
            notes: notes || null,
        })
        .select()
        .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json(sale, { status: 201 });
}
