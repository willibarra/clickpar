import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Solo super_admin puede asignar stock' }, { status: 403 });
    }

    const body = await request.json();
    const { reseller_id, slot_ids, sale_price_gs } = body;

    if (!reseller_id || !slot_ids || !Array.isArray(slot_ids) || slot_ids.length === 0) {
        return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    // Fetch slot details to get platform and slot_identifier
    const { data: slots } = await (supabase.from('sale_slots') as any)
        .select('id, slot_identifier, mother_accounts!inner(platform)')
        .in('id', slot_ids)
        .eq('status', 'available');

    if (!slots || slots.length === 0) {
        return NextResponse.json({ error: 'No se encontraron slots disponibles' }, { status: 404 });
    }

    // Build rows to insert
    const rows = slots.map((slot: any) => ({
        reseller_id,
        slot_id: slot.id,
        platform: slot.mother_accounts?.platform || 'Desconocido',
        slot_identifier: slot.slot_identifier,
        sale_price_gs: sale_price_gs || null,
        assigned_by: user.id,
        status: 'available',
    }));

    const { data, error } = await (supabase.from('reseller_stock') as any)
        .insert(rows)
        .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ assigned: data?.length || 0 }, { status: 201 });
}
