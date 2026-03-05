'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { registerAttendance, getStaffSchedule } from '@/lib/actions/attendance';
import { useRouter } from 'next/navigation';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export function AttendanceTracker() {
    const supabase = createClient();
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [schedule, setSchedule] = useState<any>(null);

    // Refs to track state inside event listeners without re-binding
    const lastActivityTime = useRef(Date.now());
    const hasShownRestToast = useRef(false);

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setUserId(user.id);

            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, role')
                .eq('id', user.id)
                .single();

            const name = (profile as any)?.full_name || user.email?.split('@')[0] || 'Staff';
            setUserName(name);

            // Si no es staff ni admin, no hace nada
            if ((profile as any)?.role !== 'super_admin' && (profile as any)?.role !== 'staff') {
                return;
            }

            // 1. Marcar asistencia
            const attResult = await registerAttendance(user.id);

            // 2. Traer horario
            const sched = await getStaffSchedule(user.id);
            if (sched) setSchedule(sched);

            // 3. Notificación de Bienvenida (con retraso de 5 segundos si es primer login)
            if (attResult?.isFirstLoginToday) {
                setTimeout(() => {
                    toast.success('¡Bienvenid@!', {
                        description: `Hola ${name}, que tengas una excelente jornada laboral.`,
                        duration: 8000,
                    });
                }, 5000);
            }
        }
        init();
    }, [supabase]);

    useEffect(() => {
        if (!userId) return;

        // Activity Tracker (Inactividad -> Logout)
        const updateActivity = () => {
            lastActivityTime.current = Date.now();
        };

        const activityEvents = ['mousemove', 'keydown', 'scroll', 'click'];
        activityEvents.forEach(e => window.addEventListener(e, updateActivity));

        const intervalId = setInterval(() => {
            const now = Date.now();

            // Check Inactivity
            if (now - lastActivityTime.current > INACTIVITY_TIMEOUT_MS) {
                supabase.auth.signOut().then(() => {
                    toast.error('Sesión Expirada', {
                        description: 'Tu sesión se cerró por inactividad prolongada (30 mins).',
                        duration: 10000,
                    });
                    router.push('/staff/login');
                });
                return; // Prevent further checks if logged out
            }

            // Check End of Shift (Rest Toast)
            if (schedule && !hasShownRestToast.current) {
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const currentDay = days[new Date().getDay()];
                const endTimeStr = schedule[`${currentDay}_end`];

                if (endTimeStr) {
                    const [endHour, endMin] = endTimeStr.split(':').map(Number);
                    const currentDate = new Date();

                    if (currentDate.getHours() > endHour || (currentDate.getHours() === endHour && currentDate.getMinutes() >= endMin)) {
                        toast.info('Fin de la jornada', {
                            description: `Gracias por trabajar en ClickPar, ${userName}. Ya es hora de tu descanso.`,
                            duration: 10000,
                        });
                        hasShownRestToast.current = true;
                    }
                }
            }

        }, 60000); // Check every minute

        return () => {
            activityEvents.forEach(e => window.removeEventListener(e, updateActivity));
            clearInterval(intervalId);
        };
    }, [userId, schedule, userName, supabase, router]);

    return null; // Componente invisible
}
