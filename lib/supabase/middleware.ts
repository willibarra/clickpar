import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
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
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make your application
    // vulnerable to security issues.

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes - redirect to login if not authenticated
    const protectedPaths = ['/', '/inventory', '/sales', '/customers', '/finance', '/settings'];
    const isProtectedPath = protectedPaths.some(
        (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/')
    );

    // Auth routes - redirect to dashboard if already authenticated
    const authPaths = ['/login', '/register'];
    const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path));

    if (!user && isProtectedPath) {
        // No user, trying to access protected route -> redirect to login
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (user && isAuthPath) {
        // User is logged in, trying to access auth page -> redirect to dashboard
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
