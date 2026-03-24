'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';

interface HistoryRow {
    id: string;
    type: string;
    message: string;
    created_at: string;
}

const TYPE_ICON: Record<string, string> = {
    queue_messages: '📋',
    send_messages: '📬',
    expiration_cron: '⏰',
};

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
}

export function ExecutionLog({ history }: { history: HistoryRow[] }) {
    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Historial de Ejecuciones
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <History className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Sin ejecuciones registradas</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {history.map((row) => (
                            <div key={row.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                                <span className="text-base mt-0.5 shrink-0">
                                    {TYPE_ICON[row.type] || '🔔'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground leading-relaxed">{row.message}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(row.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
