'use client';

import { useEffect, useState, useRef } from 'react';
import {
    Loader2, AlertTriangle, CheckCircle2, Clock, Copy, CopyCheck,
    Send, XCircle, RefreshCw, Bell,
} from 'lucide-react';
import { toast } from 'sonner';

interface CodeRequestItem {
    id: string;
    sale_id: string;
    customer_id: string;
    platform: string;
    account_email: string;
    supplier_name: string | null;
    status: string;
    code: string | null;
    auto_source: string;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
    expires_at: string;
    created_at: string;
    resolved_at: string | null;
    customers: {
        full_name: string;
        phone: string;
    };
}

const PLATFORM_EMOJI: Record<string, string> = {
    Netflix: '🎬',
    'Disney+': '🏰',
    'HBO Max': '💜',
    Spotify: '🎧',
    'Amazon Prime Video': '📦',
    'Prime Video': '📦',
    'YouTube Premium': '▶️',
    Crunchyroll: '🍥',
    VIX: '📺',
    'Paramount+': '⛰️',
    iCloud: '☁️',
};

function getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export default function CodeRequestsPage() {
    const [requests, setRequests] = useState<CodeRequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState<string | null>(null);
    const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
    const prevPendingCountRef = useRef(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchRequests = async () => {
        try {
            const res = await fetch('/api/admin/code-requests');
            const data = await res.json();
            if (data.success) {
                const newRequests = data.requests as CodeRequestItem[];
                
                // Check for new pending requests and play sound
                const newPendingCount = newRequests.filter((r: CodeRequestItem) => r.status === 'pending').length;
                if (newPendingCount > prevPendingCountRef.current && prevPendingCountRef.current >= 0) {
                    // Play notification sound (use browser notification API)
                    try {
                        if (audioRef.current) {
                            audioRef.current.play().catch(() => {});
                        }
                    } catch {}
                }
                prevPendingCountRef.current = newPendingCount;
                
                setRequests(newRequests);
            } else {
                setError(data.error || 'Error al obtener solicitudes');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
        // Auto-refresh every 10 seconds
        const interval = setInterval(fetchRequests, 10000);
        return () => clearInterval(interval);
    }, []);

    // Create a simple notification sound using AudioContext
    useEffect(() => {
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const createBeep = () => {
                const oscillator = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                oscillator.connect(gain);
                gain.connect(audioCtx.destination);
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gain.gain.value = 0.3;
                oscillator.start();
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                oscillator.stop(audioCtx.currentTime + 0.3);
            };
            // Store a wrapper as "audio"
            audioRef.current = { play: () => { createBeep(); return Promise.resolve(); } } as any;
        } catch {}
    }, []);

    const handleCopyEmail = (email: string) => {
        navigator.clipboard.writeText(email);
        setCopiedEmail(email);
        toast.success('Email copiado');
        setTimeout(() => setCopiedEmail(null), 2000);
    };

    const handleResolve = async (requestId: string) => {
        const code = codeInputs[requestId]?.trim();
        if (!code) {
            toast.error('Ingresá el código primero');
            return;
        }

        setProcessing(requestId);
        try {
            const res = await fetch('/api/admin/code-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId, code }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('✅ Código enviado al cliente');
                setCodeInputs((prev) => {
                    const copy = { ...prev };
                    delete copy[requestId];
                    return copy;
                });
                fetchRequests();
            } else {
                toast.error(data.error || 'Error al resolver');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setProcessing(null);
        }
    };

    const handleFail = async (requestId: string) => {
        setProcessing(requestId);
        try {
            const res = await fetch('/api/admin/code-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId, action: 'fail' }),
            });
            const data = await res.json();
            if (data.success) {
                toast.info('Solicitud marcada como fallida');
                fetchRequests();
            } else {
                toast.error(data.error || 'Error');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setProcessing(null);
        }
    };

    const pendingRequests = requests.filter((r) => r.status === 'pending' || r.status === 'processing');
    const completedRequests = requests.filter((r) => r.status === 'completed');

    if (loading && requests.length === 0) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
                <button onClick={fetchRequests} className="text-sm underline hover:text-foreground">
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        Solicitudes de Código
                        {pendingRequests.length > 0 && (
                            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white animate-pulse">
                                {pendingRequests.length}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Códigos de verificación solicitados por clientes
                    </p>
                </div>
                <button
                    onClick={fetchRequests}
                    className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Actualizar
                </button>
            </div>

            {/* Pending Requests */}
            {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-card py-16 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                    <p className="font-medium text-foreground">Sin solicitudes pendientes</p>
                    <p className="text-sm text-muted-foreground">Las solicitudes aparecerán aquí en tiempo real.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pendingRequests.map((req) => {
                        const emoji = PLATFORM_EMOJI[req.platform] || '📱';
                        const timeAgo = getTimeAgo(req.created_at);
                        const isProcessing = processing === req.id;

                        return (
                            <div
                                key={req.id}
                                className="overflow-hidden rounded-xl border border-amber-500/30 bg-card transition-all"
                            >
                                {/* Urgency bar */}
                                <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                                
                                <div className="p-4 space-y-3">
                                    {/* Top row: client + platform + time */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{emoji}</span>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">
                                                    {req.customers?.full_name || 'Cliente'}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="inline-flex items-center rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-100">
                                                        {req.platform}
                                                    </span>
                                                    {req.customers?.phone && (
                                                        <a
                                                            href={`https://wa.me/${req.customers.phone.replace('+', '')}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-xs text-blue-400 hover:underline"
                                                        >
                                                            {req.customers.phone}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-amber-400">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span className="text-xs font-medium">hace {timeAgo}</span>
                                        </div>
                                    </div>

                                    {/* Account email row */}
                                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                                        <span className="text-xs text-muted-foreground flex-shrink-0">Cuenta:</span>
                                        <span className="text-xs font-mono text-foreground flex-1 truncate">
                                            {req.account_email}
                                        </span>
                                        <button
                                            onClick={() => handleCopyEmail(req.account_email)}
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {copiedEmail === req.account_email
                                                ? <CopyCheck className="h-3.5 w-3.5 text-emerald-400" />
                                                : <Copy className="h-3.5 w-3.5" />
                                            }
                                        </button>
                                    </div>

                                    {/* Telegram bot info */}
                                    {req.telegram_bot_username && (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Bell className="h-3 w-3" />
                                            <span>
                                                Bot: <span className="text-foreground font-medium">{req.telegram_bot_username}</span>
                                                {req.telegram_user_identifier && (
                                                    <> — Usuario: <span className="text-foreground font-medium">{req.telegram_user_identifier}</span></>
                                                )}
                                            </span>
                                        </div>
                                    )}

                                    {/* Auto-processing status */}
                                    {req.status === 'processing' && (
                                        <div className="flex items-center gap-2 rounded-lg bg-[#818CF8]/10 px-3 py-2 text-xs text-[#818CF8]">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span className="font-medium">🤖 UserBot procesando automáticamente...</span>
                                        </div>
                                    )}

                                    {/* Code input + actions */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Ingresá el código aquí..."
                                            value={codeInputs[req.id] || ''}
                                            onChange={(e) => setCodeInputs((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleResolve(req.id);
                                            }}
                                            className="flex-1 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/40"
                                            disabled={isProcessing}
                                        />
                                        <button
                                            onClick={() => handleResolve(req.id)}
                                            disabled={isProcessing || !codeInputs[req.id]?.trim()}
                                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 transition-all"
                                        >
                                            {isProcessing
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <Send className="h-3.5 w-3.5" />
                                            }
                                            Enviar
                                        </button>
                                        <button
                                            onClick={() => handleFail(req.id)}
                                            disabled={isProcessing}
                                            className="flex items-center justify-center rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all"
                                            title="Marcar como fallido"
                                        >
                                            <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Completed (recent) */}
            {completedRequests.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Resueltos Recientes
                    </h2>
                    <div className="rounded-xl border border-border/50 bg-card overflow-hidden divide-y divide-border/30">
                        {completedRequests.slice(0, 10).map((req) => {
                            const emoji = PLATFORM_EMOJI[req.platform] || '📱';
                            return (
                                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                                    <span className="text-lg">{emoji}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {req.customers?.full_name} — {req.platform}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Código: <span className="font-mono text-foreground">{req.code}</span>
                                            {' · '}
                                            {req.resolved_at
                                                ? new Date(req.resolved_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
                                                : ''
                                            }
                                        </p>
                                    </div>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
