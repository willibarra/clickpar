import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { AttendanceTracker } from '@/components/providers/attendance-tracker';

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
            <div className="flex min-h-screen bg-background">
                {/* Sidebar (renders its own spacer for dynamic width) */}
                <Sidebar />

                {/* Main Content Area */}
                <div className="flex flex-1 flex-col min-w-0">
                    {/* Header */}
                    <Header />

                    {/* Page Content */}
                    <main className="flex-1 p-6">
                        {children}
                    </main>
                </div>
            </div>
        </RealtimeProvider>
    );
}
