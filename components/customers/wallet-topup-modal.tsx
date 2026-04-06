'use client';

import { useState } from 'react';
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Loader2, CheckCircle2 } from 'lucide-react';

interface WalletTopupModalProps {
    customerId: string;
    customerName: string;
    trigger?: React.ReactElement;
}

const QUICK_AMOUNTS = [25_000, 50_000, 100_000, 200_000];

export function WalletTopupModal({ customerId, customerName, trigger }: WalletTopupModalProps) {
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ newBalance: number } | null>(null);

    const finalAmount = selectedQuick ?? (Number(amount) || 0);

    function resetState() {
        setAmount('');
        setSelectedQuick(null);
        setNote('');
        setError(null);
        setSuccess(null);
    }

    async function handleSubmit() {
        if (finalAmount <= 0) {
            setError('Ingresá un monto válido');
            return;
        }
        if (!note.trim()) {
            setError('La nota/referencia es obligatoria');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/admin/customers/wallet/topup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: customerId,
                    amount: finalAmount,
                    note: note.trim(),
                }),
            });
            const data = await res.json();

            if (data.success) {
                setSuccess({ newBalance: data.new_balance });
            } else {
                setError(data.error || 'Error al cargar saldo');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    }

    const formatGs = (n: number) => `Gs. ${new Intl.NumberFormat('es-PY').format(n)}`;

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-300">
                        <Wallet className="h-3.5 w-3.5" />
                        Cargar
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-[#86EFAC]" />
                        Cargar Saldo
                    </DialogTitle>
                    <DialogDescription>
                        Carga manual de saldo para <strong className="text-foreground">{customerName}</strong>
                    </DialogDescription>
                </DialogHeader>

                {success ? (
                    /* ── Success state ── */
                    <div className="py-6 space-y-4">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-foreground">¡Saldo cargado!</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Se acreditaron <strong className="text-[#86EFAC]">{formatGs(finalAmount)}</strong> a {customerName}
                                </p>
                            </div>
                            <div className="rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 px-4 py-2">
                                <p className="text-xs text-muted-foreground">Nuevo saldo</p>
                                <p className="text-lg font-bold text-[#86EFAC]">{formatGs(success.newBalance)}</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={() => { setOpen(false); resetState(); }}
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            >
                                Cerrar
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* ── Form state ── */
                    <div className="space-y-4 py-2">
                        {/* Quick amount buttons */}
                        <div className="space-y-2">
                            <Label>Monto rápido</Label>
                            <div className="grid grid-cols-4 gap-2">
                                {QUICK_AMOUNTS.map((amt) => (
                                    <button
                                        key={amt}
                                        type="button"
                                        onClick={() => { setSelectedQuick(amt); setAmount(''); setError(null); }}
                                        className={`rounded-xl py-2 text-xs font-semibold transition-all ${
                                            selectedQuick === amt
                                                ? 'bg-[#86EFAC] text-black'
                                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
                                        }`}
                                    >
                                        {new Intl.NumberFormat('es-PY').format(amt / 1000)}k
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom amount */}
                        <div className="space-y-2">
                            <Label htmlFor="topup-amount">Otro monto (Gs.)</Label>
                            <Input
                                id="topup-amount"
                                type="number"
                                placeholder="Ej: 75000"
                                value={amount}
                                onChange={(e) => { setAmount(e.target.value); setSelectedQuick(null); setError(null); }}
                                min={1}
                            />
                        </div>

                        {/* Note (mandatory) */}
                        <div className="space-y-2">
                            <Label htmlFor="topup-note">Nota / Referencia *</Label>
                            <Input
                                id="topup-note"
                                type="text"
                                placeholder="Ej: Transferencia Banco Itaú"
                                value={note}
                                onChange={(e) => { setNote(e.target.value); setError(null); }}
                                maxLength={200}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Esta nota se registra en el extracto del cliente.
                            </p>
                        </div>

                        {/* Summary */}
                        {finalAmount > 0 && note.trim() && (
                            <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Monto a cargar</span>
                                    <span className="font-bold text-[#86EFAC]">{formatGs(finalAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Referencia</span>
                                    <span className="text-foreground truncate max-w-[200px]">{note}</span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <p className="text-xs text-red-400 text-center">{error}</p>
                        )}

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={loading || finalAmount <= 0}
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 gap-1.5"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Wallet className="h-4 w-4" />
                                )}
                                {loading ? 'Cargando…' : 'Confirmar Carga'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
