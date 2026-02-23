import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Redirect to login if not authenticated
    if (!user) {
        redirect('/login');
    }

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="ml-20 flex flex-1 flex-col">
                {/* Header */}
                <Header />

                {/* Page Content */}
                <main className="flex-1 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
