'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Calendar, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { extendSale } from '@/lib/actions/sales';

interface ExtendSaleModalProps {
    saleId: string;
    currentEndDate: string | null; // 'YYYY-MM-DD'
    customerName: string;
    platform: string;
    trigger?: React.ReactNode;
    onSuccess?: (newEndDate: string) => void;
    // Controlled mode (optional)
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const DAY_PRESETS = [30, 60, 90];

export function ExtendSaleModal({
    saleId,
    currentEndDate,
    customerName,
    platform,
    trigger,
    onSuccess,
    open: openProp,
    onOpenChange: onOpenChangeProp,
}: ExtendSaleModalProps) {
    const [openInternal, setOpenInternal] = useState(false);

    // Support both controlled and uncontrolled
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : openInternal;
    const setOpen = (v: boolean) => {
        if (!isControlled) setOpenInternal(v);
        onOpenChangeProp?.(v);
    };

    const [extraDays, setExtraDays] = useState<number>(30);
    const [customDays, setCustomDays] = useState('');
    const [useCustom, setUseCustom] = useState(false);
    const [amountGs, setAmountGs] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const resolvedDays = useCustom ? parseInt(customDays || '0', 10) : extraDays;

    // Calculate preview new end date
    const previewEndDate = useMemo(() => {
        if (!currentEndDate || !resolvedDays || resolvedDays <= 0) return null;
        const base = new Date(currentEndDate + 'T12:00:00');
        base.setDate(base.getDate() + resolvedDays);
        return base;
    }, [currentEndDate, resolvedDays]);

    const previewStr = previewEndDate
        ? previewEndDate.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })
        : null;

    const currentStr = currentEndDate
        ? new Date(currentEndDate + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'Sin vencimiento';

    function handleReset() {
        setExtraDays(30);
        setCustomDays('');
        setUseCustom(false);
        setAmountGs('');
        setError(null);
        setSuccess(null);
    }

    async function handleConfirm() {
        setError(null);
        const days = resolvedDays;
        const amount = parseFloat(amountGs.replace(/\./g, '').replace(',', '.'));

        if (!days || days <= 0) {
            setError('Ingresá una cantidad de días válida');
            return;
        }
        if (isNaN(amount) || amount < 0) {
            setError('Ingresá un monto válido');
            return;
        }

        setLoading(true);
        try {
            const result = await extendSale({
                saleId,
                extraDays: days,
                amountGs: amount,
            }) as any;
            if (result.error) {
                setError(result.error);
            } else {
                setSuccess(result.message || '¡Extensión realizada!');
                onSuccess?.(result.newEndDate!);
                setTimeout(() => {
                    setOpen(false);
                    handleReset();
                }, 1800);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    >
                        <TrendingUp className="h-3 w-3" />
                        Extender
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                        Extender Suscripción
                    </DialogTitle>
                    <DialogDescription>
                        {customerName} · {platform}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Current expiry */}
                    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Vencimiento actual</p>
                            <p className="text-sm font-medium text-foreground">{currentStr}</p>
                        </div>
                    </div>

                    {/* Success */}
                    {success && (
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-2 text-sm text-emerald-400">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                            {success}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2 text-sm text-red-400">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Days selector */}
                    <div className="space-y-2">
                        <Label>Días a extender</Label>
                        <div className="flex gap-2">
                            {DAY_PRESETS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => { setExtraDays(d); setUseCustom(false); }}
                                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                        !useCustom && extraDays === d
                                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                            : 'border-border text-muted-foreground hover:border-emerald-500/50 hover:text-foreground'
                                    }`}
                                >
                                    {d}d
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setUseCustom(true)}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                    useCustom
                                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                        : 'border-border text-muted-foreground hover:border-emerald-500/50 hover:text-foreground'
                                }`}
                            >
                                Otro
                            </button>
                        </div>
                        {useCustom && (
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                placeholder="Ej: 45"
                                value={customDays}
                                onChange={(e) => setCustomDays(e.target.value)}
                                className="h-9"
                                autoFocus
                            />
                        )}
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="extend-amount">Monto cobrado (Gs.)</Label>
                        <Input
                            id="extend-amount"
                            type="number"
                            min={0}
                            placeholder="Ej: 70000"
                            value={amountGs}
                            onChange={(e) => setAmountGs(e.target.value)}
                            className="h-9"
                        />
                    </div>

                    {/* Preview */}
                    {previewStr && resolvedDays > 0 && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] text-emerald-400/70 font-medium uppercase tracking-wide">Nuevo vencimiento</p>
                                <p className="text-sm font-semibold text-emerald-400">{previewStr}</p>
                            </div>
                        </div>
                    )}

                    {/* Confirm */}
                    <Button
                        type="button"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        disabled={loading || !resolvedDays || resolvedDays <= 0}
                        onClick={handleConfirm}
                    >
                        {loading ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />Extendiendo...</>
                        ) : (
                            <><TrendingUp className="h-4 w-4" />Confirmar Extensión</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
