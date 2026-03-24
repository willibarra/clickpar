'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, CheckCircle2, XCircle, History } from 'lucide-react';

interface RetroResult {
    total_overdue: number;
    queued: number;
    skipped_no_phone: number;
    cutoff_date: string;
    errors: string[];
}

export function RetroactiveQueueCard({ onComplete }: { onComplete?: () => void }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RetroResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    async function run() {
        if (!confirmed) { setConfirmed(true); return; }
        setLoading(true);
        setResult(null);
        setError(null);
        setConfirmed(false);
        try {
            const res = await fetch('/api/automatizaciones/retroactive-queue', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            setResult(data);
            onComplete?.();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card className="border-orange-500/20 bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-5 w-5 text-orange-400" />
                    Envío Retroactivo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Encola avisos para clientes con más de 2 días sin pagar (fuera de la ventana automática del cron). Luego ejecutá el pipeline para enviarlos.
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Warning */}
                <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                        Solo encola los mensajes — para que se envíen hay que correr el pipeline completo después.
                        Se puede ejecutar una vez por día sin duplicados.
                    </span>
                </div>

                {/* Button */}
                <Button
                    onClick={run}
                    disabled={loading}
                    className={
                        confirmed
                            ? 'w-full bg-orange-500 text-white hover:bg-orange-500/90'
                            : 'w-full border border-orange-500/40 bg-transparent text-orange-400 hover:bg-orange-500/10'
                    }
                    variant="outline"
                >
                    {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encolando...</>
                    ) : confirmed ? (
                        <><AlertTriangle className="mr-2 h-4 w-4" /> Confirmar — ¿Estás seguro?</>
                    ) : (
                        <><History className="mr-2 h-4 w-4" /> Encolar clientes en mora</>
                    )}
                </Button>

                {confirmed && !loading && (
                    <p className="text-center text-xs text-muted-foreground">
                        Hacé click de nuevo para confirmar
                    </p>
                )}

                {/* Result */}
                {result && (
                    <div className="rounded-lg border border-[#86EFAC]/20 bg-[#86EFAC]/5 p-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-[#86EFAC]">
                            <CheckCircle2 className="h-4 w-4" />
                            {result.queued} clientes encolados
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            <p>📋 Total en mora (antes de {result.cutoff_date}): <span className="text-foreground">{result.total_overdue}</span></p>
                            <p>📵 Sin teléfono: <span className="text-foreground">{result.skipped_no_phone}</span></p>
                            {result.errors.length > 0 && (
                                <p className="text-red-400">⚠ {result.errors.length} errores</p>
                            )}
                        </div>
                        <p className="text-xs text-orange-400 mt-1">
                            → Ahora ejecutá el Pipeline Completo para enviarlos
                        </p>
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
