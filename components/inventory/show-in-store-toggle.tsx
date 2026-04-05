'use client';

import { useState } from 'react';
import { toggleShowInStore } from '@/lib/actions/store';
import { ShoppingBag } from 'lucide-react';

interface ShowInStoreToggleProps {
    accountId: string;
    initialValue: boolean;
}

/**
 * Toggle switch that controls show_in_store on a mother_account.
 * Optimistic: updates local state immediately, rolls back on error.
 */
export function ShowInStoreToggle({ accountId, initialValue }: ShowInStoreToggleProps) {
    const [enabled, setEnabled] = useState(initialValue);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        const newValue = !enabled;
        setEnabled(newValue); // optimistic
        setLoading(true);
        try {
            const result = await toggleShowInStore(accountId, newValue);
            if (!result.success) {
                setEnabled(!newValue); // rollback
                console.error('[ShowInStoreToggle] Error:', result.error);
            }
        } catch {
            setEnabled(!newValue); // rollback
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={loading}
            title={enabled ? 'Visible en Tienda — click para ocultar' : 'Oculto en Tienda — click para mostrar'}
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${enabled
                    ? 'bg-[#86EFAC]/20 text-[#86EFAC] border border-[#86EFAC]/40 hover:bg-[#86EFAC]/30'
                    : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                }`}
        >
            <ShoppingBag className="h-3 w-3 flex-shrink-0" />
            {enabled ? '🛒 En Tienda' : 'Oculto'}
        </button>
    );
}
