'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'clickpar_usdt_rate';

export function useUsdtRate() {
    const [rate, setRateState] = useState<number>(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? parseFloat(stored) : 0;
        setRateState(isNaN(parsed) ? 0 : parsed);
        setLoaded(true);
    }, []);

    const setRate = useCallback((value: number) => {
        setRateState(value);
        localStorage.setItem(STORAGE_KEY, String(value));
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
