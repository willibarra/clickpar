'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * [Capa 2] — Reactive auth guard for the client portal.
 *
 * Rendered as an invisible node inside the portal layout. Subscribes to
 * Supabase auth state changes so that if the session is invalidated while the
 * user is navigating (e.g. token expires, manual sign-out from another tab,
 * password change), they are immediately sent to the login page instead of
 * staying on a page with stale/broken auth.
 *
 * Does NOT block render — it is fire-and-forget after mount.
 */
export function PortalAuthGuard() {
    const router = useRouter();

    useEffect(() => {
        const supabase = createClient();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                // Session gone — hard-redirect to login (replace avoids back-button loop)
                router.replace('/cliente/login');
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [router]);

    // Renders nothing — purely side-effect
    return null;
}
