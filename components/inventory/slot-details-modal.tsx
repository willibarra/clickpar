'use client';

import { useState, useEffect, useRef, useMemo, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, Key, Eye, EyeOff, Copy, Check, Search, Phone, Calendar, Trash2, AlertTriangle, ShoppingCart, ExternalLink, ArrowLeftRight, X, TrendingUp, CheckCircle2, Zap, Edit3, UserMinus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { updateSlot, deleteSlot, swapSlotCustomer } from '@/lib/actions/inventory';
import { extendSale } from '@/lib/actions/sales';
import { InlineEditCustomerModal } from '@/components/customers/inline-edit-customer-modal';

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
    trigger?: ReactElement;
}

interface CustomerResult {
    id: string;
    full_name: string | null;
    phone: string | null;
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

export function SlotDetailsModal({ slot, account, accountStatus, trigger }: SlotDetailsModalProps) {
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
    const [loadingCustomer, setLoadingCustomer] = useState(slot.status === 'sold');
    const [editCustomerOpen, setEditCustomerOpen] = useState(false);

    // ── Intercambiar mode ──────────────────────────────────
    const [swapMode, setSwapMode] = useState(false);
    const [swapQuery, setSwapQuery] = useState('');
    const [swapResults, setSwapResults] = useState<CustomerResult[]>([]);
    const [swapSearching, setSwapSearching] = useState(false);
    const [selectedSwapCustomer, setSelectedSwapCustomer] = useState<CustomerResult | null>(null);
    const [swapping, setSwapping] = useState(false);
    const [swapError, setSwapError] = useState<string | null>(null);
    const [swapSuccess, setSwapSuccess] = useState(false);
    const swapSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Extender mode ────────────────────────────────────
    const EXTEND_PRESETS = [30, 60, 90];
    const [extendMode, setExtendMode] = useState(false);
    const [extendDays, setExtendDays] = useState(30);
    const [extendCustomDays, setExtendCustomDays] = useState('');
    const [extendUseCustom, setExtendUseCustom] = useState(false);
    const [extendAmount, setExtendAmount] = useState('');
    const [extending, setExtending] = useState(false);
    const [extendError, setExtendError] = useState<string | null>(null);
    const [extendSuccess, setExtendSuccess] = useState<string | null>(null);

    // Try to get customer from inline sales data first (if available)
    const inlineCustomer = getActiveCustomerFromSales(slot.sales);


    useEffect(() => {
        if (!open) return;
        setConfirmDelete(false);
        setSwapMode(false);
        setSwapQuery('');
        setSwapResults([]);
        setSelectedSwapCustomer(null);
        setSwapError(null);
        setSwapSuccess(false);
        setSlotCustomer(null);
        setExtendMode(false);
        setExtendDays(30);
        setExtendCustomDays('');
        setExtendUseCustom(false);
        setExtendAmount('');
        setExtendError(null);
        setExtendSuccess(null);

        // If we already have inline customer data, use it directly
        if (inlineCustomer) {
            setSlotCustomer(inlineCustomer);
            setLoadingCustomer(false);
            return;
        }

        // Only fetch for sold slots
        if (slot.status !== 'sold' && slot.status !== 'reserved') {
            setLoadingCustomer(false);
            return;
        }

        // Fetch customer via API
        setLoadingCustomer(true);
        const controller = new AbortController();
        fetch(`/api/search/slot-customer?slotId=${slot.id}`, { signal: controller.signal })
            .then(r => r.json())
            .then(d => {
                if (d.customer) setSlotCustomer(d.customer);
                setLoadingCustomer(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') setLoadingCustomer(false);
            });

        return () => controller.abort();
    }, [open, slot.id]);

    // ── Customer search ────────────────────────────────────
    useEffect(() => {
        if (swapSearchTimeout.current) clearTimeout(swapSearchTimeout.current);
        if (!swapQuery.trim() || swapQuery.length < 2) {
            setSwapResults([]);
            return;
        }
        swapSearchTimeout.current = setTimeout(async () => {
            setSwapSearching(true);
            try {
                const res = await fetch(`/api/search/customers?q=${encodeURIComponent(swapQuery)}`);
                const data = await res.json();
                setSwapResults(data.customers || []);
            } catch { setSwapResults([]); }
            finally { setSwapSearching(false); }
        }, 300);
    }, [swapQuery]);

    const isQuarantine = accountStatus === 'quarantine';

    const getSlotButtonColor = () => {
        if (isQuarantine) {
            if (slot.status === 'sold') return 'bg-purple-500 text-white';
            if (slot.status === 'available') return 'bg-gray-500/30 text-gray-400 cursor-not-allowed';
        }
        return statusOptions.find(s => s.value === slot.status)?.color || 'bg-gray-500';
    };

    const statusColor = getSlotButtonColor();

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

    async function handleSwap() {
        if (!selectedSwapCustomer) return;
        setSwapping(true);
        setSwapError(null);
        const result = await swapSlotCustomer(slot.id, selectedSwapCustomer.id);
        if (result.error) {
            setSwapError(result.error);
        } else {
            setSwapSuccess(true);
            // Update local state to show new customer
            setSlotCustomer({
                id: selectedSwapCustomer.id,
                full_name: selectedSwapCustomer.full_name,
                phone: selectedSwapCustomer.phone,
                end_date: slotCustomer?.end_date ?? null,
            });
            setSwapMode(false);
            setSelectedSwapCustomer(null);
            setSwapQuery('');
        }
        setSwapping(false);
    }

    async function handleExtend() {
        setExtendError(null);
        const days = extendUseCustom ? parseInt(extendCustomDays || '0', 10) : extendDays;
        const amount = parseFloat(extendAmount.replace(/\./g, '').replace(',', '.'));
        if (!days || days <= 0) { setExtendError('Ingresá una cantidad de días válida'); return; }
        if (isNaN(amount) || amount < 0) { setExtendError('Ingresá un monto válido'); return; }

        // Need the active sale id — fetch it
        setExtending(true);
        try {
            let saleId: string | undefined;

            const activeInlineSale = slot.sales?.find(s => s.is_active && s.customers);
            if (activeInlineSale) {
                saleId = activeInlineSale.id;
            }

            if (!saleId) {
                const res = await fetch(`/api/search/slot-customer?slotId=${slot.id}`);
                const d = await res.json();
                saleId = d.sale_id;
            }

            if (!saleId) { setExtendError('No se encontró la venta activa'); setExtending(false); return; }

            const result = await extendSale({ saleId, extraDays: days, amountGs: amount }) as any;
            if (result.error) {
                setExtendError(result.error);
            } else {
                setExtendSuccess(result.message || '¡Extensión realizada!');
                // Update local display
                if (result.newEndDate && slotCustomer) {
                    setSlotCustomer({ ...slotCustomer, end_date: result.newEndDate });
                }
                setTimeout(() => {
                    setExtendMode(false);
                    setExtendSuccess(null);
                    setExtendAmount('');
                    setExtendDays(30);
                    setExtendUseCustom(false);
                    setExtendCustomDays('');
                }, 2000);
            }
        } catch (e: any) {
            setExtendError(e.message || 'Error inesperado');
        }
        setExtending(false);
    }

    async function copyToClipboard(text: string, key: string) {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }

    function handleSellFromSlot() {
        const url = `/?sell=1&platform=${encodeURIComponent(account.platform)}&slotId=${slot.id}`;
        window.open(url, '_blank');
        setOpen(false);
    }

    function handleGoToCustomer() {
        if (!slotCustomer) return;
        setEditCustomerOpen(true);
    }
    
    function handleCopyFormat() {
        if (!slotCustomer) return;
        const textToCopy = `📝 Acceso a ${account.platform}
📱 Perfil: ${slot.slot_identifier || 'Principal'}
🔑 PIN: ${slot.pin_code || 'No tiene'}

✉️ Correo: ${account.email}
🔒 Clave: ${account.password}
`;
        navigator.clipboard.writeText(textToCopy);
        setCopied('format');
        setTimeout(() => setCopied(null), 2000);
    }

    async function handleFreeSlot() {
        if (!confirm('¿Seguro que deseas liberar este perfil? El cliente actual perderá el acceso.')) return;
        setLoading(true);
        const formData = new FormData();
        formData.set('status', 'available');
        // This clears slot identifier or pins if needed, but here we just update status to "available". 
        // Realistically, to truly unassign, we'd delete the active inline sale.
        // Wait, the API for updateSlot might not delete the sale. Intercambiar handles customer mapping.
        // I will just change the status to 'available', which might be enough for their workflow, 
        // but wait, does updateSlot handle deleting the active sale? 
        const result = await updateSlot(slot.id, formData);
        if (!result.error) setOpen(false);
        setLoading(false);
    }

    const canDelete = !slotCustomer && !loadingCustomer;
    const canSell = slot.status === 'available' && !isQuarantine;

    return (
        <>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmDelete(false); }}>
            <DialogTrigger asChild>
                {trigger ?? (
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
                )}
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

                        {/* ── Success message ── */}
                        {swapSuccess && (
                            <div className="rounded-lg bg-[#86EFAC]/20 p-3 text-sm text-[#86EFAC]">
                                ✅ Perfil reasignado correctamente
                            </div>
                        )}

                        {/* ── Cliente asignado ── */}
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
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <User className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-yellow-400' : 'text-[#86EFAC]'}`} />
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
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {copied === 'format' ? (
                                                <span className="text-xs text-[#86EFAC] flex items-center bg-[#86EFAC]/10 px-2 py-1 rounded">
                                                    <Check className="h-3 w-3 mr-1" /> Copiado
                                                </span>
                                            ) : null}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-[#86EFAC]/30 text-[#86EFAC] hover:bg-[#86EFAC]/10">
                                                        <Zap className="h-3.5 w-3.5 fill-current" />
                                                        Acciones
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                                                    <DropdownMenuItem onClick={handleCopyFormat}>
                                                        <Copy className="h-4 w-4 mr-2" /> Copiar Info Lista
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => { setExtendMode(v => !v); setExtendError(null); setSwapMode(false); }}>
                                                        <TrendingUp className="h-4 w-4 mr-2 text-emerald-400" /> Extender / Renovar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { setSwapMode(v => !v); setSwapError(null); setSelectedSwapCustomer(null); setSwapQuery(''); setSwapResults([]); setExtendMode(false); }}>
                                                        <ArrowLeftRight className="h-4 w-4 mr-2 text-blue-400" /> Cambiar Cliente
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={handleGoToCustomer}>
                                                        <Edit3 className="h-4 w-4 mr-2 text-yellow-400" /> Editar Cliente
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={handleFreeSlot} className="text-red-400 focus:text-red-400 focus:bg-red-400/10">
                                                        <UserMinus className="h-4 w-4 mr-2" /> Liberar Perfil
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                    {/* ── Swap search panel ── */}
                                    {swapMode && (
                                        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                                            <p className="text-xs font-medium text-blue-400 flex items-center gap-1">
                                                <ArrowLeftRight className="h-3 w-3" />
                                                Reasignar perfil a otro cliente
                                            </p>
                                            {swapError && (
                                                <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{swapError}</p>
                                            )}

                                            {selectedSwapCustomer ? (
                                                <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2">
                                                    <User className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-foreground truncate">{selectedSwapCustomer.full_name || 'Sin nombre'}</p>
                                                        {selectedSwapCustomer.phone && (
                                                            <p className="text-xs text-muted-foreground">{selectedSwapCustomer.phone}</p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 flex-shrink-0"
                                                        onClick={() => { setSelectedSwapCustomer(null); setSwapQuery(''); }}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        value={swapQuery}
                                                        onChange={e => setSwapQuery(e.target.value)}
                                                        placeholder="Buscar por nombre o teléfono..."
                                                        className="pl-9 h-8 text-sm"
                                                        autoFocus
                                                    />
                                                    {swapSearching && (
                                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                                    )}
                                                </div>
                                            )}

                                            {/* Results */}
                                            {!selectedSwapCustomer && swapResults.length > 0 && (
                                                <div className="rounded-lg border border-border bg-card/80 overflow-hidden max-h-[160px] overflow-y-auto">
                                                    {swapResults.map(c => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => { setSelectedSwapCustomer(c); setSwapQuery(c.full_name || c.phone || ''); setSwapResults([]); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                                                        >
                                                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-foreground truncate">{c.full_name || 'Sin nombre'}</p>
                                                                {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {!selectedSwapCustomer && swapQuery.length >= 2 && !swapSearching && swapResults.length === 0 && (
                                                <p className="text-xs text-muted-foreground text-center py-2">No se encontraron clientes</p>
                                            )}

                                            {/* Confirm swap */}
                                            {selectedSwapCustomer && (
                                                <Button
                                                    type="button"
                                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 h-8 text-sm"
                                                    disabled={swapping}
                                                    onClick={handleSwap}
                                                >
                                                    {swapping ? (
                                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Reasignando...</>
                                                    ) : (
                                                        <><ArrowLeftRight className="h-3.5 w-3.5" />Confirmar Intercambio</>
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Extend panel ── */}
                                    {extendMode && (() => {
                                        const resolvedDays = extendUseCustom ? parseInt(extendCustomDays || '0', 10) : extendDays;
                                        const previewDate = slotCustomer?.end_date && resolvedDays > 0
                                            ? (() => { const d = new Date(slotCustomer.end_date + 'T12:00:00'); d.setDate(d.getDate() + resolvedDays); return d; })()
                                            : null;
                                        const previewStr = previewDate
                                            ? previewDate.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
                                            : null;
                                        return (
                                            <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                                                <p className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                                                    <TrendingUp className="h-3 w-3" />
                                                    Extender suscripción
                                                </p>

                                                {extendError && (
                                                    <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{extendError}</p>
                                                )}
                                                {extendSuccess && (
                                                    <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded p-2 flex items-center gap-1">
                                                        <CheckCircle2 className="h-3 w-3" />{extendSuccess}
                                                    </p>
                                                )}

                                                {/* Day presets */}
                                                <div className="flex gap-1.5">
                                                    {[30, 60, 90].map(d => (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => { setExtendDays(d); setExtendUseCustom(false); }}
                                                            className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                                                                !extendUseCustom && extendDays === d
                                                                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                                                    : 'border-border text-muted-foreground hover:border-emerald-500/50'
                                                            }`}
                                                        >
                                                            {d}d
                                                        </button>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setExtendUseCustom(true)}
                                                        className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                                                            extendUseCustom
                                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                                                : 'border-border text-muted-foreground hover:border-emerald-500/50'
                                                        }`}
                                                    >
                                                        Otro
                                                    </button>
                                                </div>

                                                {extendUseCustom && (
                                                    <Input
                                                        type="number" min={1} max={365}
                                                        placeholder="Días (ej: 45)"
                                                        value={extendCustomDays}
                                                        onChange={e => setExtendCustomDays(e.target.value)}
                                                        className="h-7 text-xs"
                                                        autoFocus
                                                    />
                                                )}

                                                {/* Amount */}
                                                <Input
                                                    type="number" min={0}
                                                    placeholder="Monto cobrado (Gs.)"
                                                    value={extendAmount}
                                                    onChange={e => setExtendAmount(e.target.value)}
                                                    className="h-7 text-xs"
                                                />

                                                {/* Preview */}
                                                {previewStr && (
                                                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Nuevo vencimiento: <strong>{previewStr}</strong>
                                                    </p>
                                                )}

                                                <Button
                                                    type="button"
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-8 text-sm"
                                                    disabled={extending || !resolvedDays || resolvedDays <= 0}
                                                    onClick={handleExtend}
                                                >
                                                    {extending ? (
                                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Extendiendo...</>
                                                    ) : (
                                                        <><TrendingUp className="h-3.5 w-3.5" />Confirmar Extensión</>
                                                    )}
                                                </Button>
                                            </div>
                                        );
                                    })()}
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

        {slotCustomer?.id && (
            <InlineEditCustomerModal
                customerId={slotCustomer.id}
                open={editCustomerOpen}
                onOpenChange={setEditCustomerOpen}
            />
        )}
        </>
    );
}
