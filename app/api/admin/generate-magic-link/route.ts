import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/generate-magic-link
 * Admin-only endpoint to generate a magic link for a customer's portal.
 *
 * Uses Supabase admin.generateLink({ type: 'magiclink' }) to produce
 * a token_hash, then stores a short token → token_hash mapping in
 * the `magic_links` table so we can serve shortened URLs.
 *
 * Returns: { shortUrl, expiresAt, token }
 */
export async function POST(req: NextRequest) {
    // ── Auth check ──
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

    // ── Get customer ──
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

    if (!customer.portal_user_id) {
        return NextResponse.json(
            { error: 'El cliente no tiene cuenta de portal. Generá una contraseña primero.' },
            { status: 400 }
        );
    }

    // ── Build email from phone ──
    const phoneClean = customer.phone.replace(/^\+/, '');
    const email = `${phoneClean}@clickpar.shop`;

    try {
        // ── Generate magic link via Supabase Admin ──
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: {
                redirectTo: 'https://clickpar.net/cliente',
            },
        });

        if (linkError || !linkData) {
            console.error('[generate-magic-link] Supabase generateLink error:', linkError?.message);
            return NextResponse.json(
                { error: `Error al generar magic link: ${linkError?.message || 'Sin datos'}` },
                { status: 500 }
            );
        }

        // linkData.properties contains hashed_token
        const tokenHash = linkData.properties?.hashed_token;
        if (!tokenHash) {
            console.error('[generate-magic-link] No hashed_token in response:', JSON.stringify(linkData));
            return NextResponse.json({ error: 'No se obtuvo token_hash' }, { status: 500 });
        }

        // ── Generate short token ──
        const shortToken = randomBytes(9).toString('base64url'); // 12 chars, URL-safe

        // ── Expiration: 30 minutes from now ──
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        // ── Invalidate any previous unused magic links for this customer ──
        await (admin.from('magic_links') as any)
            .update({ used_at: new Date().toISOString() })
            .eq('customer_id', customerId)
            .is('used_at', null);

        // ── Store in magic_links table ──
        const { error: insertError } = await (admin.from('magic_links') as any).insert({
            token: shortToken,
            token_hash: tokenHash,
            customer_id: customerId,
            created_by: user.id,
            expires_at: expiresAt,
        });

        if (insertError) {
            console.error('[generate-magic-link] Insert error:', insertError.message);
            return NextResponse.json({ error: 'Error al guardar magic link' }, { status: 500 });
        }

        const shortUrl = `https://clickpar.net/m/${shortToken}`;

        // ── Log this action ──
        await (admin.from('portal_access_log') as any).insert({
            user_id: user.id,
            event_type: 'admin_generate_magic_link',
            metadata: { customer_id: customerId, customer_name: customer.full_name, short_token: shortToken },
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            user_agent: req.headers.get('user-agent') || 'unknown',
        }).then(() => {}).catch(() => {}); // non-blocking

        return NextResponse.json({
            success: true,
            shortUrl,
            expiresAt,
            token: shortToken,
        });
    } catch (err: any) {
        console.error('[generate-magic-link] Error:', err.message);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
