import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendTicketResolved } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// GET /api/tickets/[id] — detalle de ticket
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const admin = await createAdminClient();

        const { data: profile } = await (admin.from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single();
        const isStaff = profile?.role === 'super_admin' || profile?.role === 'staff';

        const { data: ticket, error } = await (admin.from('support_tickets') as any)
            .select(`
                *,
                customer:profiles!support_tickets_customer_id_fkey(id, full_name, phone_number, role),
                subscription:subscriptions(
                    id, end_date, start_date, sale_price_gs,
                    slot:sale_slots(slot_identifier, pin_code, mother:mother_accounts(platform, email))
                ),
                staff:profiles!support_tickets_staff_asignado_id_fkey(id, full_name)
            `)
            .eq('id', id)
            .single();

        if (error || !ticket) {
            return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });
        }

        // Clients can only see their own tickets
        if (!isStaff && ticket.customer_id !== user.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        return NextResponse.json({ ticket });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PATCH /api/tickets/[id] — actualiza ticket (solo staff)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const admin = await createAdminClient();

        const { data: profile } = await (admin.from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single();
        const isStaff = profile?.role === 'super_admin' || profile?.role === 'staff';
        if (!isStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

        const body = await request.json();
        const { estado, resolucion, staff_asignado_id } = body;

        const updateData: Record<string, any> = {};
        if (estado) updateData.estado = estado;
        if (resolucion !== undefined) updateData.resolucion = resolucion;
        if (staff_asignado_id !== undefined) updateData.staff_asignado_id = staff_asignado_id;

        // Set resolved_at if resolving
        if (estado === 'resuelto' && !updateData.resolved_at) {
            updateData.resolved_at = new Date().toISOString();
        }

        const { data: ticket, error } = await (admin.from('support_tickets') as any)
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                customer:profiles!support_tickets_customer_id_fkey(id, full_name, phone_number)
            `)
            .single();

        if (error) throw error;

        // If resolved, send WhatsApp notification to customer
        if (estado === 'resuelto' && ticket?.customer?.phone_number) {
            sendTicketResolved({
                customerPhone: ticket.customer.phone_number,
                customerName: ticket.customer.full_name || 'Cliente',
                ticketId: ticket.id.slice(0, 8).toUpperCase(),
                resolucion: resolucion || 'Tu problema fue atendido.',
            }).catch(console.error);
        }

        return NextResponse.json({ success: true, ticket });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
