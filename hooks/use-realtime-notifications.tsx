'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function useRealtimeNotifications() {
    const supabase = createClient();
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));

        const channel = supabase
            .channel('realtime-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications'
                },
                (payload) => {
                    const newNotification = payload.new;

                    if (newNotification.type === 'audit_event') {
                        toast.success('Nueva Actividad', {
                            description: newNotification.message,
                            duration: 5000,
                            action: {
                                label: 'Ver',
                                onClick: () => {
                                    if (['sale', 'bundle', 'combo'].includes(newNotification.related_resource_type)) {
                                        router.push('/sales');
                                    } else if (['mother_account', 'slot'].includes(newNotification.related_resource_type)) {
                                        router.push('/inventory');
                                    } else if (['user', 'customer'].includes(newNotification.related_resource_type)) {
                                        router.push('/settings');
                                    } else {
                                        router.push('/settings');
                                    }
                                }
                            }
                        });
                    } else if (newNotification.type === 'system_alert') {
                        toast.info('Notificación', {
                            description: newNotification.message,
                            duration: 5000,
                        });
                    } else if (newNotification.type === 'new_account') {
                        toast('📦 Nueva Cuenta', {
                            description: newNotification.message,
                            duration: 8000,
                            action: {
                                label: 'Ver',
                                onClick: () => router.push('/inventory'),
                            },
                        });
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('🔗 Suscrito a notificaciones en tiempo real');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, router]);
}
