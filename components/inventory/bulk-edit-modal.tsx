'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Edit3 } from 'lucide-react';
import { bulkUpdateMotherAccounts } from '@/lib/actions/inventory';

interface BulkEditModalProps {
    open: boolean;
    onClose: () => void;
    selectedIds: string[];
    onSuccess: () => void;
}

interface FieldState<T> {
    enabled: boolean;
    value: T;
}

function FieldToggle({ label, enabled, onToggle, children }: {
    label: string;
    enabled: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className={`rounded-lg border p-3 transition-colors ${enabled ? 'border-[#86EFAC]/40 bg-[#86EFAC]/5' : 'border-border bg-card/30'}`}>
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-[#86EFAC]' : 'bg-border'}`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <Label className={`text-sm font-medium ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                </Label>
            </div>
            {enabled && <div className="mt-1">{children}</div>}
        </div>
    );
}

export function BulkEditModal({ open, onClose, selectedIds, onSuccess }: BulkEditModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [status, setStatus] = useState<FieldState<string>>({ enabled: false, value: 'active' });
    const [renewalDate, setRenewalDate] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [supplierName, setSupplierName] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [supplierPhone, setSupplierPhone] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [costUsdt, setCostUsdt] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [costGs, setCostGs] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [salePrice, setSalePrice] = useState<FieldState<string>>({ enabled: false, value: '' });
    const [notes, setNotes] = useState<FieldState<string>>({ enabled: false, value: '' });

    const anyEnabled = [status, renewalDate, supplierName, supplierPhone, costUsdt, costGs, salePrice, notes].some(f => f.enabled);

    function toggle<T>(setter: React.Dispatch<React.SetStateAction<FieldState<T>>>) {
        setter(prev => ({ ...prev, enabled: !prev.enabled }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!anyEnabled) return;

        setLoading(true);
        setError(null);

        const fields: Parameters<typeof bulkUpdateMotherAccounts>[1] = {};
        if (status.enabled) fields.status = status.value;
        if (renewalDate.enabled && renewalDate.value) fields.renewal_date = renewalDate.value;
        if (supplierName.enabled) fields.supplier_name = supplierName.value || null;
        if (supplierPhone.enabled) fields.supplier_phone = supplierPhone.value || null;
        if (costUsdt.enabled) fields.purchase_cost_usdt = parseFloat(costUsdt.value) || 0;
        if (costGs.enabled) fields.purchase_cost_gs = parseFloat(costGs.value) || 0;
        if (salePrice.enabled) fields.sale_price_gs = parseFloat(salePrice.value) || null;
        if (notes.enabled) fields.notes = notes.value || null;

        const result = await bulkUpdateMotherAccounts(selectedIds, fields);

        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }

        setLoading(false);
        onSuccess();
        handleClose();
    }

    function handleClose() {
        setError(null);
        setStatus({ enabled: false, value: 'active' });
        setRenewalDate({ enabled: false, value: '' });
        setSupplierName({ enabled: false, value: '' });
        setSupplierPhone({ enabled: false, value: '' });
        setCostUsdt({ enabled: false, value: '' });
        setCostGs({ enabled: false, value: '' });
        setSalePrice({ enabled: false, value: '' });
        setNotes({ enabled: false, value: '' });
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Edit3 className="h-5 w-5 text-[#86EFAC]" />
                        Edición Masiva
                    </DialogTitle>
                    <DialogDescription>
                        Activá los campos que querés modificar en las{' '}
                        <span className="font-semibold text-[#86EFAC]">{selectedIds.length} cuentas</span> seleccionadas.
                        Solo se actualizarán los campos activados.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-3 py-4">
                        {/* Estado */}
                        <FieldToggle label="Estado" enabled={status.enabled} onToggle={() => toggle(setStatus)}>
                            <Select value={status.value} onValueChange={(v) => setStatus(p => ({ ...p, value: v }))}>
                                <SelectTrigger className="bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">✅ Activa</SelectItem>
                                    <SelectItem value="frozen">❄️ Congelada</SelectItem>
                                    <SelectItem value="suspended">⚠️ Suspendida</SelectItem>
                                    <SelectItem value="quarantine">🔴 En Cuarentena</SelectItem>
                                    <SelectItem value="cancelled">❌ Cancelada</SelectItem>
                                </SelectContent>
                            </Select>
                        </FieldToggle>

                        {/* Fecha de renovación */}
                        <FieldToggle label="Fecha de Renovación" enabled={renewalDate.enabled} onToggle={() => toggle(setRenewalDate)}>
                            <Input
                                type="date"
                                value={renewalDate.value}
                                onChange={(e) => setRenewalDate(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        {/* Costos */}
                        <FieldToggle label="Costo (USDT)" enabled={costUsdt.enabled} onToggle={() => toggle(setCostUsdt)}>
                            <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={costUsdt.value}
                                onChange={(e) => setCostUsdt(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        <FieldToggle label="Costo (Gs.)" enabled={costGs.enabled} onToggle={() => toggle(setCostGs)}>
                            <Input
                                type="number"
                                placeholder="0"
                                value={costGs.value}
                                onChange={(e) => setCostGs(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        <FieldToggle label="Precio de Venta (Gs.)" enabled={salePrice.enabled} onToggle={() => toggle(setSalePrice)}>
                            <Input
                                type="number"
                                placeholder="0"
                                value={salePrice.value}
                                onChange={(e) => setSalePrice(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        {/* Proveedor */}
                        <FieldToggle label="Nombre de Proveedor" enabled={supplierName.enabled} onToggle={() => toggle(setSupplierName)}>
                            <Input
                                type="text"
                                placeholder="Nombre del proveedor"
                                value={supplierName.value}
                                onChange={(e) => setSupplierName(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        <FieldToggle label="Teléfono de Proveedor" enabled={supplierPhone.enabled} onToggle={() => toggle(setSupplierPhone)}>
                            <Input
                                type="text"
                                placeholder="+595..."
                                value={supplierPhone.value}
                                onChange={(e) => setSupplierPhone(p => ({ ...p, value: e.target.value }))}
                                className="bg-background"
                            />
                        </FieldToggle>

                        {/* Notas */}
                        <FieldToggle label="Observación" enabled={notes.enabled} onToggle={() => toggle(setNotes)}>
                            <Textarea
                                placeholder="Observación para todas las cuentas..."
                                value={notes.value}
                                onChange={(e) => setNotes(p => ({ ...p, value: e.target.value }))}
                                className="bg-background resize-none"
                                rows={2}
                            />
                        </FieldToggle>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    {!anyEnabled && (
                        <p className="mb-4 text-center text-sm text-muted-foreground">
                            Activá al menos un campo para poder guardar
                        </p>
                    )}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !anyEnabled}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                        >
                            {loading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                            ) : (
                                <>Guardar en {selectedIds.length} cuenta{selectedIds.length !== 1 ? 's' : ''}</>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
