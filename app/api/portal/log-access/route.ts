import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


/**
 * POST /api/portal/log-access
 * Logs portal access events (login, credential views, etc.)
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { eventType, metadata = {} } = await req.json();

    if (!eventType) {
        return NextResponse.json({ error: 'Falta eventType' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Try to find customer_id from profile phone
    let customerId = null;
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    if (profile?.phone_number) {
        const { data: customer } = await (admin.from('customers') as any)
            .select('id')
            .eq('phone', normalizePhone(profile.phone_number))
            .single();
        customerId = customer?.id || null;
    }

    // Insert log entry
    await (admin.from('portal_access_log') as any).insert({
        customer_id: customerId,
        user_id: user.id,
        event_type: eventType,
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
        metadata,
    });

    return NextResponse.json({ success: true });
}
