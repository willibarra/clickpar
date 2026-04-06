'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface WalletContextValue {
    /** Current wallet balance, null while loading */
    balance: number | null;
    /** Trigger a re-fetch of the wallet balance (e.g. after a purchase) */
    refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
    balance: null,
    refreshBalance: async () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
    const [balance, setBalance] = useState<number | null>(null);

    const refreshBalance = useCallback(async () => {
        try {
            const res = await fetch('/api/portal/wallet');
            const data = await res.json();
            if (data.success) {
                setBalance(data.balance);
            }
        } catch {
            // Silently ignore — balance will keep its previous value
        }
    }, []);

    // Initial fetch on mount
    useEffect(() => {
        refreshBalance();
    }, [refreshBalance]);

    return (
        <WalletContext.Provider value={{ balance, refreshBalance }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    return useContext(WalletContext);
}
