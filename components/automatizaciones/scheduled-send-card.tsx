'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Loader2, CheckCircle2, XCircle, Users, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreviewData {
    total_uncontacted: number;
    with_phone: number;
    without_phone: number;
    scheduled_at: string;
    estimated_minutes: number;
}

interface QueueResult {
    queued: number;
    skipped_no_phone: number;
    scheduled_at: string;
}

export function ScheduledSendCard({ onComplete }: { onComplete?: () => void }) {
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [queuing, setQueuing] = useState(false);
    const [result, setResult] = useState<QueueResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState('');

    async function loadPreview() {
        setLoadingPreview(true);
        try {
            const res = await fetch('/api/automatizaciones/unsent-queue?preview=true', { method: 'POST' });
            const data = await res.json();
            if (res.ok) setPreview(data);
            else setError(data.error);
        } finally {
            setLoadingPreview(false);
        }
    }

    async function schedule() {
        setQueuing(true);
        setError(null);
        try {
            const res = await fetch('/api/automatizaciones/unsent-queue', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data);
            onComplete?.();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setQueuing(false);
        }
    }

    // Countdown timer to 7am
    useEffect(() => {
        if (!result) return;
        const target = new Date(result.scheduled_at);
        const interval = setInterval(() => {
            const now = new Date();
            const diff = target.getTime() - now.getTime();
            if (diff <= 0) { setCountdown('¡Ejecutando!'); clearInterval(interval); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(`${h}h ${m}m ${s}s`);
        }, 1000);
        return () => clearInterval(interval);
    }, [result]);

    return (
        <Card className="border-blue-500/20 bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-5 w-5 text-blue-400" />
                    Programar Envío para 7am
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Detecta clientes sin aviso WA y los encola para enviarse automáticamente a las 7:00am. Luego el pipeline los despacha.
                </p>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Preview */}
                {!preview && !result && (
                    <Button
                        onClick={loadPreview}
                        disabled={loadingPreview}
                        variant="outline"
                        className="w-full border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                    >
                        {loadingPreview
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculando...</>
                            : <><Users className="mr-2 h-4 w-4" /> Ver cuántos no recibieron aviso</>}
                    </Button>
                )}

                {preview && !result && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                                <p className="text-2xl font-bold text-blue-400">{preview.with_phone}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Sin aviso (con tel.)</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 border border-border p-3">
                                <p className="text-2xl font-bold text-muted-foreground">{preview.without_phone}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Sin teléfono</p>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Timer className="h-3.5 w-3.5" />
                            Tiempo estimado: ~{preview.estimated_minutes < 1 ? '<1' : Math.ceil(preview.estimated_minutes * 2)} min
                            <span className="text-muted-foreground/60">| 30s entre cada 5 mensajes</span>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreview(null)}
                                className="text-xs text-muted-foreground"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={schedule}
                                disabled={queuing || preview.with_phone === 0}
                                className="flex-1 bg-blue-500 text-white hover:bg-blue-500/90"
                            >
                                {queuing
                                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encolando...</>
                                    : <><Clock className="mr-2 h-4 w-4" /> Programar {preview.with_phone} mensajes para 7am</>}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Scheduled success */}
                {result && (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-[#86EFAC]/20 bg-[#86EFAC]/5 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-[#86EFAC] mb-1">
                                <CheckCircle2 className="h-4 w-4" />
                                {result.queued} mensajes programados
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Listos para enviarse a las 7:00am
                            </p>
                        </div>

                        {countdown && (
                            <div className="flex items-center justify-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                                <Timer className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-mono text-blue-400">
                                    {countdown === '¡Ejecutando!' ? '🚀 ¡Ejecutando!' : `faltan ${countdown}`}
                                </span>
                            </div>
                        )}

                        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-400 space-y-1">
                            <p className="font-medium">⚠ Paso necesario a las 7am:</p>
                            <p>Cuando llegue la hora, ejecutá el Pipeline Completo desde este panel o el cron del VPS lo hará automáticamente.</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                        <XCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
