import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/utils/encryption';

/**
 * POST /api/admin/regenerate-password
 * Admin-only endpoint to regenerate a customer's portal password.
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

    // Get customer data
    const { data: customer } = await (admin.from('customers') as any)
        .select('id, phone, full_name')
        .eq('id', customerId)
        .single();

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    if (!customer.phone) {
        return NextResponse.json({ error: 'El cliente no tiene teléfono registrado' }, { status: 400 });
    }

    // Generate new password
    const p1 = Math.random().toString(36).slice(2, 6);
    const p2 = Math.random().toString(36).slice(2, 6);
    const password = `CP-${p1}-${p2}`;

    const phoneClean = customer.phone.replace(/^\+/, '');
    const email = `${phoneClean}@clickpar.shop`;

    try {
        // Search directly by email filter (avoids listUsers pagination that misses users > page 1)
        const { data: searchData } = await admin.auth.admin.listUsers({ filter: `email=${email}` } as any);
        let authUser = searchData?.users?.find((u: any) => u.email === email) ?? null;

        // Fallback: paginated search if filter is not supported by the self-hosted version
        if (!authUser) {
            let page = 1;
            const perPage = 1000;
            while (true) {
                const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage });
                const found = pageData?.users?.find((u: any) => u.email === email);
                if (found) { authUser = found; break; }
                if (!pageData?.users || pageData.users.length < perPage) break;
                page++;
            }
        }

        if (authUser) {
            // Update existing user's password
            const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
                password,
            });
            if (updateErr) {
                return NextResponse.json({ error: `Error al actualizar: ${updateErr.message}` }, { status: 500 });
            }
        } else {
            // Create new auth user (first time setup)
            const phoneWithPlus = customer.phone.startsWith('+') ? customer.phone : `+${customer.phone}`;
            const { error: createErr } = await admin.auth.admin.createUser({
                email,
                phone: phoneWithPlus,
                password,
                email_confirm: true,
                phone_confirm: true,
                user_metadata: { full_name: customer.full_name, customer_id: customerId },
                app_metadata: { user_role: 'customer' },
            });
            if (createErr) {
                return NextResponse.json({ error: `Error al crear usuario: ${createErr.message}` }, { status: 500 });
            }
        }

        // Store encrypted password in customers table
        await (admin.from('customers') as any)
            .update({ portal_password: encrypt(password) })
            .eq('id', customerId);

        // Log this action
        await (admin.from('portal_access_log') as any).insert({
            user_id: user.id,
            event_type: 'admin_regenerate_password',
            metadata: { customer_id: customerId, customer_name: customer.full_name },
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            user_agent: req.headers.get('user-agent') || 'unknown',
        }).then(() => {}).catch(() => {}); // non-blocking

        return NextResponse.json({ success: true, password });
    } catch (err: any) {
        console.error('[regenerate-password] Error:', err.message);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
