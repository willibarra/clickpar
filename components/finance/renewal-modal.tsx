'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Loader2, TrendingUp, TrendingDown, DollarSign, Calculator, AlertCircle } from 'lucide-react';
import { createRenewal } from '@/lib/actions/renewals';
import { calculateProjection } from '@/lib/utils/financial';
import { createClient } from '@/lib/supabase/client';

interface MotherAccountWithSlots {
    id: string;
    platform: string;
    email: string;
    renewal_date: string;
    purchase_cost_gs: number | null;
    max_slots: number;
    sale_slots: { id: string; status: string }[];
}

export function RenewalModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<MotherAccountWithSlots[]>([]);

    // Form state
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [purchaseCost, setPurchaseCost] = useState<string>('70000');
    const [slotPrice, setSlotPrice] = useState<string>('30000');
    const [notes, setNotes] = useState<string>('');

    const supabase = createClient();

    useEffect(() => {
        if (open) {
            // Fetch accounts pending renewal (within 15 days)
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() + 15);

            supabase
                .from('mother_accounts')
                .select(`
                    id, platform, email, renewal_date, purchase_cost_gs, max_slots,
                    sale_slots (id, status)
                `)
                .eq('status', 'active')
                .lte('renewal_date', thresholdDate.toISOString().split('T')[0])
                .order('renewal_date', { ascending: true })
                .then(({ data }) => {
                    setAccounts((data as MotherAccountWithSlots[]) || []);
                    // Pre-seleccionar cuentas próximas a vencer (dentro de 7 días)
                    const sevenDays = new Date();
                    sevenDays.setDate(sevenDays.getDate() + 7);
                    const urgent = (data || [])
                        .filter((a: MotherAccountWithSlots) => new Date(a.renewal_date) <= sevenDays)
                        .map((a: MotherAccountWithSlots) => a.id);
                    setSelectedAccounts(urgent);

                    // Usar el costo promedio de las cuentas seleccionadas como default
                    if (data && data.length > 0) {
                        const avgCost = data.reduce((sum: number, a: MotherAccountWithSlots) =>
                            sum + (a.purchase_cost_gs || 70000), 0) / data.length;
                        setPurchaseCost(Math.round(avgCost).toString());
                    }
                });
        }
    }, [open, supabase]);

    // Toggle account selection
    const toggleAccount = (accountId: string) => {
        setSelectedAccounts(prev =>
            prev.includes(accountId)
                ? prev.filter(id => id !== accountId)
                : [...prev, accountId]
        );
    };

    // Calcular proyección en tiempo real
    const projection = useMemo(() => {
        if (!purchaseCost || !slotPrice || selectedAccounts.length === 0) {
            return null;
        }

        const cost = parseFloat(purchaseCost);
        const price = parseFloat(slotPrice);

        // Usar max_slots promedio de las cuentas seleccionadas
        const selectedAccountsData = accounts.filter(a => selectedAccounts.includes(a.id));
        const totalSlots = selectedAccountsData.reduce((sum, a) => sum + a.max_slots, 0);
        const avgSlots = Math.round(totalSlots / selectedAccounts.length);

        const perAccount = calculateProjection(cost, price, avgSlots);

        return {
            perAccount,
            totalAccounts: selectedAccounts.length,
            totalCost: cost * selectedAccounts.length,
            totalRevenue: perAccount.totalRevenue * selectedAccounts.length,
            totalProfit: perAccount.profit * selectedAccounts.length,
            avgSlots,
        };
    }, [purchaseCost, slotPrice, selectedAccounts, accounts]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData();
        selectedAccounts.forEach(id => formData.append('account_ids', id));
        formData.set('purchase_cost_gs', purchaseCost);
        formData.set('expected_slot_price_gs', slotPrice);
        if (notes) formData.set('notes', notes);

        const result = await createRenewal(formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setOpen(false);
            setLoading(false);
            // Reset
            setSelectedAccounts([]);
            setNotes('');
        }
    }

    const daysUntilRenewal = (date: string) => {
        const diff = new Date(date).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Renovar Cuentas
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[650px] bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Renovar Cuentas Madre</DialogTitle>
                    <DialogDescription>
                        Selecciona las cuentas a renovar y confirma los números de este ciclo.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <div className="grid gap-5 py-4">
                        {/* Lista de cuentas */}
                        <div className="space-y-3">
                            <Label>Cuentas a Renovar</Label>
                            {accounts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No hay cuentas próximas a vencer
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {accounts.map((account) => {
                                        const days = daysUntilRenewal(account.renewal_date);
                                        const isUrgent = days <= 3;
                                        const soldSlots = account.sale_slots.filter(s => s.status === 'sold').length;

                                        return (
                                            <label
                                                key={account.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedAccounts.includes(account.id)
                                                    ? 'border-green-500/50 bg-green-500/5'
                                                    : 'border-border hover:border-muted-foreground/50'
                                                    }`}
                                            >
                                                <Checkbox
                                                    checked={selectedAccounts.includes(account.id)}
                                                    onCheckedChange={() => toggleAccount(account.id)}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{account.platform}</span>
                                                        {isUrgent && (
                                                            <Badge variant="destructive" className="text-xs">
                                                                ⚠️ Urgente
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{account.email}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <p className={days <= 7 ? 'text-orange-400' : 'text-muted-foreground'}>
                                                        {days > 0 ? `${days} días` : 'Vencida'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {soldSlots}/{account.max_slots} vendidos
                                                    </p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Inputs de costos */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="purchase_cost" className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-red-400" />
                                    Costo Real (Gs.)
                                </Label>
                                <Input
                                    id="purchase_cost"
                                    type="number"
                                    value={purchaseCost}
                                    onChange={(e) => setPurchaseCost(e.target.value)}
                                    placeholder="70000"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Lo que pagas al proveedor por cuenta
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="slot_price" className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-green-400" />
                                    Precio Venta/Slot (Gs.)
                                </Label>
                                <Input
                                    id="slot_price"
                                    type="number"
                                    value={slotPrice}
                                    onChange={(e) => setSlotPrice(e.target.value)}
                                    placeholder="30000"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Lo que cobrarás por perfil este ciclo
                                </p>
                            </div>
                        </div>

                        {/* Proyección de Ganancia */}
                        {projection && (
                            <div className="rounded-lg border border-border bg-muted/30 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Calculator className="h-5 w-5 text-blue-400" />
                                    <h4 className="font-semibold">Proyección de Ganancia</h4>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Por Cuenta ({projection.avgSlots} slots)</p>
                                        <div className="mt-1 space-y-1">
                                            <p className="flex justify-between">
                                                <span>Ingresos:</span>
                                                <span className="text-green-400">
                                                    Gs. {projection.perAccount.totalRevenue.toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                            <p className="flex justify-between">
                                                <span>Costo:</span>
                                                <span className="text-red-400">
                                                    -Gs. {parseFloat(purchaseCost).toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                            <div className="border-t border-border my-1"></div>
                                            <p className="flex justify-between font-semibold">
                                                <span>Margen:</span>
                                                <span className={projection.perAccount.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                    {projection.perAccount.profit >= 0 ? (
                                                        <TrendingUp className="inline h-4 w-4 mr-1" />
                                                    ) : (
                                                        <TrendingDown className="inline h-4 w-4 mr-1" />
                                                    )}
                                                    Gs. {projection.perAccount.profit.toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="border-l border-border pl-4">
                                        <p className="text-muted-foreground">
                                            Total ({projection.totalAccounts} cuenta{projection.totalAccounts > 1 ? 's' : ''})
                                        </p>
                                        <div className="mt-1 space-y-1">
                                            <p className="flex justify-between">
                                                <span>Inversión:</span>
                                                <span className="text-red-400">
                                                    Gs. {projection.totalCost.toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                            <p className="flex justify-between">
                                                <span>Ingresos Est.:</span>
                                                <span className="text-green-400">
                                                    Gs. {projection.totalRevenue.toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                            <div className="border-t border-border my-1"></div>
                                            <p className="flex justify-between font-semibold text-lg">
                                                <span>Ganancia:</span>
                                                <span className={projection.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                    Gs. {projection.totalProfit.toLocaleString('es-PY')}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-border">
                                    <Badge variant="outline" className="text-xs">
                                        ROI: {projection.perAccount.margin.toFixed(1)}%
                                    </Badge>
                                </div>
                            </div>
                        )}

                        {/* Notas */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (opcional)</Label>
                            <Textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ej: Promoción de verano, precio especial..."
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="bg-orange-500 text-white hover:bg-orange-600"
                            disabled={loading || selectedAccounts.length === 0}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Confirmar Renovación ({selectedAccounts.length})
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
