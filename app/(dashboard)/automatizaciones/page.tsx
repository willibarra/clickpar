'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { PipelineRunner } from '@/components/automatizaciones/pipeline-runner';
import { QueueViewer } from '@/components/automatizaciones/queue-viewer';
import { N8NStatusCard } from '@/components/automatizaciones/n8n-status-card';
import { ExecutionLog } from '@/components/automatizaciones/execution-log';
import { RetroactiveQueueCard } from '@/components/automatizaciones/retroactive-queue-card';
import { ScheduledSendCard } from '@/components/automatizaciones/scheduled-send-card';

interface StatsData {
    counts: {
        pending: number;
        composed: number;
        sending: number;
        sent: number;
        failed: number;
        skipped: number;
        total: number;
    };
    recent: any[];
    n8nEnabled: boolean;
    whitelistEnabled: boolean;
    history: any[];
}

export default function AutomatizacionesPage() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/automatizaciones/queue-stats');
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Zap className="h-6 w-6 text-[#86EFAC]" />
                    Automatizaciones
                </h1>
                <p className="text-muted-foreground mt-1">
                    Control total del pipeline de envío automático de mensajes
                </p>
            </div>

            {loading && !stats ? (
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
                    {/* Left column */}
                    <div className="space-y-4">
                        <PipelineRunner onComplete={fetchStats} />

                        {stats && (
                            <N8NStatusCard
                                n8nEnabled={stats.n8nEnabled}
                                whitelistEnabled={stats.whitelistEnabled}
                                onRefresh={fetchStats}
                            />
                        )}

                        <ScheduledSendCard onComplete={fetchStats} />

                        <RetroactiveQueueCard onComplete={fetchStats} />
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                        {stats && (
                            <>
                                <QueueViewer
                                    counts={stats.counts}
                                    recent={stats.recent}
                                    onRefresh={fetchStats}
                                    loading={loading}
                                />
                                <ExecutionLog history={stats.history} />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
