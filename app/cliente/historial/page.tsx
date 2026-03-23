'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Calendar, DollarSign, TrendingUp } from 'lucide-react';

interface HistoryItem {
    id: string;
    platform: string;
    amount: number;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
    profile: string | null;
}

const PLATFORM_EMOJI: Record<string, string> = {
    Netflix: '🎬',
    'HBO Max': '💜',
    'Disney+': '🏰',
    'Amazon Prime Video': '📦',
    'Prime Video': '📦',
    Spotify: '🎧',
    'YouTube Premium': '▶️',
    Crunchyroll: '🍥',
    VIX: '📺',
    'Paramount+': '⛰️',
    iCloud: '☁️',
};

export default function HistorialPage() {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [totalSpent, setTotalSpent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/portal/history')
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setHistory(data.history);
                    setTotalSpent(data.totalSpent);
                } else {
                    setError(data.error);
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });

    const formatAmount = (a: number) =>
        `Gs. ${a.toLocaleString('es-PY')}`;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Historial de Pagos</h1>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Total Gastado</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">{formatAmount(totalSpent)}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span className="text-xs">Total Servicios</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">{history.length}</p>
                </div>
            </div>

            {/* History list */}
            {history.length > 0 ? (
                <div className="space-y-2">
                    {history.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 transition-colors hover:border-border"
                        >
                            <span className="text-2xl">{PLATFORM_EMOJI[item.platform] || '📱'}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-foreground text-sm">{item.platform}</p>
                                    {item.isActive ? (
                                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                            Activo
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            Finalizado
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {formatDate(item.startDate)}
                                    {item.endDate && ` → ${formatDate(item.endDate)}`}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                    {formatAmount(item.amount)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-16 text-center">
                    <DollarSign className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">Sin historial de pagos</p>
                </div>
            )}
        </div>
    );
}
