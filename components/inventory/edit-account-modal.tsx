'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Loader2, Trash2, AlertTriangle, RefreshCw, Link, User, Key, Copy, Check, Eye, EyeOff, ShoppingBag, Calendar, Users } from 'lucide-react';
import { updateMotherAccount, deleteMotherAccount, syncSlots, updateSlot } from '@/lib/actions/inventory';
import { createClient } from '@/lib/supabase/client';

const fallbackPlatforms = ['Netflix', 'Spotify', 'HBO Max', 'Disney+', 'Amazon Prime', 'YouTube Premium', 'Apple TV+', 'Crunchyroll', 'Paramount+', 'Star+'];

interface Platform {
    id: string;
    name: string;
    business_type?: string;
}

interface Supplier {
    id: string;
    name: string;
}

interface SlotEdit {
    id: string;
    slot_identifier: string;
    pin_code: string;
    status: string;
    customer?: { full_name: string | null; phone: string | null } | null;
}

interface Account {
    id: string;
    platform: string;
    email: string;
    password: string;
    purchase_cost_usdt?: number;
    sale_price_gs?: number | null;
    purchase_cost_gs?: number;
    renewal_date: string;
    target_billing_day?: number;
    max_slots: number;
    status?: string;
    notes?: string | null;
    sale_slots?: {
        id: string;
        slot_identifier?: string | null;
        pin_code?: string | null;
        status?: string;
    }[];
    supplier_name?: string | null;
    supplier_id?: string | null;
    supplier_phone?: string | null;
    invitation_url?: string | null;
    invite_address?: string | null;
    sale_type?: string | null;
    is_autopay?: boolean;
    instructions?: string | null;
    send_instructions?: boolean;
}

