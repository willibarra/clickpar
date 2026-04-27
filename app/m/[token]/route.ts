import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * Resolves the public base URL from request headers.
 * Behind a reverse proxy (Traefik/Dokploy), _req.url is the internal
 * container address (e.g. http://0.0.0.0:3000). We need the real public URL.
 */
function getPublicBaseUrl(req: NextRequest): string {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'clickpar.net';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
}

/**
 * GET /m/{token}
 * Public redirect handler for shortened magic links.
 *
 * Looks up the short token in `magic_links`, validates it hasn't expired
 * or been used, marks it as used, then redirects the customer to
 * /cliente/login?magic={token_hash}&type=email for auto-authentication.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const baseUrl = getPublicBaseUrl(_req);

    if (!token) {
        return NextResponse.redirect(new URL('/cliente/login', baseUrl));
    }

    const admin = await createAdminClient();

    // ── Lookup the token ──
    const { data: link, error } = await (admin.from('magic_links') as any)
        .select('id, token_hash, expires_at, used_at')
        .eq('token', token)
        .maybeSingle();

    if (error || !link) {
        // Invalid or not found — redirect to login with error
        const loginUrl = new URL('/cliente/login', baseUrl);
        loginUrl.searchParams.set('magic_error', 'invalid');
        return NextResponse.redirect(loginUrl);
    }

    // ── Check if already used ──
    if (link.used_at) {
        const loginUrl = new URL('/cliente/login', baseUrl);
        loginUrl.searchParams.set('magic_error', 'used');
        return NextResponse.redirect(loginUrl);
    }

    // ── Check expiration ──
    if (new Date(link.expires_at) < new Date()) {
        const loginUrl = new URL('/cliente/login', baseUrl);
        loginUrl.searchParams.set('magic_error', 'expired');
        return NextResponse.redirect(loginUrl);
    }

    // ── Mark as used ──
    await (admin.from('magic_links') as any)
        .update({ used_at: new Date().toISOString() })
        .eq('id', link.id);

    // ── Redirect to login with token_hash for auto-verification ──
    const loginUrl = new URL('/cliente/login', baseUrl);
    loginUrl.searchParams.set('magic', link.token_hash);
    loginUrl.searchParams.set('type', 'email');
    return NextResponse.redirect(loginUrl);
}
