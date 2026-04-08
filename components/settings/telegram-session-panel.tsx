'use client';

import { useState, useEffect } from 'react';
import {
    Loader2, Check, XCircle, Wifi, WifiOff, Trash2,
    Phone, Key, Send, AlertTriangle, RefreshCw,
} from 'lucide-react';

interface TelegramSession {
    id: string;
    label: string;
    phone_number: string;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
}

type SetupState = 'idle' | 'init' | 'otp-sent' | 'verifying' | 'done' | 'error';

export function TelegramSessionPanel() {
    const [sessions, setSessions] = useState<TelegramSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    // Setup form
    const [setupState, setSetupState] = useState<SetupState>('idle');
    const [setupError, setSetupError] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [apiId, setApiId] = useState('');
    const [apiHash, setApiHash] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [setupLoading, setSetupLoading] = useState(false);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/admin/telegram-session');
            const data = await res.json();
            if (data.success) {
                setSessions(data.sessions);
            }
        } catch {}
        setLoading(false);
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleInit = async () => {
        if (!phone || !apiId || !apiHash) {
            setSetupError('Completá todos los campos');
            return;
        }
        setSetupLoading(true);
        setSetupError(null);
        try {
            const res = await fetch('/api/admin/telegram-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'init', phone, apiId: Number(apiId), apiHash }),
            });
            const data = await res.json();
            if (data.success) {
                setSetupState('otp-sent');
            } else {
                setSetupError(data.error || 'Error al iniciar');
                setSetupState('error');
            }
        } catch {
            setSetupError('Error de conexión');
            setSetupState('error');
        }
        setSetupLoading(false);
    };

    const handleVerify = async () => {
        if (!otpCode) {
            setSetupError('Ingresá el código OTP');
            return;
        }
        setSetupLoading(true);
        setSetupError(null);
        try {
            const res = await fetch('/api/admin/telegram-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify', phone, code: otpCode }),
            });
            const data = await res.json();
            if (data.success) {
                setSetupState('done');
                fetchSessions();
            } else {
                setSetupError(data.error || 'Error al verificar');
            }
        } catch {
            setSetupError('Error de conexión');
        }
        setSetupLoading(false);
    };

    const handleTest = async () => {
        setTestLoading(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/admin/telegram-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test' }),
            });
            const data = await res.json();
            setTestResult(data.success ? data.message : data.error);
        } catch {
            setTestResult('Error de conexión');
        }
        setTestLoading(false);
    };

    const handleDelete = async (sessionId: string) => {
        if (!confirm('¿Estás seguro de eliminar esta sesión?')) return;
        try {
            await fetch('/api/admin/telegram-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', sessionId }),
            });
            fetchSessions();
        } catch {}
    };

    const hasActiveSession = sessions.some(s => s.is_active);

    return (
        <div className="p-5 space-y-5">
            {/* Active sessions */}
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Cargando sesiones...</span>
                </div>
            ) : sessions.length > 0 ? (
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Sesiones Activas
                    </h4>
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                    s.is_active ? 'bg-emerald-500/15' : 'bg-red-500/15'
                                }`}>
                                    {s.is_active
                                        ? <Wifi className="h-4 w-4 text-emerald-400" />
                                        : <WifiOff className="h-4 w-4 text-red-400" />
                                    }
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {s.label} — {s.phone_number}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {s.last_used_at
                                            ? `Último uso: ${new Date(s.last_used_at).toLocaleString('es-PY')}`
                                            : 'Sin usar aún'
                                        }
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleTest}
                                    disabled={testLoading}
                                    className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {testLoading
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <RefreshCw className="h-3 w-3" />
                                    }
                                    Test
                                </button>
                                <button
                                    onClick={() => handleDelete(s.id)}
                                    className="flex items-center justify-center rounded-lg bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {testResult && (
                        <div className={`rounded-lg px-4 py-2.5 text-xs ${
                            testResult.startsWith('✅')
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-red-500/15 text-red-400'
                        }`}>
                            {testResult}
                        </div>
                    )}
                </div>
            ) : null}

            {/* Setup form */}
            {!hasActiveSession || setupState !== 'idle' ? (
                <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Send className="h-4 w-4 text-[#818CF8]" />
                        Conectar Telegram UserBot
                    </h4>

                    {setupState === 'done' ? (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-3 text-sm text-emerald-400">
                            <Check className="h-4 w-4" />
                            ¡Telegram conectado correctamente!
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                                <p className="text-xs text-amber-300 flex items-start gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span>
                                        <strong>Antes de empezar:</strong> Necesitás obtener tu <code className="bg-muted px-1 rounded">api_id</code> y <code className="bg-muted px-1 rounded">api_hash</code> desde{' '}
                                        <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="underline hover:text-amber-200">
                                            my.telegram.org
                                        </a>
                                        . Usá la cuenta de Telegram de ClickPar.
                                    </span>
                                </p>
                            </div>

                            {setupState !== 'otp-sent' ? (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Teléfono (con código de país)
                                        </label>
                                        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
                                            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            <input
                                                type="text"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="+595971995666"
                                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">API ID</label>
                                            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
                                                <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                <input
                                                    type="text"
                                                    value={apiId}
                                                    onChange={(e) => setApiId(e.target.value)}
                                                    placeholder="12345678"
                                                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">API Hash</label>
                                            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
                                                <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                <input
                                                    type="text"
                                                    value={apiHash}
                                                    onChange={(e) => setApiHash(e.target.value)}
                                                    placeholder="abcdef1234567890..."
                                                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        📱 Se envió un código OTP a tu cuenta de Telegram ({phone}). Ingresalo aquí:
                                    </p>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
                                        <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        <input
                                            type="text"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
                                            placeholder="12345"
                                            maxLength={6}
                                            className="flex-1 bg-transparent text-lg font-mono font-bold text-foreground tracking-[0.3em] placeholder:text-muted-foreground/50 focus:outline-none text-center"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            {setupError && (
                                <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-400">
                                    <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                    {setupError}
                                </div>
                            )}

                            <button
                                onClick={setupState === 'otp-sent' ? handleVerify : handleInit}
                                disabled={setupLoading}
                                className="w-full rounded-xl bg-gradient-to-r from-[#818CF8] to-[#6366F1] px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            >
                                {setupLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {setupState === 'otp-sent' ? 'Verificando...' : 'Conectando...'}
                                    </span>
                                ) : (
                                    setupState === 'otp-sent' ? 'Verificar Código OTP' : 'Enviar Código OTP'
                                )}
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <button
                    onClick={() => setSetupState('init')}
                    className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                    + Agregar otra sesión
                </button>
            )}

            <p className="text-xs text-muted-foreground">
                El UserBot se conecta como usuario de Telegram para interactuar con bots de proveedores 
                y obtener códigos de verificación automáticamente.
            </p>
        </div>
    );
}
