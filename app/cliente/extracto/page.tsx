'use client';

import { useEffect, useState } from 'react';
import {
    Loader2, AlertTriangle, Wallet, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownLeft, RefreshCw, ExternalLink,
} from 'lucide-react';

interface WalletMovement {
    id: string;
    amount: number;
    type: 'credit' | 'debit';
    concept: string;
    created_at: string;
}

const TOPUP_AMOUNTS = [25000, 50000, 100000, 200000];

export default function ExtractoPage() {
    const [balance, setBalance] = useState<number>(0);
    const [movements, setMovements] = useState<WalletMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Top-up flow
    const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
    const [customAmount, setCustomAmount] = useState('');
    const [topupLoading, setTopupLoading] = useState(false);
    const [topupError, setTopupError] = useState<string | null>(null);

    const loadWallet = () => {
        setLoading(true);
        fetch('/api/portal/wallet')
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setBalance(data.balance);
                    setMovements(data.movements);
                } else {
                    setError(data.error || 'Error al cargar billetera');
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadWallet(); }, []);

    const handleTopup = async () => {
        const amount = customAmount ? Number(customAmount) : selectedAmount;
        if (!amount || amount <= 0) {
            setTopupError('Ingresá el monto a recargar');
            return;
        }
        if (amount < 5000) {
            setTopupError('El monto mínimo de recarga es Gs. 5.000');
            return;
        }
        setTopupLoading(true);
        setTopupError(null);
        try {
            const res = await fetch('/api/pagopar/crear-pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'wallet_topup', amount_gs: amount }),
            });
            const data = await res.json();
            if (data.success && data.paymentUrl) {
                window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
            } else {
                setTopupError(data.error || 'Error al generar el pago');
            }
        } catch {
            setTopupError('Error de conexión');
        } finally {
            setTopupLoading(false);
        }
    };

    const formatGs = (n: number) => `Gs. ${new Intl.NumberFormat('es-PY').format(Math.abs(n))}`;
    const formatDate = (d: string) => new Date(d).toLocaleDateString('es-PY', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
    const formatTime = (d: string) => new Date(d).toLocaleTimeString('es-PY', {
        hour: '2-digit', minute: '2-digit',
    });

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

    const totalCredits = movements.filter((m) => m.type === 'credit').reduce((s, m) => s + m.amount, 0);
    const totalDebits = movements.filter((m) => m.type === 'debit').reduce((s, m) => s + Math.abs(m.amount), 0);
    const topupFinalAmount = customAmount ? Number(customAmount) : selectedAmount;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Billetera</h1>

            {/* Balance card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#86EFAC]/20 via-[#6EE7B7]/10 to-transparent border border-[#86EFAC]/30 p-6">
                <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[#86EFAC]/10 blur-2xl" />
                <div className="relative">
                    <div className="flex items-center gap-2 text-[#86EFAC] mb-1">
                        <Wallet className="h-5 w-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Saldo Disponible</span>
                    </div>
                    <p className="text-4xl font-bold text-foreground">{formatGs(balance)}</p>
                </div>
            </div>

            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium">Total Recargado</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{formatGs(totalCredits)}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="flex items-center gap-2 text-red-400 mb-1">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-xs font-medium">Total Gastado</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{formatGs(totalDebits)}</p>
                </div>
            </div>

            {/* Top-up section */}
            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Cargar Saldo
                </h2>

                {/* Quick amount buttons */}
                <div className="grid grid-cols-4 gap-2">
                    {TOPUP_AMOUNTS.map((amt) => (
                        <button
                            key={amt}
                            onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                            className={`rounded-xl py-2.5 text-sm font-semibold transition-all ${selectedAmount === amt && !customAmount
                                ? 'bg-[#86EFAC] text-black'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            {new Intl.NumberFormat('es-PY').format(amt / 1000)}k
                        </button>
                    ))}
                </div>

                {/* Custom amount */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Otro monto (Gs.)
                    </label>
                    <input
                        type="number"
                        placeholder="Ej: 75000"
                        value={customAmount}
                        onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                        className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/40"
                    />
                </div>

                {topupError && (
                    <p className="text-xs text-red-400">{topupError}</p>
                )}

                <button
                    onClick={handleTopup}
                    disabled={topupLoading || (!selectedAmount && !customAmount)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] px-6 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {topupLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        <ExternalLink className="h-4 w-4" />
                    )}
                    {topupLoading
                        ? 'Generando pago…'
                        : topupFinalAmount
                            ? `Pagar Gs. ${new Intl.NumberFormat('es-PY').format(topupFinalAmount)} con PagoPar`
                            : 'Seleccioná un monto'}
                </button>
                <p className="text-center text-xs text-muted-foreground">
                    El saldo se acredita automáticamente al confirmar el pago.
                </p>
            </div>

            {/* Movement list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Extracto de Movimientos
                    </h2>
                    <button
                        onClick={loadWallet}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <RefreshCw className="h-3 w-3" />
                        Actualizar
                    </button>
                </div>

                {movements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card py-14 text-center">
                        <Wallet className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Sin movimientos aún</p>
                        <p className="text-xs text-muted-foreground/60">
                            Cargá saldo para empezar.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card divide-y divide-border/30">
                        {movements.map((m) => {
                            const isCredit = m.type === 'credit';
                            return (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                                    {/* Icon */}
                                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isCredit
                                        ? 'bg-emerald-500/15'
                                        : 'bg-red-500/15'
                                        }`}>
                                        {isCredit
                                            ? <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                                            : <ArrowDownLeft className="h-4 w-4 text-red-400" />
                                        }
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{m.concept}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(m.created_at)} · {formatTime(m.created_at)}
                                        </p>
                                    </div>
                                    {/* Amount */}
                                    <span className={`text-sm font-bold ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isCredit ? '+' : '-'}{formatGs(m.amount)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
