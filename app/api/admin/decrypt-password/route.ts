import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { decrypt, isEncrypted } from '@/lib/utils/encryption';

/**
 * POST /api/admin/decrypt-password
 * Admin-only endpoint to decrypt a customer's portal password.
 */
export async function POST(req: NextRequest) {
    // Auth check — must be super_admin
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

    if (profile?.role !== 'super_admin') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { customerId } = await req.json();
    if (!customerId) {
        return NextResponse.json({ error: 'Falta customerId' }, { status: 400 });
    }

    const { data: customer } = await (admin.from('customers') as any)
        .select('portal_password, full_name')
        .eq('id', customerId)
        .single();

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    if (!customer.portal_password) {
        return NextResponse.json({ error: 'Sin contraseña del portal' }, { status: 404 });
    }

    try {
        // If the password is encrypted, decrypt it; otherwise return as-is (legacy)
        const password = isEncrypted(customer.portal_password)
            ? decrypt(customer.portal_password)
            : customer.portal_password;

        // Log this access
        await (admin.from('portal_access_log') as any).insert({
            user_id: user.id,
            event_type: 'admin_view_password',
            metadata: { customer_id: customerId, customer_name: customer.full_name },
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            user_agent: req.headers.get('user-agent') || 'unknown',
        }).then(() => {}).catch(() => {}); // non-blocking

        return NextResponse.json({ success: true, password });
    } catch (err: any) {
        console.error('[decrypt-password] Error:', err.message);
        return NextResponse.json({ error: 'Error al desencriptar' }, { status: 500 });
    }
}
