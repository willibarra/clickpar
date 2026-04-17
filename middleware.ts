import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const hostname = request.headers.get('host') ?? '';
    const isClickparNet = hostname.startsWith('clickpar.net');
    const isClickparShop = hostname.startsWith('clickpar.shop');

    // ─────────────────────────────────────────────────────────────────
    // DOMAIN: clickpar.net → solo portal de clientes
    // ─────────────────────────────────────────────────────────────────
    if (isClickparNet) {
        // API routes always pass through
        if (pathname.startsWith('/api/')) {
            return NextResponse.next({ request });
        }

        // Creator slug links: single-segment paths like /willibarra
        // These are handled by app/[slug]/page.tsx which logs the click and redirects to WhatsApp
        const isCreatorSlug = /^\/[a-z0-9_-]+$/i.test(pathname);
        if (isCreatorSlug) {
            return NextResponse.next({ request });
        }

        // Any non-cliente route → redirect to customer portal
        if (!pathname.startsWith('/cliente')) {
            return NextResponse.redirect(new URL('/cliente', request.url));
        }

        // All /cliente/* routes share a single auth check (the login page included)
        const supabaseNet = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return request.cookies.getAll(); },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    },
                },
            }
        );
        const { data: { user: netUser } } = await supabaseNet.auth.getUser();

        // [Capa 1] Authenticated user hitting the login page → send them home
        if (pathname === '/cliente/login') {
            if (netUser) {
                return NextResponse.redirect(new URL('/cliente', request.url));
            }
            return NextResponse.next({ request });
        }

        if (!netUser) {
            return NextResponse.redirect(new URL('/cliente/login', request.url));
        }
        return NextResponse.next({ request });
    }

    // ─────────────────────────────────────────────────────────────────
    // DOMAIN: clickpar.shop → solo panel admin (/staff)
    // ─────────────────────────────────────────────────────────────────
    if (isClickparShop) {
        // API routes always pass through
        if (pathname.startsWith('/api/')) {
            return NextResponse.next({ request });
        }

        // Staff login — allow without auth
        if (pathname === '/staff/login') {
            return NextResponse.next({ request });
        }

        // Customer portal routes → redirect to clickpar.net/cliente/login
        if (pathname.startsWith('/cliente')) {
            return NextResponse.redirect('https://clickpar.net/cliente/login');
        }

        // Root (/) → fall through to admin auth check below (do NOT redirect away)
        // /staff/* and admin routes — fall through to normal auth below
    }

    // ─────────────────────────────────────────────────────────────────
    // LEGACY / COMMON ROUTES (clickpar.shop admin & local dev)
    // ─────────────────────────────────────────────────────────────────

    // Redirect legacy/removed routes
    if (pathname === '/register' || pathname === '/portal/login') {
        return NextResponse.redirect(new URL('/cliente/login', request.url));
    }
    if (pathname === '/login') {
        return NextResponse.redirect(new URL('/staff/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
        return NextResponse.redirect(new URL(pathname.replace('/portal', '/cliente'), request.url));
    }

    // Skip auth for staff login and generic API routes
    if (pathname === '/staff/login' || pathname.startsWith('/api/')) {
        return NextResponse.next({ request });
    }

    // [Capa 1] /cliente/login (local dev / clickpar.shop fallback):
    // Redirect authenticated users straight to the portal.
    if (pathname === '/cliente/login') {
        const supabaseLoginCheck = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} } }
        );
        const { data: { user: loginUser } } = await supabaseLoginCheck.auth.getUser();
        if (loginUser) {
            return NextResponse.redirect(new URL('/cliente', request.url));
        }
        return NextResponse.next({ request });
    }

    // Creator slug links: single-segment paths like /willibarra
    // These are handled by app/[slug]/page.tsx — no auth required
    if (/^\/[a-z0-9_-]+$/i.test(pathname)) {
        return NextResponse.next({ request });
    }

    // [Capa 5] Inject x-pathname into request headers so async Server Components
    // (e.g. app/cliente/layout.tsx) can read the current pathname via next/headers.
    const requestWithPathname = new Headers(request.headers);
    requestWithPathname.set('x-pathname', pathname);

    let supabaseResponse = NextResponse.next({
        request: { headers: requestWithPathname },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    // Preserve x-pathname when Supabase refreshes the session token
                    supabaseResponse = NextResponse.next({ request: { headers: requestWithPathname } });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    // Read role from JWT app_metadata (injected by custom_access_token_hook)
    let role = user?.app_metadata?.user_role as string | undefined;

    // Fallback: if role is not in JWT, query profiles via REST API with service_role_key (bypasses RLS)
    if (user && !role) {
        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
            const res = await fetch(
                `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`,
                {
                    headers: {
                        'apikey': serviceKey,
                        'Authorization': `Bearer ${serviceKey}`,
                    },
                }
            );
            if (res.ok) {
                const rows = await res.json();
                if (rows?.[0]?.role) {
                    role = rows[0].role;
                }
            }
        } catch {
            // If query fails, role stays undefined
        }
    }

    // Root domain: if not logged in → staff login, if logged in → depends on role
    if (pathname === '/') {
        if (!user) {
            return NextResponse.redirect(new URL('/staff/login', request.url));
        }
        if (role === 'super_admin' || role === 'staff') {
            return supabaseResponse;
        }
        if (role === 'customer') {
            return NextResponse.redirect(new URL('/cliente', request.url));
        }
        if (role === 'reseller') {
            return NextResponse.redirect(new URL('/reseller', request.url));
        }
        return NextResponse.redirect(new URL('/staff/login', request.url));
    }

    // Cliente portal routes — require auth as customer
    if (pathname.startsWith('/cliente')) {
        if (!user) {
            return NextResponse.redirect(new URL('/cliente/login', request.url));
        }
        return supabaseResponse;
    }

    // Reseller routes — require auth as reseller (or super_admin)
    if (pathname.startsWith('/reseller')) {
        if (!user) {
            return NextResponse.redirect(new URL('/staff/login', request.url));
        }
        if (role !== 'reseller' && role !== 'super_admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return supabaseResponse;
    }

    // Dashboard/admin routes — require auth as super_admin or staff
    if (!user) {
        return NextResponse.redirect(new URL('/staff/login', request.url));
    }

    // Block staff from accessing finance, statistics and settings
    if (role === 'staff') {
        if (pathname.startsWith('/finance') || pathname.startsWith('/statistics') || pathname.startsWith('/settings')) {
            return NextResponse.redirect(new URL('/sales', request.url));
        }
    }

    // Only super_admin and staff can access admin routes
    // If role is undefined but user is authenticated, allow through (role lookup may have failed)
    if (role !== 'super_admin' && role !== 'staff' && role !== undefined) {
        if (role === 'reseller') {
            return NextResponse.redirect(new URL('/reseller', request.url));
        }
        return NextResponse.redirect(new URL('/cliente', request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
