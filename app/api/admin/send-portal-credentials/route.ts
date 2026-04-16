import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/send-portal-credentials
 * Admin-only endpoint to send portal credentials to a customer via WhatsApp.
 */
export async function POST(req: NextRequest) {
    // Auth check — must be super_admin or staff
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (!['super_admin', 'staff'].includes(profile?.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { customerId, phone, message } = await req.json();
    if (!phone || !message) {
        return NextResponse.json({ error: 'Faltan datos (phone, message)' }, { status: 400 });
    }

    try {
        const result = await sendText(phone, message, {
            customerId,
            templateKey: 'portal_credentials',
            triggeredBy: 'manual',
            skipRateLimiting: true,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'No se pudo enviar' }, { status: 500 });
        }

        return NextResponse.json({ success: true, instanceUsed: result.instanceUsed });
    } catch (err: any) {
        console.error('[send-portal-credentials] Error:', err.message);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
