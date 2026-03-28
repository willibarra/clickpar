import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendStaffTicketAlert } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// GET /api/tickets — lista tickets
// Staff: todos los tickets. Cliente: solo los suyos.
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const admin = await createAdminClient();

        // Get user role
        const { data: profile } = await (admin.from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single();

        const isStaff = profile?.role === 'super_admin' || profile?.role === 'staff';

        const searchParams = request.nextUrl.searchParams;
        const estado = searchParams.get('estado');
        const limit = parseInt(searchParams.get('limit') || '50');

        let query = (admin.from('support_tickets') as any)
            .select(`
                *,
                customer:profiles!support_tickets_customer_id_fkey(id, full_name, phone_number),
                subscription:subscriptions(id, end_date, slot:sale_slots(slot_identifier, mother:mother_accounts(platform))),
                staff:profiles!support_tickets_staff_asignado_id_fkey(id, full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (!isStaff) {
            // Clients only see their own
            query = query.eq('customer_id', user.id);
        }

        if (estado) {
            query = query.eq('estado', estado);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ tickets: data || [] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST /api/tickets — crea un ticket
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const body = await request.json();
        const { tipo, descripcion, subscription_id, canal_origen = 'panel' } = body;

        if (!tipo) {
            return NextResponse.json({ error: 'El campo tipo es requerido' }, { status: 400 });
        }

        const admin = await createAdminClient();

        // Get subscription's mother_account_id if subscription_id provided
        let mother_account_id: string | null = null;
        if (subscription_id) {
            const { data: sub } = await (admin.from('subscriptions') as any)
                .select('slot:sale_slots(mother_account_id)')
                .eq('id', subscription_id)
                .single();
            mother_account_id = sub?.slot?.mother_account_id || null;
        }

        const { data: ticket, error } = await (admin.from('support_tickets') as any)
            .insert({
                customer_id: user.id,
                subscription_id: subscription_id || null,
                mother_account_id,
                tipo,
                descripcion: descripcion || null,
                estado: 'abierto',
                canal_origen,
            })
            .select()
            .single();

        if (error) throw error;

        // Get customer info for staff notification
        const { data: customerProfile } = await (admin.from('profiles') as any)
            .select('full_name, phone_number')
            .eq('id', user.id)
            .single();

        // Get subscription/platform info
        let platformInfo = '';
        if (subscription_id) {
            const { data: sub } = await (admin.from('subscriptions') as any)
                .select('slot:sale_slots(slot_identifier, mother:mother_accounts(platform))')
                .eq('id', subscription_id)
                .single();
            const platform = sub?.slot?.mother?.platform || '';
            const profile = sub?.slot?.slot_identifier || '';
            if (platform) platformInfo = `${platform}${profile ? ` - ${profile}` : ''}`;
        }

        // Notify staff asynchronously (don't block the response)
        sendStaffTicketAlert({
            ticketId: ticket.id.slice(0, 8).toUpperCase(),
            customerName: customerProfile?.full_name || 'Cliente',
            customerPhone: customerProfile?.phone_number || '',
            platform: platformInfo,
            tipo,
            descripcion: descripcion || '',
            canal: canal_origen,
        }).catch(console.error);

        return NextResponse.json({ success: true, ticket });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
