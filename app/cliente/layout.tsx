import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalHeader, PortalNav } from '@/components/portal/portal-header';

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

    // Get user profile
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('full_name, role')
        .eq('id', user.id)
        .single();

    // Note: we no longer redirect staff/admin away from /cliente.
    // The portal API filters services by phone number, so it works for any role.

    const userName = profile?.full_name || user.email || 'Cliente';

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <PortalHeader userName={userName} />
            <PortalNav />
            <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24 sm:pb-6">
                {children}
            </main>
        </div>
    );
}
