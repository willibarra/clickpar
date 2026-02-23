import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalHeader, PortalNav } from '@/components/portal/portal-header';

export default async function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Not authenticated — middleware handles redirect to /portal/login
    // But for direct access, still show children (login page handles its own UI)
    if (!user) {
        return <>{children}</>;
    }

    // Get user profile
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('full_name, role')
        .eq('id', user.id)
        .single();

    // If admin/employee, redirect to admin dashboard
    if (profile?.role === 'admin' || profile?.role === 'employee') {
        redirect('/');
    }

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
