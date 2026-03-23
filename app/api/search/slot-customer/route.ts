import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
    const slotId = request.nextUrl.searchParams.get('slotId');
    if (!slotId) return NextResponse.json({ customer: null });

    const supabase = await createAdminClient();

    // Buscar la venta activa del slot con el cliente
    const { data: sale } = await (supabase.from('sales') as any)
        .select('id, end_date, customers(id, full_name, phone)')
        .eq('slot_id', slotId)
        .eq('is_active', true)
        .maybeSingle();

    if (!sale?.customers) return NextResponse.json({ customer: null });

    return NextResponse.json({
        sale_id: sale.id,  // needed by SlotDetailsModal extend mode
        customer: {
            id: sale.customers.id,
            full_name: sale.customers.full_name,
            phone: sale.customers.phone,
            end_date: sale.end_date,
        }
    });
}
