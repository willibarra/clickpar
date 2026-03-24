'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Play,
    ListOrdered,
    PenLine,
    Send,
    Loader2,
    CheckCircle2,
    XCircle,
    ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PhaseKey = 'queue' | 'compose' | 'send';

interface PhaseResult {
    success: boolean;
    status?: number;
    error?: string;
    data?: any;
}

interface RunResult {
    phases: Record<PhaseKey, PhaseResult>;
}

const PHASES: { key: PhaseKey; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'queue', label: 'Encolar', icon: ListOrdered, desc: 'Detecta ventas próximas a vencer y las agrega a la cola' },
    { key: 'compose', label: 'Componer', icon: PenLine, desc: 'Genera el cuerpo de cada mensaje (IA o plantilla)' },
    { key: 'send', label: 'Enviar', icon: Send, desc: 'Envía los mensajes compuestos vía WhatsApp' },
];

export function PipelineRunner({ onComplete }: { onComplete?: () => void }) {
    const [running, setRunning] = useState<PhaseKey | 'all' | null>(null);
    const [activePhase, setActivePhase] = useState<PhaseKey | null>(null);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function runPhase(phase: PhaseKey | 'all') {
        setRunning(phase);
        setResult(null);
        setError(null);
        setActivePhase(null);

        try {
            const url = phase === 'all'
                ? '/api/automatizaciones/run-pipeline'
                : `/api/automatizaciones/run-pipeline?phase=${phase}`;

            if (phase === 'all') {
                // Animate through phases
                for (const p of PHASES) {
                    setActivePhase(p.key);
                    await new Promise(r => setTimeout(r, 400));
                }
                setActivePhase(null);
            }

            const res = await fetch(url, { method: 'POST' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error ejecutando pipeline');
            setResult(data);
            onComplete?.();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setRunning(null);
            setActivePhase(null);
        }
    }

    function getSummary(key: PhaseKey) {
        if (!result?.phases?.[key]) return null;
        const p = result.phases[key];
        if (!p.success) return { ok: false, text: p.error || `HTTP ${p.status}` };

        const d = p.data;
        if (key === 'queue') {
            return { ok: true, text: `${d?.results?.queued ?? 0} encolados, ${d?.results?.cancelled ?? 0} cancelados` };
        }
        if (key === 'compose') {
            return { ok: true, text: `${d?.results?.composed ?? 0} compuestos, ${d?.results?.sent_via_ai ?? 0} vía IA, ${d?.results?.skipped ?? 0} skipped` };
        }
        if (key === 'send') {
            return { ok: true, text: `${d?.results?.sent ?? 0} enviados, ${d?.results?.failed ?? 0} fallidos, ${d?.results?.retrying ?? 0} reintentando` };
        }
        return null;
    }

    const isRunning = running !== null;

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Play className="h-5 w-5 text-[#86EFAC]" />
                    Disparador del Pipeline
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Ejecutá el pipeline completo o fase por fase
                </p>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Main run button */}
                <Button
                    onClick={() => runPhase('all')}
                    disabled={isRunning}
                    className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 font-semibold h-11"
                >
                    {running === 'all' ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ejecutando pipeline...</>
                    ) : (
                        <><Play className="mr-2 h-4 w-4" /> Ejecutar Pipeline Completo</>
                    )}
                </Button>

                {/* Individual phases */}
                <div className="grid gap-2">
                    {PHASES.map((phase, idx) => {
                        const summary = getSummary(phase.key);
                        const isActive = activePhase === phase.key;
                        const isThisRunning = running === phase.key;
                        const Icon = phase.icon;

                        return (
                            <div
                                key={phase.key}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg border p-3 transition-all duration-300',
                                    isActive ? 'border-[#86EFAC]/60 bg-[#86EFAC]/10' : 'border-border bg-muted/30',
                                )}
                            >
                                {/* Step number */}
                                <div className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0',
                                    summary?.ok === true ? 'bg-[#86EFAC] text-black' :
                                        summary?.ok === false ? 'bg-red-500/20 text-red-400' :
                                            isActive ? 'bg-[#86EFAC]/30 text-[#86EFAC]' :
                                                'bg-muted text-muted-foreground',
                                )}>
                                    {summary?.ok === true ? <CheckCircle2 className="h-4 w-4" /> :
                                        summary?.ok === false ? <XCircle className="h-4 w-4" /> :
                                            isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                                                idx + 1}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{phase.label}</p>
                                    {summary ? (
                                        <p className={cn('text-xs mt-0.5', summary.ok ? 'text-[#86EFAC]' : 'text-red-400')}>
                                            {summary.text}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground mt-0.5">{phase.desc}</p>
                                    )}
                                </div>

                                {/* Individual run button */}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => runPhase(phase.key)}
                                    disabled={isRunning}
                                    className="shrink-0 h-8 text-xs"
                                >
                                    {isThisRunning ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <><Icon className="mr-1 h-3 w-3" /> Ejecutar</>
                                    )}
                                </Button>
                            </div>
                        );
                    })}
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                        <XCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Success summary */}
                {result && !error && (
                    <div className="rounded-lg bg-[#86EFAC]/10 border border-[#86EFAC]/20 p-3 text-sm text-[#86EFAC]">
                        <div className="flex items-center gap-2 font-medium mb-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Pipeline completado
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Revisá los resultados por fase arriba
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
