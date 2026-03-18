import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Redirect legacy/removed routes
    if (pathname === '/register' || pathname === '/portal/login') {
        return NextResponse.redirect(new URL('/cliente/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
        return NextResponse.redirect(new URL(pathname.replace('/portal', '/cliente'), request.url));
    }

    // Skip auth for login pages and API routes
    if (
        pathname === '/cliente/login' ||
        pathname === '/staff/login' ||
        pathname.startsWith('/api/')
    ) {
        return NextResponse.next({ request });
    }

    let supabaseResponse = NextResponse.next({ request });

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
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, {
                            ...options,
                            maxAge: 7 * 24 * 60 * 60, // 7 days session limit
                        })
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
            // Admin dashboard — let through to (dashboard)/page.tsx
            return supabaseResponse;
        }
        if (role === 'customer') {
            return NextResponse.redirect(new URL('/cliente', request.url));
        }
        // Unknown role → staff login
        return NextResponse.redirect(new URL('/staff/login', request.url));
    }

    // Cliente portal routes — require auth as customer
    if (pathname.startsWith('/cliente')) {
        if (!user) {
            return NextResponse.redirect(new URL('/cliente/login', request.url));
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
    if (role !== 'super_admin' && role !== 'staff') {
        return NextResponse.redirect(new URL('/cliente', request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
