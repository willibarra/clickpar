'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, Key, Eye, EyeOff, Copy, Check, Search, Phone, Calendar, Trash2, AlertTriangle, ShoppingCart, ExternalLink } from 'lucide-react';
import { updateSlot, deleteSlot } from '@/lib/actions/inventory';

interface SlotSale {
    id: string;
    end_date: string | null;
    is_active: boolean;
    customers: { id: string; full_name: string | null; phone: string | null } | null;
}

interface SlotDetailsModalProps {
    slot: {
        id: string;
        slot_identifier: string | null;
        status: string;
        pin_code: string | null;
        sales?: SlotSale[];
    };
    account: {
        platform: string;
        email: string;
        password: string;
    };
    accountStatus?: string;
}

const statusOptions = [
    { value: 'available', label: 'Disponible', color: 'bg-[#86EFAC] text-black' },
    { value: 'sold', label: 'Vendido', color: 'bg-[#F97316] text-white' },
    { value: 'reserved', label: 'Reservado', color: 'bg-yellow-500 text-black' },
    { value: 'warranty_claim', label: 'En Garantía', color: 'bg-red-500 text-white' },
];

/** Get the active customer from inline sales data if available */
function getActiveCustomerFromSales(sales?: SlotSale[]): { id: string; full_name: string | null; phone: string | null; end_date: string | null } | null {
    if (!sales || sales.length === 0) return null;
    const activeSale = sales.find(s => s.is_active && s.customers);
    if (!activeSale || !activeSale.customers) return null;
    return {
        id: activeSale.customers.id,
        full_name: activeSale.customers.full_name,
        phone: activeSale.customers.phone,
        end_date: activeSale.end_date,
    };
}

