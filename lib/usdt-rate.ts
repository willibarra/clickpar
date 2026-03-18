'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setAppConfig } from '@/lib/actions/config';

const DB_KEY = 'usd_to_pyg_rate';
const CACHE_KEY = 'clickpar_usdt_rate';

export function useUsdtRate() {
    const [rate, setRateState] = useState<number>(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        async function loadRate() {
            // 1. Mostrar valor de caché local inmediatamente (UX rápida)
            const cached = localStorage.getItem(CACHE_KEY);
            const cachedParsed = cached ? parseFloat(cached) : 0;
            if (!isNaN(cachedParsed) && cachedParsed > 0) {
                setRateState(cachedParsed);
            }

            // 2. Leer desde la base de datos
            try {
                const supabase = createClient();
                const { data } = await (supabase.from('app_config') as any)
                    .select('value')
                    .eq('key', DB_KEY)
                    .single();

                if (data?.value) {
                    const dbRate = parseFloat(data.value);
                    if (!isNaN(dbRate) && dbRate > 0) {
                        setRateState(dbRate);
                        localStorage.setItem(CACHE_KEY, String(dbRate));
                    }
                }
            } catch {
                // Si falla la BD, usar el caché local (ya seteado arriba)
            }

            setLoaded(true);
        }

        loadRate();
    }, []);

    const setRate = useCallback(async (value: number) => {
        setRateState(value);
        // Actualizar caché local instantáneamente
        localStorage.setItem(CACHE_KEY, String(value));
        // Persistir en la base de datos
        await setAppConfig(DB_KEY, String(value));
    }, []);

    const convertToGs = useCallback(
        (usdt: number): number => {
            if (!rate || rate <= 0) return 0;
            return Math.round(usdt * rate);
        },
        [rate],
    );

    return { rate, setRate, convertToGs, loaded };
}
