'use client';

import { useState } from 'react';
import { AlertTriangle, Phone, Calendar, X, Loader2 } from 'lucide-react';
import { cancelSubscription } from '@/lib/actions/sales';
import { toast } from 'sonner';

interface OverdueClient {
    saleId: string;
    slotId: string;
    customerName: string | null;
    customerPhone: string | null;
    platform: string;
    accountEmail: string;
    slotIdentifier: string | null;
    endDate: string;
    daysOverdue: number;
}

interface OverdueClientsAlertProps {
    clients: OverdueClient[];
}

export function OverdueClientsAlert({ clients }: OverdueClientsAlertProps) {
    const [releasing, setReleasing] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    if (clients.length === 0) return null;

    const visible = clients.filter(c => !dismissed.has(c.saleId));
    if (visible.length === 0) return null;

    const handleRelease = async (client: OverdueClient) => {
        setReleasing(client.saleId);
        const result = await cancelSubscription(client.saleId, client.slotId);
        setReleasing(null);
        if (result.error) {
            toast.error(`Error al liberar: ${result.error}`);
        } else {
            toast.success(`Slot liberado — ${client.customerName || client.customerPhone}`);
            setDismissed(prev => new Set([...prev, client.saleId]));
        }
    };

    return (
        <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/5 to-[#1a1a1a] p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">
                        Clientes por liberar
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {visible.length} cliente{visible.length !== 1 ? 's' : ''} con suscripción vencida — no renovaron
                    </p>
                </div>
            </div>

            {/* Client List */}
            <div className="space-y-2">
                {visible.map(client => (
                    <div
                        key={client.saleId}
                        className="flex items-center gap-3 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2.5"
                    >
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">
                                    {client.customerName || client.customerPhone || 'Sin nombre'}
                                </span>
                                <span className="text-[10px] font-semibold text-red-400 bg-red-500/15 rounded px-1.5 py-0.5">
                                    {client.daysOverdue}d atrasado
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {client.customerPhone && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {client.customerPhone}
                                    </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                    {client.platform} · {client.slotIdentifier || 'Slot'}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Venció: {new Date(client.endDate + 'T12:00:00').toLocaleDateString('es-PY')}
                                </span>
                            </div>
                        </div>

                        {/* Liberar button */}
                        <button
                            onClick={() => handleRelease(client)}
                            disabled={releasing === client.saleId}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                            {releasing === client.saleId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <X className="h-3 w-3" />
                            )}
                            Liberar slot
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