export function SlotDetailsModal({ slot, account, accountStatus }: SlotDetailsModalProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [status, setStatus] = useState(slot.status);
    const [pinCode, setPinCode] = useState(slot.pin_code || '');
    const [slotName, setSlotName] = useState(slot.slot_identifier || '');
    const [slotCustomer, setSlotCustomer] = useState<{ id: string; full_name: string | null; phone: string | null; end_date: string | null } | null>(null);
    const [loadingCustomer, setLoadingCustomer] = useState(false);

    // Try to get customer from inline sales data first
    const inlineCustomer = getActiveCustomerFromSales(slot.sales);

    useEffect(() => {
        if (!open) return;
        setConfirmDelete(false);

        // If we already have inline customer data, use it directly
        if (inlineCustomer) {
            setSlotCustomer(inlineCustomer);
            setLoadingCustomer(false);
            return;
        }

        // Fallback: fetch from API
        setLoadingCustomer(true);
        setSlotCustomer(null);
        fetch(`/api/search/slot-customer?slotId=${slot.id}`)
            .then(r => r.json())
            .then(d => { if (d.customer) setSlotCustomer(d.customer); })
            .catch(() => { })
            .finally(() => setLoadingCustomer(false));
    }, [open, slot.id]);

    const isQuarantine = accountStatus === 'quarantine';

    // Determine slot button color based on account status
    const getSlotButtonColor = () => {
        if (isQuarantine) {
            if (slot.status === 'sold') return 'bg-purple-500 text-white';
            if (slot.status === 'available') return 'bg-gray-500/30 text-gray-400 cursor-not-allowed';
        }
        return statusOptions.find(s => s.value === slot.status)?.color || 'bg-gray-500';
    };

    const statusColor = getSlotButtonColor();

    // Get customer name for tooltip on the slot button
    const customerNameTooltip = inlineCustomer?.full_name
        ? `${slot.slot_identifier || 'Slot'} — ${inlineCustomer.full_name}`
        : `Click para ver detalles`;

    async function handleSave() {
        setLoading(true);
        const formData = new FormData();
        formData.set('slot_identifier', slotName);
        formData.set('pin_code', pinCode);
        formData.set('status', status);

        const result = await updateSlot(slot.id, formData);

        if (!result.error) {
            setOpen(false);
        }
        setLoading(false);
    }

    async function handleDelete() {
        setDeleting(true);
        const result = await deleteSlot(slot.id);
        if (!result.error) {
            setOpen(false);
        } else {
            setDeleting(false);
            setConfirmDelete(false);
        }
    }

    async function copyToClipboard(text: string, key: string) {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }

    /** Open the quick-sale page with this slot pre-selected (in a new tab) */
    function handleSellFromSlot() {
        const url = `/?sell=1&platform=${encodeURIComponent(account.platform)}&slotId=${slot.id}`;
        window.open(url, '_blank');
        setOpen(false);
    }

    /** Navigate to the customers view and auto-open the edit modal for this customer */
    function handleGoToCustomer() {
        if (!slotCustomer) return;
        router.push(`/customers?edit=${slotCustomer.id}`);
        setOpen(false);
    }

    // Whether this slot can be deleted (no active customer)
    const canDelete = !slotCustomer && !loadingCustomer;
    // Can sell from this slot?
    const canSell = slot.status === 'available' && !isQuarantine;

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmDelete(false); }}>
            <DialogTrigger asChild>
                <button
                    className={`rounded px-2 py-1 text-xs font-medium transition-all hover:scale-105 hover:ring-2 hover:ring-white/30 ${statusColor}`}
                    title={customerNameTooltip}
                    disabled={isQuarantine && slot.status === 'available'}
                >
                    {slot.slot_identifier?.replace('Perfil ', 'P').replace('Miembro ', 'M') || 'S'}
                    {inlineCustomer?.full_name && slot.status === 'sold' && (
                        <span className="ml-1 opacity-70 text-[10px]">
                            · {inlineCustomer.full_name.split(' ')[0]}
                        </span>
                    )}
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {slot.slot_identifier || 'Slot'}
                    </DialogTitle>
                    <DialogDescription>
                        Detalles y credenciales de este perfil
                    </DialogDescription>
                </DialogHeader>

                {confirmDelete ? (
                    // Delete confirmation
                    <div className="py-4">
                        <div className="flex items-center gap-3 rounded-lg bg-red-500/10 p-4 mb-4">
                            <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-red-500 text-sm">Eliminar este slot</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Se eliminará el slot <span className="font-medium">{slot.slot_identifier}</span> permanentemente.
                                </p>
                            </div>
                        </div>
                        <DialogFooter className="flex gap-2">
                            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                                Cancelar
                            </Button>
                            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                                {deleting ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando...</>
                                ) : (
                                    <><Trash2 className="mr-2 h-4 w-4" />Sí, Eliminar</>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                        {/* ── Quarantine warning ── */}
                        {isQuarantine && (
                            <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 p-3 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-purple-400 flex-shrink-0" />
                                <span className="text-xs text-purple-300 font-medium">⚠️ Cuenta reportada — los slots libres no se pueden vender</span>
                            </div>
                        )}

                        {/* ── Cliente asignado (arriba) ── */}
                        {loadingCustomer ? (
                            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Cargando cliente...</span>
                            </div>
                        ) : slotCustomer ? (() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const endDate = slotCustomer.end_date ? new Date(slotCustomer.end_date + 'T00:00:00') : null;
                            const daysLeft = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                            const isExpired = daysLeft !== null && daysLeft < 0;
                            const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                            const borderColor = isExpired ? 'border-red-500/40 bg-red-500/5' : isExpiringSoon ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-[#86EFAC]/30 bg-[#86EFAC]/5';
                            return (
                                <div className={`rounded-lg border ${borderColor} p-3`}>
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Cliente asignado</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <User className={`h-5 w-5 flex-shrink-0 ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-yellow-400' : 'text-[#86EFAC]'}`} />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">
                                                    {slotCustomer.full_name || 'Sin nombre'}
                                                </p>
                                                {slotCustomer.phone && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        {slotCustomer.phone}
                                                    </p>
                                                )}
                                                {slotCustomer.end_date && (
                                                    <p className={`text-xs flex items-center gap-1 font-medium ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                                        <Calendar className="h-3 w-3" />
                                                        {isExpired
                                                            ? `⚠️ Vencido hace ${Math.abs(daysLeft!)}d — ${new Date(slotCustomer.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}`
                                                            : isExpiringSoon
                                                                ? `⏰ Vence en ${daysLeft}d — ${new Date(slotCustomer.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}`
                                                                : `Vence: ${new Date(slotCustomer.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}`
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1 flex-shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className={`gap-1 text-xs h-7 ${isExpired ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' : 'border-[#86EFAC]/40 text-[#86EFAC] hover:bg-[#86EFAC]/10'}`}
                                                onClick={handleGoToCustomer}
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                Ver Cliente
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })() : (
                            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">Slot sin cliente asignado</p>
                                <div className="flex gap-1">
                                    {canSell && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs text-[#86EFAC] hover:text-[#86EFAC]/80 hover:bg-[#86EFAC]/10 h-7 gap-1"
                                            onClick={handleSellFromSlot}
                                        >
                                            <ShoppingCart className="h-3 w-3" />
                                            Vender
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 gap-1"
                                        onClick={() => setConfirmDelete(true)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        Eliminar Slot
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* ── Sell button for available slot with no customer ── */}
                        {canSell && !slotCustomer && !loadingCustomer && (
                            <Button
                                type="button"
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 gap-2"
                                onClick={handleSellFromSlot}
                            >
                                <ShoppingCart className="h-4 w-4" />
                                Vender este Perfil
                                <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                            </Button>
                        )}

                        {/* ── Cuenta madre (read-only) ── */}
                        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                            <h4 className="text-sm font-medium text-muted-foreground">
                                Cuenta Madre: {account.platform}
                            </h4>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-muted-foreground">Email</Label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono">{account.email}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => copyToClipboard(account.email, 'email')}
                                        >
                                            {copied === 'email' ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Copy className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label className="text-muted-foreground">Contraseña</Label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono">
                                            {showPassword ? account.password : '••••••••'}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-3 w-3" />
                                            ) : (
                                                <Eye className="h-3 w-3" />
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => copyToClipboard(account.password, 'password')}
                                        >
                                            {copied === 'password' ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Copy className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Slot Editable Fields ── */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="slot_name">Nombre del Perfil</Label>
                                <Input
                                    id="slot_name"
                                    value={slotName}
                                    onChange={(e) => setSlotName(e.target.value)}
                                    placeholder="Perfil 1"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pin_code" className="flex items-center gap-2">
                                    <Key className="h-4 w-4" />
                                    PIN del Perfil
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="pin_code"
                                        value={pinCode}
                                        onChange={(e) => setPinCode(e.target.value)}
                                        placeholder="1234"
                                        maxLength={6}
                                        className="font-mono text-lg tracking-widest"
                                    />
                                    {pinCode && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => copyToClipboard(pinCode, 'pin')}
                                        >
                                            {copied === 'pin' ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Estado</Label>
                                <Select value={status} onValueChange={setStatus}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-2 w-2 rounded-full ${opt.color.split(' ')[0]}`} />
                                                    {opt.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                {!confirmDelete && (
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            disabled={loading}
                            onClick={handleSave}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar Cambios'
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
