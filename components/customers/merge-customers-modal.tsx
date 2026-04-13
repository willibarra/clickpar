'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Check, GitMerge, Loader2, Phone, ShieldAlert } from 'lucide-react';
import { mergeCustomers } from '@/lib/actions/customers';
import { useRouter } from 'next/navigation';
import { PlatformIcon } from '@/components/ui/platform-icon';

interface MergeCustomer {
    id: string;
    full_name: string;
    phone: string;
    services: { platform: string; sale_end_date: string }[];
    totalPurchases: number;
    totalSpent: number;
}

interface MergeCustomersModalProps {
    open: boolean;
    onClose: () => void;
    /** Todos los duplicados (incluyendo el que inició la acción) */
    duplicates: MergeCustomer[];
    /** ID inicial que se sugiere como primario (normalmente el más antiguo / con más servicios) */
    suggestedPrimaryId: string;
}

function formatGs(n: number) {
    if (!n) return '—';
    return `Gs. ${Number(n).toLocaleString('es-PY')}`;
}

export function MergeCustomersModal({ open, onClose, duplicates, suggestedPrimaryId }: MergeCustomersModalProps) {
    const router = useRouter();
    const [primaryId, setPrimaryId] = useState(suggestedPrimaryId);
    const [confirmed, setConfirmed] = useState(false);
    const [result, setResult] = useState<{ transferred: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const primary = duplicates.find(d => d.id === primaryId);
    const toMerge = duplicates.filter(d => d.id !== primaryId);

    // Total services that will be transferred
    const servicesCount = toMerge.reduce((sum, d) => sum + d.totalPurchases, 0);

    function handleClose() {
        if (isPending) return;
        setConfirmed(false);
        setResult(null);
        setError(null);
        onClose();
    }

    function handleMerge() {
        startTransition(async () => {
            setError(null);
            const res = await mergeCustomers(primaryId, toMerge.map(d => d.id));
            if ('error' in res && res.error) {
                setError(res.error as string);
                setConfirmed(false);
            } else if ('transferred' in res) {
                setResult({ transferred: res.transferred as number });
                setTimeout(() => {
                    handleClose();
                    router.refresh();
                }, 2200);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="sm:max-w-[520px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-400">
                        <GitMerge className="h-4 w-4" />
                        Fusionar Clientes Duplicados
                    </DialogTitle>
                    <DialogDescription>
                        Se detectaron <strong>{duplicates.length}</strong> registros con el mismo número. Elegí cuál mantener como principal.
                    </DialogDescription>
                </DialogHeader>

                {/* Success state */}
                {result && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-4 flex items-start gap-3">
                        <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-emerald-400">¡Fusión completada!</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {result.transferred} servicio(s) transferidos al cliente principal.
                            </p>
                        </div>
                    </div>
                )}

                {!result && (
                    <>
                        {/* Customer cards */}
                        <div className="space-y-2 py-1">
                            {duplicates.map(dup => {
                                const isPrimary = dup.id === primaryId;
                                return (
                                    <button
                                        key={dup.id}
                                        type="button"
                                        onClick={() => { setPrimaryId(dup.id); setConfirmed(false); }}
                                        disabled={isPending || !!result}
                                        className={`w-full text-left rounded-xl border p-3 transition-all ${
                                            isPrimary
                                                ? 'border-amber-400/50 bg-amber-400/5 ring-1 ring-amber-400/20'
                                                : 'border-border bg-secondary/30 hover:border-red-400/40 hover:bg-red-500/5'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                                        isPrimary
                                                            ? 'bg-amber-400/20 text-amber-400'
                                                            : 'bg-red-500/15 text-red-400'
                                                    }`}>
                                                        {isPrimary ? '✓ Principal (se mantiene)' : '✕ Se eliminará'}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-semibold text-foreground">{dup.full_name || '(sin nombre)'}</p>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                    <Phone className="h-3 w-3" />
                                                    {dup.phone}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {dup.totalPurchases} compra(s) · {formatGs(dup.totalSpent)}
                                                </p>
                                            </div>
                                            {/* Services mini-list */}
                                            {dup.services.length > 0 && (
                                                <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
                                                    {dup.services.map((svc, i) => (
                                                        <span key={i} className="flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/50">
                                                            <PlatformIcon platform={svc.platform} size={12} />
                                                            {svc.platform}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Arrow summary */}
                        {toMerge.length > 0 && (
                            <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                                <ArrowRight className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                                <span>
                                    <strong className="text-amber-400">{servicesCount}</strong> compra(s) de{' '}
                                    <strong>{toMerge.map(d => d.full_name || d.phone).join(', ')}</strong>{' '}
                                    se transferirán a <strong className="text-foreground">{primary?.full_name || primary?.phone}</strong>
                                </span>
                            </div>
                        )}

                        {/* Confirm warning */}
                        {confirmed && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2.5 flex items-start gap-2">
                                <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-300">
                                    Esta acción es <strong>irreversible</strong>. El cliente duplicado se eliminará permanentemente y sus servicios pasarán al principal.
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isPending}>
                                Cancelar
                            </Button>
                            {!confirmed ? (
                                <Button
                                    size="sm"
                                    onClick={() => setConfirmed(true)}
                                    disabled={toMerge.length === 0}
                                    className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5"
                                >
                                    <GitMerge className="h-3.5 w-3.5" />
                                    Fusionar
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={handleMerge}
                                    disabled={isPending}
                                    className="bg-red-600 hover:bg-red-500 text-white font-semibold gap-1.5"
                                >
                                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                                    Sí, fusionar y eliminar duplicado
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
