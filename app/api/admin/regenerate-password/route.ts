import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/utils/encryption';
export const dynamic = 'force-dynamic';


/**
 * POST /api/admin/regenerate-password
 * Admin-only endpoint to regenerate a customer's portal password.
 * 
 * Lazy Provisioning: if the customer doesn't have a portal_user_id,
 * we create an auth account. If one already exists by email (legacy),
 * we find it, link it, and update the password.
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

    const { customerId } = await req.json();
    if (!customerId) {
        return NextResponse.json({ error: 'Falta customerId' }, { status: 400 });
    }

    // Get customer data
    const { data: customer } = await (admin.from('customers') as any)
        .select('id, phone, full_name, portal_user_id')
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
        let authUserId = customer.portal_user_id;
        let action: 'updated' | 'created' | 'linked' = 'updated';

        if (authUserId) {
            // ── PATH A: portal_user_id exists → just update password ──
            const { error: updateErr } = await admin.auth.admin.updateUserById(authUserId, {
                password,
            });
            if (updateErr) {
                return NextResponse.json({ error: `Error al actualizar: ${updateErr.message}` }, { status: 500 });
            }
            action = 'updated';
        } else {
            // ── PATH B: No portal_user_id → try to create new auth user ──
            const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name: customer.full_name, customer_id: customerId },
                app_metadata: { user_role: 'customer' },
            });

            if (!createErr && newUser?.user?.id) {
                // Successfully created
                authUserId = newUser.user.id;
                action = 'created';
            } else if (createErr?.message?.includes('already been registered')) {
                // ── PATH C: Email already exists in auth → find and link ──
                // Query auth.users directly (reliable regardless of total user count)
                const { data: existingAuthRows, error: queryErr } = await admin
                    .from('auth_users_view' as any)
                    .select('id')
                    .eq('email', email)
                    .limit(1)
                    .maybeSingle()
                    .then(async (res: any) => {
                        // Fallback: if view doesn't exist, paginate through listUsers
                        if (res.error) {
                            let foundUser: any = null;
                            let page = 1;
                            while (!foundUser) {
                                const { data: batch } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
                                if (!batch?.users?.length) break;
                                foundUser = batch.users.find((u: any) => u.email === email) || null;
                                if (foundUser || batch.users.length < 1000) break;
                                page++;
                            }
                            return { data: foundUser ? { id: foundUser.id } : null, error: null };
                        }
                        return res;
                    });

                const existingId = existingAuthRows?.id ?? null;

                if (existingId) {
                    authUserId = existingId;
                    // Update their password
                    const { error: updateErr2 } = await admin.auth.admin.updateUserById(authUserId, {
                        password,
                    });
                    if (updateErr2) {
                        return NextResponse.json({ error: `Error al actualizar usuario existente: ${updateErr2.message}` }, { status: 500 });
                    }
                    action = 'linked';
                } else {
                    // Should never happen — createUser said email exists but we can't find it
                    console.error('[regenerate-password] PATH C: email exists in auth but lookup returned nothing', { email });
                    return NextResponse.json({ 
                        error: 'Ya existe una cuenta con este email pero no se pudo localizar. Contactá soporte.' 
                    }, { status: 500 });
                }
            } else {
                // Some other creation error
                return NextResponse.json({ error: `Error al crear usuario: ${createErr?.message}` }, { status: 500 });
            }
        }

        // Store encrypted password and link portal_user_id in customers table
        await (admin.from('customers') as any)
            .update({ portal_password: encrypt(password), portal_user_id: authUserId })
            .eq('id', customerId);

        // Log this action
        await (admin.from('portal_access_log') as any).insert({
            user_id: user.id,
            event_type: action === 'created' ? 'admin_create_portal_access' : 'admin_regenerate_password',
            metadata: { customer_id: customerId, customer_name: customer.full_name, action },
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            user_agent: req.headers.get('user-agent') || 'unknown',
        }).then(() => {}).catch(() => {}); // non-blocking

        return NextResponse.json({ success: true, password, action });
    } catch (err: any) {
        console.error('[regenerate-password] Error:', err.message);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
