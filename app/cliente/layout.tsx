import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { PortalHeader, PortalNav } from '@/components/portal/portal-header';
import { WalletProvider } from '@/contexts/wallet-context';
import { PortalAuthGuard } from '@/components/portal/portal-auth-guard';

export default async function ClienteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Not authenticated — middleware handles redirect to /cliente/login
    if (!user) {
        return <>{children}</>;
    }

    // [Capa 5] If an authenticated user somehow reaches /cliente/login
    // (e.g. middleware was bypassed), skip the portal chrome entirely.
    // The x-pathname header is injected by middleware.ts for all /cliente/* routes.
    const headersList = await headers();
    const currentPath = headersList.get('x-pathname') ?? '';
    if (currentPath === '/cliente/login') {
        return <>{children}</>;
    }

    // Get user profile
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('full_name, role')
        .eq('id', user.id)
        .single();

    // Check if the user is a creator (has a creator_slug in customers)
    const { data: customer } = await (supabase.from('customers') as any)
        .select('creator_slug')
        .eq('portal_user_id', user.id)
        .single();

    // Note: we no longer redirect staff/admin away from /cliente.
    // The portal API filters services by phone number, so it works for any role.

    const userName = profile?.full_name || user.email || 'Cliente';
    const isCreator = !!(customer?.creator_slug);
    const userRole = isCreator ? 'Creador' : 'Cliente';

    return (
        <WalletProvider>
            <div className="flex min-h-screen flex-col bg-background">
                {/* [Capa 2] Reactive auth guard — redirects to login on session invalidation */}
                <PortalAuthGuard />
                <PortalHeader userName={userName} userRole={userRole} />
                <PortalNav />
                <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24 sm:pb-6">
                    {children}
                </main>
            </div>
        </WalletProvider>
    );
}