const slotStatusOptions = [
    { value: 'available', label: 'Disponible', color: 'bg-[#86EFAC]/20 text-[#86EFAC] border-[#86EFAC]/30' },
    { value: 'sold', label: 'Vendido', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'reserved', label: 'Reservado', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'warranty_claim', label: 'En Garantía', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export function EditAccountModal({ account }: { account: Account }) {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'cuenta' | 'perfiles'>('cuenta');
    const [loading, setLoading] = useState(false);
    const [savingSlots, setSavingSlots] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [precheckLoading, setPrecheckLoading] = useState(false);
    const [precheckData, setPrecheckData] = useState<{
        activeClients: { name: string; phone: string; slot: string; end_date: string }[];
        expiredClients: { name: string; phone: string; slot: string; end_date: string }[];
        soldSlotsCount: number;
        totalSlotsCount: number;
        isActive: boolean;
        isNotExpired: boolean;
        renewalDate: string | null;
        isInStore: boolean;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>(account.supplier_id || '');
    const [selectedPlatformType, setSelectedPlatformType] = useState<string>('');
    const [slotEdits, setSlotEdits] = useState<SlotEdit[]>([]);
    const [copiedPin, setCopiedPin] = useState<string | null>(null);

    // Extra fields matching AddAccountModal
    const [isAutopay, setIsAutopay] = useState(account.is_autopay || false);
    const [instructions, setInstructions] = useState(account.instructions || '');
    const [sendInstructions, setSendInstructions] = useState(account.send_instructions || false);
    const [isOwnedEmail, setIsOwnedEmail] = useState(false);
    const [emailPassword, setEmailPassword] = useState('');
    const [showEmailPass, setShowEmailPass] = useState(false);
    const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

    useEffect(() => {
        if (open) {
            fetchPlatforms();
            fetchSuppliers();
            initSlotEdits();
            setActiveTab('cuenta');
            setIsAutopay(account.is_autopay || false);
            setInstructions(account.instructions || '');
            setSendInstructions(account.send_instructions || false);
            setIsOwnedEmail(false);
            setEmailPassword('');
            setShowEmailPass(false);
            setNotifyWhatsapp(true);
        }
    }, [open]);

    function initSlotEdits() {
        const slots = account.sale_slots || [];
        const sorted = [...slots].sort((a, b) => {
            const numA = parseInt((a.slot_identifier ?? '').match(/\d+/)?.[0] ?? '0');
            const numB = parseInt((b.slot_identifier ?? '').match(/\d+/)?.[0] ?? '0');
            return numA - numB;
        });
        setSlotEdits(sorted.map(s => ({
            id: s.id,
            slot_identifier: s.slot_identifier || '',
            pin_code: s.pin_code || '',
            status: s.status || 'available',
            customer: null, // loaded lazily via API
        })));
    }

    async function fetchSlotCustomers(slots: SlotEdit[]) {
        const updated = await Promise.all(
            slots.map(async (slot) => {
                if (slot.status !== 'sold') return slot;
                try {
                    const res = await fetch(`/api/search/slot-customer?slotId=${slot.id}`);
                    const data = await res.json();
                    return { ...slot, customer: data.customer ?? null };
                } catch {
                    return slot;
                }
            })
        );
        setSlotEdits(updated);
    }

    async function fetchPlatforms() {
        const supabase = createClient();
        const { data, error } = await (supabase as any)
            .from('platforms')
            .select('id, name, business_type')
            .eq('is_active', true)
            .order('name');

        if (error || !data || data.length === 0) {
            setPlatforms(fallbackPlatforms.map((name, i) => ({ id: `fallback-${i}`, name })));
        } else {
            const typedData = data as Platform[];
            setPlatforms(typedData);
            const match = typedData.find((p: Platform) => p.name === account.platform);
            const bType = match?.business_type || '';
            setSelectedPlatformType(bType);
            setNotifyWhatsapp(bType !== 'family_account');
        }
    }

    async function fetchSuppliers() {
        const supabase = createClient();
        const { data } = await supabase.from('suppliers').select('id, name').order('name');
        const list = (data as Supplier[]) || [];
        setSuppliers(list);
        // Resolve which supplier to pre-select:
        // 1. Try to match by supplier_id (most accurate)
        // 2. Fallback: match by supplier_name (handles inconsistent data)
        const byId = account.supplier_id ? list.find(s => s.id === account.supplier_id) : null;
        if (byId) {
            setSelectedSupplierId(byId.id);
        } else if (account.supplier_name) {
            const byName = list.find(s => s.name === account.supplier_name);
            setSelectedSupplierId(byName ? byName.id : '');
        } else {
            setSelectedSupplierId('');
        }
    }

    const isFamilyAccount = selectedPlatformType === 'family_account';

    const currentSlots = account.sale_slots?.length || 0;
    const needsSync = currentSlots < account.max_slots;

    async function handleSaveSlots() {
        setSavingSlots(true);
        setError(null);
        let hasError = false;
        for (const slot of slotEdits) {
            const fd = new FormData();
            fd.set('slot_identifier', slot.slot_identifier);
            fd.set('pin_code', slot.pin_code);
            fd.set('status', slot.status);
            const result = await updateSlot(slot.id, fd);
            if (result.error) { hasError = true; break; }
        }
        if (!hasError) {
            setSuccessMessage('✅ Perfiles guardados correctamente');
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError('Error al guardar algunos perfiles. Intenta de nuevo.');
        }
        setSavingSlots(false);
    }

    function updateSlotEdit(id: string, field: keyof Omit<SlotEdit, 'id' | 'customer'>, value: string) {
        setSlotEdits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    }

    async function copyPin(pin: string, id: string) {
        await navigator.clipboard.writeText(pin);
        setCopiedPin(id);
        setTimeout(() => setCopiedPin(null), 1500);
    }

    async function handleSync() {
        setSyncing(true);
        setError(null);
        setSuccessMessage(null);
        const result = await syncSlots(account.id);

        if (result.error) {
            setError(result.error);
        } else {
            setSuccessMessage(`Se crearon ${result.created || 0} slots nuevos`);
        }
        setSyncing(false);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validar proveedor obligatorio
        if (!selectedSupplierId) {
            setError('Debes seleccionar un proveedor.');
            setLoading(false);
            return;
        }

        const formData = new FormData(e.currentTarget);
        // Inject state-managed fields not bound to named inputs
        formData.set('instructions', instructions || '');
        formData.set('send_instructions', sendInstructions ? 'true' : 'false');
        formData.set('notify_whatsapp', notifyWhatsapp ? 'true' : 'false');
        // is_autopay is a named checkbox — override with state for reliability
        formData.set('is_autopay', isAutopay ? 'true' : 'false');
        if (isOwnedEmail) {
            formData.set('is_owned_email', 'true');
            formData.set('email_password', emailPassword || '');
        }

        const result = await updateMotherAccount(account.id, formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setLoading(false);
            if ((result as any).notified) {
                setSuccessMessage('✅ Guardado. Se enviará la actualización de credenciales a los clientes activos por WhatsApp.');
            } else {
                setOpen(false);
            }
        }
    }

    async function handlePrecheckDelete() {
        setPrecheckLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/precheck-delete?id=${account.id}`);
            const data = await res.json();
            if (data.error) {
                setError(data.error);
                setPrecheckLoading(false);
                return;
            }
            setPrecheckData(data);
            setConfirmDelete(true);
        } catch (e: any) {
            setError(e.message || 'Error al verificar la cuenta');
        }
        setPrecheckLoading(false);
    }

    async function handleDelete() {
        setDeleting(true);
        setError(null);
        const result = await deleteMotherAccount(account.id);

        if (result.error) {
            setError(result.error);
            setDeleting(false);
            setConfirmDelete(false);
        } else {
            setOpen(false);
            setDeleting(false);
            setConfirmDelete(false);
            setPrecheckData(null);
        }
    }

    function handleOpenChange(newOpen: boolean) {
        setOpen(newOpen);
        if (!newOpen) {
            setConfirmDelete(false);
            setError(null);
            setPrecheckData(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {confirmDelete ? 'Confirmar Eliminación' : 'Editar Cuenta Madre'}
                    </DialogTitle>
                    <DialogDescription>
                        {confirmDelete
                            ? `¿Estás seguro de eliminar la cuenta ${account.email}?`
                            : `Modifica los datos de la cuenta ${account.platform}`
                        }
                    </DialogDescription>
                </DialogHeader>

                {/* Tabs — only shown when not in confirm-delete mode */}
                {!confirmDelete && (
                    <div className="flex border-b border-border mb-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('cuenta')}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'cuenta'
                                    ? 'border-b-2 border-[#86EFAC] text-[#86EFAC]'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Cuenta Madre
                        </button>
                        <button
                            type="button"
                            onClick={() => { setActiveTab('perfiles'); fetchSlotCustomers(slotEdits); }}
                            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                activeTab === 'perfiles'
                                    ? 'border-b-2 border-[#86EFAC] text-[#86EFAC]'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <User className="h-3.5 w-3.5" />
                            {isFamilyAccount ? 'Clientes Finales' : 'Perfiles'}
                            <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                                {slotEdits.length}
                            </span>
                        </button>
                    </div>
                )}

                {confirmDelete ? (
                    // Confirmation View with precheck warnings
                    <div className="py-4 space-y-4">
                        {/* Header warning */}
                        <div className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                            <AlertTriangle className="h-7 w-7 text-red-500 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-red-500">¿Eliminar esta cuenta?</p>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    La cuenta irá a la papelera. Revisa las advertencias:
                                </p>
                            </div>
                        </div>

                        {/* Warnings list */}
                        {precheckData && (
                            <div className="space-y-2.5">
                                {/* Active clients warning — BLOCKS deletion */}
                                {precheckData.activeClients.length > 0 && (
                                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Users className="h-4 w-4 text-red-500" />
                                            <span className="text-sm font-semibold text-red-500">
                                                🚫 {precheckData.activeClients.length} cliente{precheckData.activeClients.length > 1 ? 's' : ''} con suscripción vigente
                                            </span>
                                        </div>
                                        <div className="space-y-1.5 ml-6">
                                            {precheckData.activeClients.map((c, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                    <User className="h-3 w-3 text-red-400 flex-shrink-0" />
                                                    <span className="text-foreground font-medium">{c.name}</span>
                                                    {c.phone && <span className="text-muted-foreground">({c.phone})</span>}
                                                    <span className="text-muted-foreground">— {c.slot}</span>
                                                    {c.end_date && (
                                                        <span className="text-muted-foreground ml-auto">
                                                            Vence: {new Date(c.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-red-400/70 mt-2 ml-6">
                                            Mové o cancelá estos clientes antes de eliminar la cuenta.
                                        </p>
                                    </div>
                                )}

                                {/* Expired clients info — will be auto-deactivated */}
                                {precheckData.expiredClients.length > 0 && (
                                    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Users className="h-4 w-4 text-orange-500" />
                                            <span className="text-sm font-semibold text-orange-500">
                                                ⚠️ {precheckData.expiredClients.length} cliente{precheckData.expiredClients.length > 1 ? 's' : ''} vencido{precheckData.expiredClients.length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="space-y-1.5 ml-6">
                                            {precheckData.expiredClients.map((c, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                    <User className="h-3 w-3 text-orange-400 flex-shrink-0" />
                                                    <span className="text-foreground font-medium">{c.name}</span>
                                                    {c.phone && <span className="text-muted-foreground">({c.phone})</span>}
                                                    <span className="text-muted-foreground">— {c.slot}</span>
                                                    {c.end_date && (
                                                        <span className="text-red-400/80 ml-auto">
                                                            Venció: {new Date(c.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-orange-400/70 mt-2 ml-6">
                                            Se desactivarán automáticamente al eliminar.
                                        </p>
                                    </div>
                                )}

                                {/* Account still active / not expired */}
                                {precheckData.isNotExpired && (
                                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-yellow-500" />
                                            <span className="text-sm font-medium text-yellow-500">
                                                ⏰ Cuenta aún vigente
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                            La renovación vence el{' '}
                                            <span className="text-foreground font-medium">
                                                {precheckData.renewalDate
                                                    ? new Date(precheckData.renewalDate + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })
                                                    : '—'}
                                            </span>. Todavía tiene tiempo de uso pagado.
                                        </p>
                                    </div>
                                )}

                                {/* Listed in store */}
                                {precheckData.isInStore && (
                                    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                                        <div className="flex items-center gap-2">
                                            <ShoppingBag className="h-4 w-4 text-purple-500" />
                                            <span className="text-sm font-medium text-purple-500">
                                                🛒 Visible en la Tienda
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                            Esta cuenta está publicada en el catálogo. Al eliminarla, dejará de aparecer para los clientes.
                                        </p>
                                    </div>
                                )}

                                {/* No warnings — safe to delete */}
                                {precheckData.activeClients.length === 0 && precheckData.expiredClients.length === 0 && !precheckData.isNotExpired && !precheckData.isInStore && (
                                    <div className="rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/5 p-3">
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-[#86EFAC]" />
                                            <span className="text-sm font-medium text-[#86EFAC]">Sin advertencias</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                            No tiene clientes activos, está vencida y no aparece en la tienda.
                                        </p>
                                    </div>
                                )}

                                {/* Summary */}
                                <div className="rounded-lg bg-[#111] border border-border/30 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">
                                        Slots: <span className="text-foreground font-medium">{precheckData.soldSlotsCount} vendidos</span> / {precheckData.totalSlotsCount} total
                                        {precheckData.isActive && <span className="ml-2">· Estado: <span className="text-[#86EFAC] font-medium">Activa</span></span>}
                                    </p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <DialogFooter className="flex gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setConfirmDelete(false); setPrecheckData(null); }}
                                disabled={deleting}
                            >
                                Cancelar
                            </Button>
                            {precheckData && precheckData.activeClients.length > 0 ? (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled
                                    className="opacity-50 cursor-not-allowed"
                                >
                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                    Mové los clientes primero
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                >
                                    {deleting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Eliminando...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Sí, Eliminar
                                        </>
                                    )}
                                </Button>
                            )}
                        </DialogFooter>
                    </div>
                ) : activeTab === 'perfiles' ? (
                    // ── Perfiles / Clientes Finales Tab ────────────────────────
                    <div className="space-y-3 py-2">
                        {error && (
                            <div className="mb-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
                        )}
                        {successMessage && (
                            <div className="mb-2 rounded-lg bg-[#86EFAC]/20 p-3 text-sm text-[#86EFAC]">{successMessage}</div>
                        )}

                        {isFamilyAccount && (
                            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                                <div className="h-2 w-2 rounded-full bg-blue-400" />
                                <p className="text-xs text-blue-400 font-medium">
                                    Correo y contraseña que recibe cada cliente final por WhatsApp
                                </p>
                            </div>
                        )}

                        {slotEdits.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                Esta cuenta no tiene {isFamilyAccount ? 'clientes finales' : 'perfiles'} registrados.
                            </div>
                        ) : (
                            slotEdits.map((slot, idx) => {
                                const isSold = slot.status === 'sold';
                                const statusOpt = slotStatusOptions.find(o => o.value === slot.status);
                                return (
                                    <div
                                        key={slot.id}
                                        className={`rounded-lg border p-3 space-y-3 transition-colors ${
                                            isSold
                                                ? 'border-orange-500/20 bg-orange-500/5'
                                                : 'border-border bg-card/50'
                                        }`}
                                    >
                                        {/* Header row */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                #{idx + 1}
                                            </span>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusOpt?.color || 'bg-secondary text-muted-foreground border-border'}`}>
                                                {statusOpt?.label || slot.status}
                                            </span>
                                        </div>

                                        {/* Cliente asignado (si hay) */}
                                        {isSold && slot.customer && (
                                            <div className="flex items-center gap-2 rounded bg-orange-500/10 px-2.5 py-1.5">
                                                <User className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                                                <span className="text-xs text-orange-300 font-medium">
                                                    {slot.customer.full_name || 'Cliente sin nombre'}
                                                </span>
                                                {slot.customer.phone && (
                                                    <span className="text-xs text-muted-foreground ml-auto">{slot.customer.phone}</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Nombre / Correo Final + Status */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">
                                                    {isFamilyAccount ? 'Correo cliente final' : 'Nombre'}
                                                </Label>
                                                <Input
                                                    value={slot.slot_identifier}
                                                    onChange={e => updateSlotEdit(slot.id, 'slot_identifier', e.target.value)}
                                                    placeholder={isFamilyAccount ? 'correo@gmail.com' : 'Perfil 1'}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Estado</Label>
                                                <Select
                                                    value={slot.status}
                                                    onValueChange={v => updateSlotEdit(slot.id, 'status', v)}
                                                >
                                                    <SelectTrigger className="h-8 text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {slotStatusOptions.map(o => (
                                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* PIN / Contraseña Final */}
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Key className="h-3 w-3" />
                                                {isFamilyAccount ? 'Contraseña cliente final' : 'PIN'}
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={slot.pin_code}
                                                    onChange={e => updateSlotEdit(slot.id, 'pin_code', e.target.value)}
                                                    placeholder={isFamilyAccount ? 'Contraseña final' : 'Sin PIN'}
                                                    maxLength={isFamilyAccount ? undefined : 6}
                                                    className={`h-8 text-sm ${isFamilyAccount ? '' : 'font-mono tracking-widest'}`}
                                                />
                                                {slot.pin_code && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8 flex-shrink-0"
                                                        onClick={() => copyPin(slot.pin_code, slot.id)}
                                                        title={isFamilyAccount ? 'Copiar contraseña' : 'Copiar PIN'}
                                                    >
                                                        {copiedPin === slot.id ? (
                                                            <Check className="h-3.5 w-3.5 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                disabled={savingSlots || slotEdits.length === 0}
                                onClick={handleSaveSlots}
                            >
                                {savingSlots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {isFamilyAccount ? 'Guardar Clientes Finales' : 'Guardar Perfiles'}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    // ── Cuenta Madre Tab (Edit Form) ─────────────
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}
                        {successMessage && (
                            <div className="mb-4 rounded-lg bg-[#86EFAC]/20 p-3 text-sm text-[#86EFAC]">
                                {successMessage}
                            </div>
                        )}

                        {/* Sync Alert */}
                        {needsSync && (
                            <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-yellow-500">Slots faltantes</p>
                                        <p className="text-xs text-muted-foreground">
                                            Hay {currentSlots}/{account.max_slots} slots. Faltan {account.max_slots - currentSlots} por crear.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                                    >
                                        {syncing ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                        )}
                                        Sincronizar
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="platform">Plataforma</Label>
                                    <Select
                                        name="platform"
                                        defaultValue={account.platform}
                                        onValueChange={(val) => {
                                            const p = platforms.find(pl => pl.name === val);
                                            const bType = p?.business_type || '';
                                            setSelectedPlatformType(bType);
                                            setNotifyWhatsapp(bType !== 'family_account');
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {platforms.map((p) => (
                                                <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="status">Estado</Label>
                                    <Select name="status" defaultValue={account.status}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Activa</SelectItem>
                                            <SelectItem value="frozen">❄️ Congelada</SelectItem>
                                            <SelectItem value="suspended">Suspendida</SelectItem>
                                            <SelectItem value="cancelled">Cancelada</SelectItem>
                                            <SelectItem value="possible_autopay">💳 Posible Autopay</SelectItem>
                                            <SelectItem value="no_renovar">🚫 No Renovar</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="text"
                                    defaultValue={account.email}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="text"
                                    defaultValue={account.password}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="purchase_cost_usdt">Costo (USDT)</Label>
                                    <Input
                                        id="purchase_cost_usdt"
                                        name="purchase_cost_usdt"
                                        type="number"
                                        step="0.01"
                                        defaultValue={account.purchase_cost_usdt}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="purchase_cost_gs">Costo (Gs.)</Label>
                                    <Input
                                        id="purchase_cost_gs"
                                        name="purchase_cost_gs"
                                        type="number"
                                        defaultValue={account.purchase_cost_gs}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sale_price_gs">Precio Venta (Gs.)</Label>
                                    <Input
                                        id="sale_price_gs"
                                        name="sale_price_gs"
                                        type="number"
                                        defaultValue={account.sale_price_gs ?? ''}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="renewal_date">Renovación</Label>
                                    <Input
                                        id="renewal_date"
                                        name="renewal_date"
                                        type="date"
                                        defaultValue={account.renewal_date}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="target_billing_day">Día Fact.</Label>
                                    <Input
                                        id="target_billing_day"
                                        name="target_billing_day"
                                        type="number"
                                        min={1}
                                        max={28}
                                        defaultValue={account.target_billing_day}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="max_slots">Máx Slots</Label>
                                    <Input
                                        id="max_slots"
                                        name="max_slots"
                                        type="number"
                                        min={1}
                                        max={10}
                                        defaultValue={account.max_slots}
                                    />
                                </div>
                            </div>

                            {/* Proveedor */}
                            <div className="border-t border-border/50 pt-4">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Proveedor <span className="text-red-500">*</span></p>
                                {/* Hidden inputs so formData picks them up */}
                                <input type="hidden" name="supplier_id" value={selectedSupplierId} />
                                <input type="hidden" name="supplier_name" value={suppliers.find(s => s.id === selectedSupplierId)?.name || ''} />
                                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar proveedor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Autopay */}
                            <div className="flex items-center gap-2 px-1">
                                <input
                                    type="checkbox"
                                    id="is_autopay"
                                    name="is_autopay"
                                    checked={isAutopay}
                                    onChange={(e) => setIsAutopay(e.target.checked)}
                                    className="h-4 w-4 rounded border-border accent-[#86EFAC]"
                                />
                                <Label htmlFor="is_autopay" className="cursor-pointer text-sm font-normal">
                                    🔄 Cuenta autopagable <span className="text-muted-foreground">(sin fecha fija, revisión cada 15 días)</span>
                                </Label>
                            </div>

                            {/* Correo Propio */}
                            <div className="rounded-lg border border-border/40 bg-[#0d0d0d] p-3 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="is_owned_email_edit"
                                        checked={isOwnedEmail}
                                        onCheckedChange={(v) => setIsOwnedEmail(v === true)}
                                    />
                                    <label htmlFor="is_owned_email_edit" className="text-sm font-medium text-foreground cursor-pointer select-none">
                                        Guardar como Correo Propio (Activo)
                                    </label>
                                </div>
                                {isOwnedEmail && (
                                    <div className="space-y-1.5 pl-6">
                                        <Label className="text-xs text-muted-foreground">Contraseña del Correo</Label>
                                        <div className="relative">
                                            <Input
                                                type={showEmailPass ? 'text' : 'password'}
                                                value={emailPassword}
                                                onChange={e => setEmailPassword(e.target.value)}
                                                placeholder="Contraseña del email (Gmail/Hotmail)"
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowEmailPass(!showEmailPass)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                                            >
                                                {showEmailPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/60">Se guardará en tu inventario de Correos Propios</p>
                                    </div>
                                )}
                            </div>

                            {/* Invitación Familia */}
                            {isFamilyAccount && (
                                <div className="rounded-lg border border-[#86EFAC]/20 bg-[#86EFAC]/5 p-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Link className="h-4 w-4 text-[#86EFAC]" />
                                        <p className="text-xs font-medium text-[#86EFAC]">Datos de Invitación Familia</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="invitation_url">URL de Invitación</Label>
                                        <Input
                                            id="invitation_url"
                                            name="invitation_url"
                                            type="text"
                                            defaultValue={account.invitation_url || ''}
                                            placeholder="https://..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="invite_address">Dirección de Invitación</Label>
                                        <Input
                                            id="invite_address"
                                            name="invite_address"
                                            type="text"
                                            defaultValue={account.invite_address || ''}
                                            placeholder="Ciudad, País..."
                                        />
                                    </div>
                                </div>
                            )}

                            {/* OBS / Instrucciones */}
                            <div className="space-y-2 border-t border-border/50 pt-4">
                                <Label htmlFor="instructions_edit" className="flex items-center gap-2">
                                    📝 OBS / Instrucciones
                                    <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                                </Label>
                                <textarea
                                    id="instructions_edit"
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    placeholder="Ej: Para acceder ir a configuración → Perfil → Ingresar código de pantalla..."
                                    rows={3}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/50 placeholder:text-muted-foreground"
                                />
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="send_instructions_edit"
                                        checked={sendInstructions}
                                        onChange={(e) => setSendInstructions(e.target.checked)}
                                        className="h-4 w-4 rounded border-border accent-[#86EFAC]"
                                    />
                                    <Label htmlFor="send_instructions_edit" className="cursor-pointer text-sm font-normal">
                                        Enviar instrucciones automáticamente al vender
                                    </Label>
                                </div>
                            </div>

                            {/* Observación */}
                            <div className="space-y-2">
                                <Label htmlFor="notes">Observación</Label>
                                <Textarea
                                    id="notes"
                                    name="notes"
                                    defaultValue={account.notes || ''}
                                    placeholder="Ej: Cuenta con problema momentáneo, revisar..."
                                    className="resize-none"
                                    rows={3}
                                />
                            </div>

                            {/* Notificación WhatsApp */}
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                                <Checkbox
                                    id="notify_whatsapp_edit"
                                    checked={notifyWhatsapp}
                                    onCheckedChange={(v) => setNotifyWhatsapp(v === true)}
                                />
                                <Label htmlFor="notify_whatsapp_edit" className="cursor-pointer text-sm font-medium text-foreground">
                                    Notificar cambio de credenciales por WhatsApp a clientes activos
                                </Label>
                            </div>
                        </div>

                        <DialogFooter className="flex justify-between">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handlePrecheckDelete}
                                disabled={loading || precheckLoading}
                            >
                                {precheckLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                Eliminar
                            </Button>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Guardar
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
