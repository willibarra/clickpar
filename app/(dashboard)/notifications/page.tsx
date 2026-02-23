import { getNotifications } from '@/lib/actions/notifications';
import { NotificationsListView } from '@/components/notifications/notifications-list';
import { Bell } from 'lucide-react';

export default async function NotificationsPage() {
    const notifications = await getNotifications();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Bell className="h-7 w-7 text-[#F97316]" />
                    Centro de Notificaciones
                </h1>
                <p className="text-muted-foreground">
                    Todas las alertas y notificaciones del sistema
                </p>
            </div>
            <NotificationsListView notifications={notifications} />
        </div>
    );
}
