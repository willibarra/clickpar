import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { AttendanceTracker } from '@/components/providers/attendance-tracker';
import { SidebarProvider } from '@/contexts/sidebar-context';

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
        redirect('/staff/login');
    }

    return (
        <RealtimeProvider>
            <AttendanceTracker />
            <SidebarProvider>
                <div className="flex min-h-screen bg-background">
                    {/* Sidebar (renders its own spacer for dynamic width) */}
                    <Sidebar />

                    {/* Main Content Area */}
                    <div className="flex flex-1 flex-col min-w-0">
                        {/* Header */}
                        <Header />

                        {/* Page Content — responsive padding */}
                        <main className="flex-1 p-3 md:p-6">
                            {children}
                        </main>
                    </div>
                </div>
            </SidebarProvider>
        </RealtimeProvider>
    );
}
