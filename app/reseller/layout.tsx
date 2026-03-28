import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResellerSidebar } from '@/components/reseller/reseller-sidebar';
import { Header } from '@/components/layout/header';

export default async function ResellerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/staff/login');
    }

    // Verify reseller role
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('role, full_name')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'reseller' && profile.role !== 'super_admin')) {
        redirect('/');
    }

    return (
        <div className="flex min-h-screen bg-background">
            <ResellerSidebar resellerName={profile.full_name || undefined} />
            <div className="ml-20 flex flex-1 flex-col">
                <Header />
                <main className="flex-1 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
