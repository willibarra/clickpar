'use client';

import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    useRealtimeNotifications();
    return <>{children}</>;
}
