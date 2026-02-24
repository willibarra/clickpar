import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

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
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    // Root domain: if not logged in → Instagram, if logged in → depends on role
    if (pathname === '/') {
        if (!user) {
            return NextResponse.redirect('https://instagram.com/click.par');
        }
        // Logged-in users accessing / → check role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const role = (profile as any)?.role;
        if (role === 'super_admin' || role === 'staff') {
            // Admin dashboard — let through to (dashboard)/page.tsx
            return supabaseResponse;
        }
        if (role === 'customer') {
            return NextResponse.redirect(new URL('/cliente', request.url));
        }
        // Unknown role → Instagram
        return NextResponse.redirect('https://instagram.com/click.par');
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

    // Check role for admin routes
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (profile as any)?.role;

    // Block staff from accessing finance and settings
    if (role === 'staff') {
        if (pathname.startsWith('/finance') || pathname.startsWith('/settings')) {
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
