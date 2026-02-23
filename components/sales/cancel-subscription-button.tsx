'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { cancelSubscription } from '@/lib/actions/sales';

export function CancelSubscriptionButton({
    subscriptionId,
    slotId
}: {
    subscriptionId: string;
    slotId: string;
}) {
    const [loading, setLoading] = useState(false);

    async function handleCancel() {
        if (!confirm('¿Estás seguro de cancelar esta suscripción? El slot quedará disponible nuevamente.')) {
            return;
        }

        setLoading(true);
        await cancelSubscription(subscriptionId, slotId);
        setLoading(false);
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={handleCancel}
            disabled={loading}
        >
            {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <>
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                </>
            )}
        </Button>
    );
}
