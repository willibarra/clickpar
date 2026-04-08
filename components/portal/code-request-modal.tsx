'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Copy, Check, AlertTriangle, Clock, ShieldCheck } from 'lucide-react';

interface CodeRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    saleId: string;
    platform: string;
}

type RequestState = 'confirm' | 'requesting' | 'waiting' | 'received' | 'failed' | 'expired';

export function CodeRequestModal({ isOpen, onClose, saleId, platform }: CodeRequestModalProps) {
    const [state, setState] = useState<RequestState>('confirm');
    const [requestId, setRequestId] = useState<string | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [copied, setCopied] = useState(false);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cleanup on close
    useEffect(() => {
        if (!isOpen) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
            // Reset state on close after animation
            const timeout = setTimeout(() => {
                setState('confirm');
                setRequestId(null);
                setCode(null);
                setError(null);
                setElapsed(0);
                setCopied(false);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [isOpen]);

    // Poll for code
    const startPolling = useCallback((reqId: string) => {
        // Clear any existing polls
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);

        setElapsed(0);
        elapsedIntervalRef.current = setInterval(() => {
            setElapsed((e) => e + 1);
        }, 1000);

        const pollFn = async () => {
            try {
                const res = await fetch(`/api/portal/code-request?id=${reqId}`);
                const data = await res.json();

                if (data.status === 'completed' && data.code) {
                    setCode(data.code);
                    setState('received');
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
                } else if (data.status === 'failed') {
                    setState('failed');
                    setError('No se pudo obtener el código. Contactá a soporte.');
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
                } else if (data.status === 'expired') {
                    setState('expired');
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
                }
            } catch {
                // Network error — keep polling
            }
        };

        // Start polling every 5 seconds
        pollIntervalRef.current = setInterval(pollFn, 5000);

        // Also set a max timeout of 5 minutes
        setTimeout(() => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        }, 5 * 60 * 1000);
    }, []);

    const handleRequest = async () => {
        setState('requesting');
        setError(null);

        try {
            const res = await fetch('/api/portal/code-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ saleId }),
            });
            const data = await res.json();

            if (data.success) {
                setRequestId(data.requestId);
                setState('waiting');
                startPolling(data.requestId);
            } else if (data.existingRequestId) {
                // There's an existing pending request — poll it
                setRequestId(data.existingRequestId);
                setState('waiting');
                startPolling(data.existingRequestId);
            } else {
                setState('failed');
                setError(data.error || 'Error al solicitar código');
            }
        } catch {
            setState('failed');
            setError('Error de conexión');
        }
    };

    const handleCopy = async () => {
        if (!code) return;
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatElapsed = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                    <h3 className="text-sm font-semibold text-foreground">
                        Código de Verificación — {platform}
                    </h3>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5">
                    {/* Confirm state */}
                    {state === 'confirm' && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#86EFAC]/15">
                                <ShieldCheck className="h-8 w-8 text-[#86EFAC]" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    ¿Necesitás un código de verificación?
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Vamos a solicitar tu código de {platform}. 
                                    El proceso puede tardar 1-3 minutos.
                                </p>
                            </div>
                            <button
                                onClick={handleRequest}
                                className="w-full rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] px-6 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95"
                            >
                                Solicitar Código
                            </button>
                        </div>
                    )}

                    {/* Requesting state */}
                    {state === 'requesting' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
                            <p className="text-sm text-muted-foreground">Enviando solicitud…</p>
                        </div>
                    )}

                    {/* Waiting state */}
                    {state === 'waiting' && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
                                <div className="relative">
                                    <Clock className="h-8 w-8 text-amber-400" />
                                    <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 animate-ping" />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Esperando tu código…
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Tu solicitud está siendo procesada. 
                                    El código aparecerá aquí automáticamente.
                                </p>
                            </div>
                            <div className="rounded-xl bg-muted/50 px-4 py-3">
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    <span className="text-sm font-mono text-muted-foreground">
                                        {formatElapsed(elapsed)}
                                    </span>
                                </div>
                            </div>
                            {elapsed > 180 && (
                                <p className="text-xs text-amber-400">
                                    Está tardando más de lo normal. Si no llega en breve, contactá a soporte.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Received state */}
                    {state === 'received' && code && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
                                <Check className="h-8 w-8 text-emerald-400" />
                            </div>
                            <p className="text-sm font-medium text-foreground">
                                ¡Tu código está listo!
                            </p>

                            {/* Code display */}
                            <button
                                onClick={handleCopy}
                                className="group relative mx-auto flex items-center gap-3 rounded-2xl border-2 border-[#86EFAC]/40 bg-[#86EFAC]/10 px-8 py-4 transition-all hover:border-[#86EFAC]/60 hover:bg-[#86EFAC]/20 active:scale-95"
                            >
                                <span className="text-3xl font-bold font-mono tracking-[0.3em] text-foreground">
                                    {code}
                                </span>
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#86EFAC]/20">
                                    {copied
                                        ? <Check className="h-4 w-4 text-[#86EFAC]" />
                                        : <Copy className="h-4 w-4 text-[#86EFAC]" />
                                    }
                                </div>
                            </button>
                            <p className="text-xs text-muted-foreground">
                                {copied ? '✅ Copiado al portapapeles' : 'Tocá para copiar'}
                            </p>

                            <div className="rounded-xl bg-muted/30 px-4 py-3">
                                <p className="text-xs text-muted-foreground">
                                    📺 Ingresá este código en tu TV o app de {platform}.
                                    <br />
                                    El código expira en unos minutos.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Failed state */}
                    {state === 'failed' && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15">
                                <AlertTriangle className="h-8 w-8 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    No pudimos obtener el código
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {error || 'Ocurrió un error. Intentá de nuevo o contactá a soporte.'}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setState('confirm'); setError(null); }}
                                    className="flex-1 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
                                >
                                    Reintentar
                                </button>
                                <a
                                    href="https://wa.me/595994540904?text=Hola%2C%20necesito%20ayuda%20con%20un%20código%20de%20verificación"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-medium text-white text-center transition-colors hover:bg-[#20BD5C]"
                                >
                                    Soporte
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Expired state */}
                    {state === 'expired' && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/15">
                                <Clock className="h-8 w-8 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    La solicitud expiró
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Pasaron más de 15 minutos. Podés solicitar un nuevo código.
                                </p>
                            </div>
                            <button
                                onClick={() => { setState('confirm'); setError(null); setElapsed(0); }}
                                className="w-full rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] px-6 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95"
                            >
                                Solicitar Nuevo Código
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
