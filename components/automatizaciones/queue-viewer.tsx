'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Inbox, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueueCounts {
    pending: number;
    composed: number;
    sending: number;
    sent: number;
    failed: number;
    skipped: number;
    total: number;
}

interface QueueRow {
    id: string;
    status: string;
    message_type: string;
    channel: string;
    customer_name: string | null;
    platform: string | null;
    phone: string | null;
    error: string | null;
    sent_at: string | null;
    created_at: string;
    compose_method: string | null;
}

interface QueueViewerProps {
    counts: QueueCounts;
    recent: QueueRow[];
    onRefresh: () => void;
    loading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    pending: { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-400' },
    composed: { label: 'Compuesto', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-400' },
    sending: { label: 'Enviando', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', dot: 'bg-purple-400' },
    sent: { label: 'Enviado', color: 'bg-[#86EFAC]/10 text-[#86EFAC] border-[#86EFAC]/20', dot: 'bg-[#86EFAC]' },
    failed: { label: 'Fallido', color: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' },
    skipped: { label: 'Saltado', color: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' },
};

const TYPE_LABELS: Record<string, string> = {
    pre_expiry: '⏰ Pre-venc.',
    expiry_today: '🔴 Vence hoy',
    expired_yesterday: '⚠️ Venció ayer',
    cancelled: '❌ Cancelado',
};

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div className={cn('flex flex-col items-center rounded-lg border p-3', color)}>
            <span className="text-2xl font-bold">{count}</span>
            <span className="text-xs mt-0.5 opacity-80">{label}</span>
        </div>
    );
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
}

export function QueueViewer({ counts, recent, onRefresh, loading }: QueueViewerProps) {
    return (
        <div className="space-y-4">
            {/* Stats grid */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Inbox className="h-5 w-5 text-[#86EFAC]" />
                            Cola de Mensajes
                        </CardTitle>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onRefresh}
                            disabled={loading}
                            className="h-8 text-xs text-muted-foreground"
                        >
                            <RefreshCw className={cn('mr-1 h-3 w-3', loading && 'animate-spin')} />
                            Actualizar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        <StatBadge label="Pendiente" count={counts.pending} color="bg-yellow-500/10 text-yellow-400 border-yellow-500/20" />
                        <StatBadge label="Compuesto" count={counts.composed} color="bg-blue-500/10 text-blue-400 border-blue-500/20" />
                        <StatBadge label="Enviando" count={counts.sending} color="bg-purple-500/10 text-purple-400 border-purple-500/20" />
                        <StatBadge label="Enviado" count={counts.sent} color="bg-[#86EFAC]/10 text-[#86EFAC] border-[#86EFAC]/20" />
                        <StatBadge label="Fallido" count={counts.failed} color="bg-red-500/10 text-red-400 border-red-500/20" />
                        <StatBadge label="Saltado" count={counts.skipped} color="bg-muted text-muted-foreground border-border" />
                    </div>
                </CardContent>
            </Card>

            {/* Recent messages table */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Últimos mensajes en cola
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {recent.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Inbox className="h-10 w-10 mb-3 opacity-30" />
                            <p className="text-sm">Cola vacía</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                        <th className="px-4 py-2 font-medium">Cliente</th>
                                        <th className="px-4 py-2 font-medium">Tipo</th>
                                        <th className="px-4 py-2 font-medium">Canal</th>
                                        <th className="px-4 py-2 font-medium">Estado</th>
                                        <th className="px-4 py-2 font-medium">Método</th>
                                        <th className="px-4 py-2 font-medium">Hace</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recent.map((row) => {
                                        const statusCfg = STATUS_CONFIG[row.status] || STATUS_CONFIG['pending'];
                                        return (
                                            <tr
                                                key={row.id}
                                                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                                            >
                                                <td className="px-4 py-2.5">
                                                    <div className="font-medium text-foreground text-xs">
                                                        {row.customer_name || '—'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{row.platform}</div>
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                                    {TYPE_LABELS[row.message_type] || row.message_type}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <Badge variant="outline" className="text-xs capitalize">
                                                        {row.channel}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className={cn(
                                                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                                                        statusCfg.color
                                                    )}>
                                                        <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dot)} />
                                                        {statusCfg.label}
                                                    </span>
                                                    {row.error && (
                                                        <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate" title={row.error}>
                                                            {row.error}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                                                    {row.compose_method?.replace('_', ' ') || '—'}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                                    {timeAgo(row.created_at)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
