'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Copy, Check, TrendingUp, ArrowLeftRight, ChevronDown, Loader2, Repeat, Ban, Snowflake, AlertTriangle, Pencil, BellRing } from 'lucide-react';
import { extendSale, cancelSubscription, enqueueManualReminder, logReminderCopied } from '@/lib/actions/sales';
import { swapSlotCustomer, freezeMotherAccount, updateSlot } from '@/lib/actions/inventory';
import { SwapServiceModal } from '@/components/dashboard/swap-service-modal';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { InlineEditCustomerModal } from '@/components/customers/inline-edit-customer-modal';

interface SlotActionsDropdownProps {
    slot: {
        id: string;
        slot_identifier: string | null;
        pin_code: string | null;
        status: string;
    };
    account: {
        platform: string;
        email: string;
        password: string | null;
        sale_type?: string | null;
    };
    customer: {
        id: string;
        full_name: string | null;
        phone: string | null;
    } | null;
    activeSale: {
        id?: string;
        end_date: string | null;
        start_date?: string | null;
        amount?: number;
        reminders_sent?: number;
    } | null;
    accountEmail?: string;
    motherAccountId?: string;
}

interface CustomerResult {
    id: string;
    full_name: string | null;
    phone: string | null;
}

type ModalMode = null | 'extend' | 'swap' | 'swap_account' | 'suspend' | 'freeze' | 'edit_customer' | 'edit_slot';

export function SlotActionsDropdown({ slot, account, customer, activeSale, accountEmail, motherAccountId }: SlotActionsDropdownProps) {
    const router = useRouter();
    const [copied, setCopied] = useState(false);
    const [copiedReminder, setCopiedReminder] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [sendingReminder, setSendingReminder] = useState(false);

    // ── Copy reminder message ───────────────────────────────────────
    async function handleCopyReminder() {
        const name = customer?.full_name || 'Cliente';
        const platform = account.platform || 'Servicio';
        const price = (activeSale?.amount || 0).toLocaleString();
        const text = `⚠️ *Recordatorio de Pago*\n\nHola ${name}, te recordamos que el pago de tu servicio de *${platform}* se encuentra pendiente.\n\n💰 Renovación: Gs. ${price}\nEscribinos para renovar 📲`;
        navigator.clipboard.writeText(text);
        setCopiedReminder(true);
        setTimeout(() => setCopiedReminder(false), 2000);
        // Log to DB so 📋 icon appears in Vencimiento column
        if (activeSale?.id) {
            await logReminderCopied(activeSale.id);
            router.refresh();
        }
    }

    // ── Copy service data ───────────────────────────────────────────
    function handleCopy() {
        const platformName = (account.platform || '').toLowerCase();
        const saleType = (account.sale_type || '').toLowerCase();
        
        // Cuentas tipo Familia (no mostrar cuenta madre)
        const isFamily = saleType === 'family' || 
                         saleType === 'familia' || 
                         saleType === 'familiar' || 
                         platformName.includes('spotify') || 
                         platformName.includes('youtube') || 
                         platformName.includes('canva');
                         
        console.log('Copying service:', { platformName, saleType, isFamily, account });
        
        let text = '';
        if (isFamily) {
            text = `📝 Plataforma: ${account.platform}
📱 Perfil: ${slot.slot_identifier || 'Principal'}
🔑 PIN: ${slot.pin_code || 'Sin PIN'}
${customer?.phone || customer?.full_name ? `\n👤 Cliente: ${customer.phone || customer.full_name}` : ''}
${activeSale?.end_date ? `📅 Vence: ${new Date(activeSale.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}`.trim();
        } else {
            text = `📝 Plataforma: ${account.platform}
✉️ Correo: ${account.email}
🔒 Clave: ${account.password || 'Sin clave'}
📱 Perfil: ${slot.slot_identifier || 'Principal'}
🔑 PIN: ${slot.pin_code || 'Sin PIN'}
${customer?.phone || customer?.full_name ? `\n👤 Cliente: ${customer.phone || customer.full_name}` : ''}
${activeSale?.end_date ? `📅 Vence: ${new Date(activeSale.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}`.trim();
        }
        
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // ── Edit customer link ──────────────────────────────────────────
    function getEditLink() {
        if (!customer?.id) return null;
        const params = new URLSearchParams();
        if (customer.phone) params.set('q', customer.phone);
        params.set('edit', customer.id);
        return `/customers?${params.toString()}`;
    }

    const hasSoldCustomer = !!customer?.id && slot.status === 'sold';
    const isExpired = activeSale?.end_date ? new Date(activeSale.end_date + 'T12:00:00') <= new Date() : false;

    async function handleSendReminder() {
        if (!activeSale?.id) return;
        setSendingReminder(true);
        try {
            const result = await enqueueManualReminder(activeSale.id);
            if (result.error) alert(result.error);
        } catch (e: any) {
            alert(e.message);
        }
        setSendingReminder(false);
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium bg-[#86EFAC]/10 text-[#86EFAC] border border-[#86EFAC]/20 hover:bg-[#86EFAC]/20 transition-colors">
                        Acciones
                        <ChevronDown className="h-3 w-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-[#111] border-border text-sm">
                    {/* Editar cliente */}
                    {hasSoldCustomer ? (
                        <DropdownMenuItem onClick={() => setModalMode('edit_customer')} className="flex items-center gap-2 cursor-pointer text-sky-400 focus:text-sky-300 focus:bg-sky-500/10">
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar cliente
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem disabled className="flex items-center gap-2 text-muted-foreground/40">
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar cliente
                        </DropdownMenuItem>
                    )}

                    {/* Copiar */}
                    <DropdownMenuItem onClick={handleCopy} className="flex items-center gap-2 cursor-pointer">
                        {copied
                            ? <><Check className="h-3.5 w-3.5 text-[#86EFAC]" /><span className="text-[#86EFAC]">¡Copiado!</span></>
                            : <><Copy className="h-3.5 w-3.5" />Copiar servicio</>
                        }
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Editar pantalla/perfil */}
                    <DropdownMenuItem onClick={() => setModalMode('edit_slot')} className="flex items-center gap-2 cursor-pointer">
                        <Pencil className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-blue-400">Editar perfil/pantalla</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    {/* Extender */}
                    <DropdownMenuItem
                        onClick={() => hasSoldCustomer && setModalMode('extend')}
                        disabled={!hasSoldCustomer}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        <span className={hasSoldCustomer ? 'text-emerald-400' : ''}>Extender</span>
                    </DropdownMenuItem>

                    {/* Cambiar cuenta */}
                    <DropdownMenuItem
                        onClick={() => hasSoldCustomer && setModalMode('swap_account')}
                        disabled={!hasSoldCustomer}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <Repeat className="h-3.5 w-3.5 text-purple-400" />
                        <span className={hasSoldCustomer ? 'text-purple-400' : ''}>Cambiar cuenta</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Enviar Recordatorio */}
                    {hasSoldCustomer && isExpired && (
                        <DropdownMenuItem
                            onClick={(e) => { e.preventDefault(); handleSendReminder(); }}
                            disabled={sendingReminder}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            {sendingReminder ? <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" /> : <BellRing className="h-3.5 w-3.5 text-yellow-500" />}
                            <span className="text-yellow-500">
                                {(activeSale?.reminders_sent || 0) > 0 ? 'Reenviar recordatorio' : 'Enviar recordatorio'}
                            </span>
                        </DropdownMenuItem>
                    )}

                    {/* Copiar Recordatorio */}
                    {hasSoldCustomer && isExpired && (
                        <DropdownMenuItem
                            onClick={(e) => { e.preventDefault(); handleCopyReminder(); }}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            {copiedReminder
                                ? <><Check className="h-3.5 w-3.5 text-[#86EFAC]" /><span className="text-[#86EFAC]">¡Recordatorio copiado!</span></>
                                : <><Copy className="h-3.5 w-3.5 text-yellow-500" /><span className="text-yellow-500">Copiar recordatorio</span></>
                            }
                        </DropdownMenuItem>
                    )}

                    {/* Suspender */}
                    <DropdownMenuItem
                        onClick={() => hasSoldCustomer && setModalMode('suspend')}
                        disabled={!hasSoldCustomer}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <Ban className="h-3.5 w-3.5 text-red-400" />
                        <span className={hasSoldCustomer ? 'text-red-400' : ''}>Suspender cliente</span>
                    </DropdownMenuItem>

                    {/* Congelar cuenta */}
                    <DropdownMenuItem
                        onClick={() => motherAccountId && setModalMode('freeze')}
                        disabled={!motherAccountId}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <Snowflake className="h-3.5 w-3.5 text-blue-400" />
                        <span className={motherAccountId ? 'text-blue-400' : ''}>Congelar cuenta</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Extend modal */}
            <ExtendModal
                open={modalMode === 'extend'}
                onClose={() => setModalMode(null)}
                slotId={slot.id}
                saleId={activeSale?.id}
                slotName={slot.slot_identifier}
                platform={account.platform}
                customerName={customer?.full_name}
                currentEndDate={activeSale?.end_date}
            />

            {/* Swap modal — cambia el CLIENTE del slot */}
            <SwapModal
                open={modalMode === 'swap'}
                onClose={() => setModalMode(null)}
                slotId={slot.id}
                slotName={slot.slot_identifier}
                platform={account.platform}
                currentCustomer={customer}
            />

            {/* Swap account modal — mueve al cliente a otra CUENTA/slot disponible */}
            {modalMode === 'swap_account' && (
                <SwapServiceModal
                    isOpen={true}
                    onClose={() => setModalMode(null)}
                    service={{
                        sale_id: activeSale?.id || '',
                        slot_id: slot.id,
                        platform: account.platform,
                        slot: slot.slot_identifier || '',
                        account_email: accountEmail || account.email,
                        amount: activeSale?.amount || 0,
                    }}
                    customerId={customer?.id || ''}
                    customerName={customer?.full_name || '(sin nombre)'}
                    onSwapped={(newAccountEmail) => {
                        setModalMode(null);
                        if (newAccountEmail) {
                            router.push(`/inventory?q=${encodeURIComponent(newAccountEmail)}`);
                        } else {
                            router.refresh();
                        }
                    }}
                />
            )}

            {/* Suspend modal — cancela la venta y libera el slot */}
            <SuspendModal
                open={modalMode === 'suspend'}
                onClose={() => setModalMode(null)}
                slotId={slot.id}
                saleId={activeSale?.id}
                slotName={slot.slot_identifier}
                platform={account.platform}
                customerName={customer?.full_name}
                onSuspended={() => { setModalMode(null); router.refresh(); }}
            />

            {/* Freeze modal — congela toda la cuenta madre */}
            <FreezeModal
                open={modalMode === 'freeze'}
                onClose={() => setModalMode(null)}
                motherAccountId={motherAccountId || ''}
                platform={account.platform}
                email={account.email}
                onFrozen={() => { setModalMode(null); router.refresh(); }}
            />

            {/* Inline edit customer modal */}
            {modalMode === 'edit_customer' && customer?.id && (
                <InlineEditCustomerModal
                    customerId={customer.id}
                    open={modalMode === 'edit_customer'}
                    onOpenChange={(v) => !v && setModalMode(null)}
                />
            )}
            {/* Edit Slot Modal */}
            <EditSlotModal
                open={modalMode === 'edit_slot'}
                onClose={() => setModalMode(null)}
                slotId={slot.id}
                initialIdentifier={slot.slot_identifier || ''}
                initialPin={slot.pin_code || ''}
                onEdited={() => { setModalMode(null); router.refresh(); }}
            />
        </>
    );
}

// ── Edit Slot Modal ─────────────────────────────────────────────────────────────

interface EditSlotModalProps {
    open: boolean;
    onClose: () => void;
    slotId: string;
    initialIdentifier: string;
    initialPin: string;
    onEdited: () => void;
}

function EditSlotModal({ open, onClose, slotId, initialIdentifier, initialPin, onEdited }: EditSlotModalProps) {
    const [identifier, setIdentifier] = useState(initialIdentifier);
    const [pin, setPin] = useState(initialPin);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setIdentifier(initialIdentifier);
            setPin(initialPin);
            setError('');
        }
    }, [open, initialIdentifier, initialPin]);

    const handleSave = async () => {
        setLoading(true);
        setError('');
        const formData = new FormData();
        formData.append('slot_identifier', identifier);
        formData.append('pin_code', pin);
        
        const result = await updateSlot(slotId, formData);
        setLoading(false);
        if (result.error) {
            setError(result.error);
        } else {
            onEdited();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle>Editar Perfil / Pantalla</DialogTitle>
                    <DialogDescription>Modifica el nombre del perfil o el PIN.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                    {error && <div className="text-sm text-red-500 bg-red-500/10 p-2 rounded">{error}</div>}
                    <div className="space-y-2">
                        <Label>Identificador (Pantalla/Perfil)</Label>
                        <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Ej: Perfil 1, o 0905AA..." />
                    </div>
                    <div className="space-y-2">
                        <Label>PIN / Contraseña</Label>
                        <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Pin o clave del perfil" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                    <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
                    <Button className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90" onClick={handleSave} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Guardar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Extend Modal ────────────────────────────────────────────────────────────────

interface ExtendModalProps {
    open: boolean;
    onClose: () => void;
    slotId: string;
    saleId?: string;
    slotName: string | null;
    platform: string;
    customerName: string | null | undefined;
    currentEndDate: string | null | undefined;
}

function ExtendModal({ open, onClose, slotId, saleId: initialSaleId, slotName, platform, customerName, currentEndDate }: ExtendModalProps) {
    const PRESETS = [30, 60, 90];
    const [days, setDays] = useState(30);
    const [useCustom, setUseCustom] = useState(false);
    const [customDays, setCustomDays] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [comboInfo, setComboInfo] = useState<{ isCombo: boolean; siblings: any[]; totalPrice: number } | null>(null);

    function reset() {
        setDays(30); setUseCustom(false); setCustomDays('');
        setAmount(''); setError(null); setSuccess(null); setComboInfo(null);
    }

    useEffect(() => { if (!open) reset(); }, [open]);

    // Fetch combo info when modal opens
    useEffect(() => {
        if (!open || !initialSaleId) return;
        (async () => {
            try {
                const { getComboInfo } = await import('@/lib/actions/sales');
                const info = await getComboInfo(initialSaleId);
                setComboInfo(info as any);
            } catch { /* ignore */ }
        })();
    }, [open, initialSaleId]);

    async function handleExtend() {
        setError(null);
        const effectiveDays = useCustom ? parseInt(customDays || '0', 10) : days;
        const effectiveAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
        if (!effectiveDays || effectiveDays <= 0) { setError('Ingresá días válidos'); return; }
        if (isNaN(effectiveAmount) || effectiveAmount < 0) { setError('Ingresá un monto válido'); return; }

        setLoading(true);
        try {
            let saleId = initialSaleId;

            if (!saleId) {
                const res = await fetch(`/api/search/slot-customer?slotId=${slotId}`);
                const d = await res.json();
                saleId = d.sale_id;
            }

            if (!saleId) { setError('No se encontró la venta activa'); setLoading(false); return; }

            const result = await extendSale({ saleId, extraDays: effectiveDays, amountGs: effectiveAmount }) as any;
            if (result.error) {
                setError(result.error);
            } else {
                setSuccess(result.message || '¡Extensión realizada!');
                setTimeout(() => { onClose(); reset(); }, 2000);
            }
        } catch (e: any) {
            setError(e.message || 'Error inesperado');
        }
        setLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        Extender suscripción
                    </DialogTitle>
                    <DialogDescription>
                        {slotName || 'Perfil'} · {platform}
                        {customerName && <span className="text-foreground/60"> · {customerName}</span>}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Combo banner */}
                    {comboInfo?.isCombo && (
                        <div className="rounded-lg bg-[#F97316]/10 border border-[#F97316]/30 px-3 py-2">
                            <p className="text-xs font-semibold text-[#F97316] mb-1">📦 Este servicio es parte de un Combo</p>
                            <p className="text-[11px] text-muted-foreground">
                                Se extenderán los {comboInfo.siblings.length} servicios juntos:
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {comboInfo.siblings.map((s: any, i: number) => (
                                    <span key={i} className="text-[10px] bg-[#F97316]/20 text-[#F97316] px-1.5 py-0.5 rounded font-medium">
                                        {s.platform}
                                    </span>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Precio actual del combo: <span className="text-foreground font-medium">Gs. {comboInfo.totalPrice?.toLocaleString('es-PY')}</span>
                            </p>
                        </div>
                    )}

                    {currentEndDate && (
                        <p className="text-xs text-muted-foreground">
                            Vence actualmente: <span className="font-medium text-foreground">{new Date(currentEndDate + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                        </p>
                    )}

                    {/* Days presets */}
                    <div className="space-y-2">
                        <Label className="text-xs">Días a extender</Label>
                        <div className="flex gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => { setDays(p); setUseCustom(false); }}
                                    className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors border ${
                                        !useCustom && days === p
                                            ? 'bg-emerald-600 text-white border-emerald-500'
                                            : 'border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/50'
                                    }`}
                                >
                                    {p}d
                                </button>
                            ))}
                            <button
                                onClick={() => setUseCustom(true)}
                                className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors border ${
                                    useCustom
                                        ? 'bg-emerald-600 text-white border-emerald-500'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/50'
                                }`}
                            >
                                Otro
                            </button>
                        </div>
                        {useCustom && (
                            <Input
                                type="number"
                                placeholder="Ej: 45"
                                value={customDays}
                                onChange={e => setCustomDays(e.target.value)}
                                className="bg-secondary border-border"
                                autoFocus
                            />
                        )}
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label className="text-xs">
                            Monto cobrado (Gs.)
                            {comboInfo?.isCombo && <span className="text-[#F97316] ml-1">(combo completo)</span>}
                        </Label>
                        <Input
                            type="text"
                            placeholder="Ej: 30000"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="bg-secondary border-border"
                        />
                    </div>

                    {error && <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>}
                    {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">{success}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
                    <Button
                        size="sm"
                        onClick={handleExtend}
                        disabled={loading || !!success}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {comboInfo?.isCombo
                            ? `Extender Combo ${useCustom ? (customDays || '?') + 'd' : days + 'd'}`
                            : useCustom ? `Extender ${customDays || '?'}d` : `Extender ${days}d`
                        }
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Swap Modal ──────────────────────────────────────────────────────────────────

interface SwapModalProps {
    open: boolean;
    onClose: () => void;
    slotId: string;
    slotName: string | null;
    platform: string;
    currentCustomer: { id: string; full_name: string | null; phone: string | null } | null;
}

function SwapModal({ open, onClose, slotId, slotName, platform, currentCustomer }: SwapModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CustomerResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<CustomerResult | null>(null);
    const [swapping, setSwapping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function reset() {
        setQuery(''); setResults([]); setSelected(null);
        setError(null); setSuccess(false);
    }

    useEffect(() => { if (!open) reset(); }, [open]);

    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (!query.trim() || query.length < 2) { setResults([]); return; }
        timeoutRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/search/customers?q=${encodeURIComponent(query)}`);
                const d = await res.json();
                setResults(d.customers || []);
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 300);
    }, [query]);

    async function handleSwap() {
        if (!selected) return;
        setSwapping(true); setError(null);
        const result = await swapSlotCustomer(slotId, selected.id);
        if (result.error) {
            setError(result.error);
        } else {
            setSuccess(true);
            setTimeout(() => { onClose(); reset(); }, 2000);
        }
        setSwapping(false);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-orange-400" />
                        Intercambiar cliente
                    </DialogTitle>
                    <DialogDescription>
                        {slotName || 'Perfil'} · {platform}
                        {currentCustomer?.full_name && (
                            <span className="text-foreground/60"> · actual: {currentCustomer.full_name}</span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="relative">
                        <Input
                            placeholder="Buscar cliente por nombre o teléfono..."
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelected(null); }}
                            className="bg-secondary border-border pr-8"
                            autoFocus
                        />
                        {searching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>

                    {results.length > 0 && !selected && (
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-secondary divide-y divide-border/50">
                            {results.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { setSelected(c); setQuery(c.full_name || c.phone || ''); setResults([]); }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#86EFAC]/10 transition-colors"
                                >
                                    <div className="font-medium text-foreground">{c.full_name || '(sin nombre)'}</div>
                                    {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                                </button>
                            ))}
                        </div>
                    )}

                    {selected && (
                        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm">
                            <p className="font-medium text-orange-300">{selected.full_name || '(sin nombre)'}</p>
                            {selected.phone && <p className="text-xs text-muted-foreground">{selected.phone}</p>}
                        </div>
                    )}

                    {error && <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>}
                    {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">¡Cliente intercambiado exitosamente!</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
                    <Button
                        size="sm"
                        onClick={handleSwap}
                        disabled={!selected || swapping || success}
                        className="bg-orange-500 hover:bg-orange-400 text-white"
                    >
                        {swapping && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        Intercambiar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Suspend Modal ─────────────────────────────────────────────────────────────

interface SuspendModalProps {
    open: boolean;
    onClose: () => void;
    slotId: string;
    saleId: string | undefined;
    slotName: string | null;
    platform: string;
    customerName: string | null | undefined;
    onSuspended: () => void;
}

function SuspendModal({ open, onClose, slotId, saleId, slotName, platform, customerName, onSuspended }: SuspendModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comboInfo, setComboInfo] = useState<{ isCombo: boolean; siblings: any[] } | null>(null);

    useEffect(() => { if (!open) { setError(null); setComboInfo(null); } }, [open]);

    // Fetch combo info when modal opens
    useEffect(() => {
        if (!open || !saleId) return;
        (async () => {
            try {
                const { getComboInfo } = await import('@/lib/actions/sales');
                const info = await getComboInfo(saleId);
                setComboInfo(info as any);
            } catch { /* ignore */ }
        })();
    }, [open, saleId]);

    async function handleSuspend(cancelAll: boolean) {
        if (!saleId) { setError('No se encontró la venta activa'); return; }
        setLoading(true);
        setError(null);
        const result = await cancelSubscription(saleId, slotId, cancelAll);
        if (result.error) {
            setError(result.error);
        } else {
            onSuspended();
        }
        setLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-400">
                        <Ban className="h-4 w-4" />
                        Suspender cliente
                    </DialogTitle>
                    <DialogDescription>
                        {slotName || 'Perfil'} · {platform}
                        {customerName && <span className="text-foreground/60"> · {customerName}</span>}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-3">
                    {/* Combo banner */}
                    {comboInfo?.isCombo && (
                        <div className="rounded-lg bg-[#F97316]/10 border border-[#F97316]/30 px-3 py-2">
                            <p className="text-xs font-semibold text-[#F97316] mb-1">📦 Este servicio es parte de un Combo</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {comboInfo.siblings.map((s: any, i: number) => (
                                    <span key={i} className="text-[10px] bg-[#F97316]/20 text-[#F97316] px-1.5 py-0.5 rounded font-medium">
                                        {s.platform}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-300">
                            Esto <strong>cancela la suscripción</strong> y libera el slot. El cliente perderá acceso.
                        </p>
                    </div>
                    {error && <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
                    {comboInfo?.isCombo ? (
                        <>
                            <Button
                                size="sm"
                                onClick={() => handleSuspend(false)}
                                disabled={loading}
                                className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Solo este servicio
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => handleSuspend(true)}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-500 text-white text-xs"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Todo el combo ({comboInfo.siblings.length})
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => handleSuspend(false)}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-500 text-white"
                        >
                            {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                            Sí, suspender
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Freeze Modal ──────────────────────────────────────────────────────────────

interface FreezeModalProps {
    open: boolean;
    onClose: () => void;
    motherAccountId: string;
    platform: string;
    email: string;
    onFrozen: () => void;
}

function FreezeModal({ open, onClose, motherAccountId, platform, email, onFrozen }: FreezeModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (!open) setError(null); }, [open]);

    async function handleFreeze() {
        if (!motherAccountId) { setError('ID de cuenta no encontrado'); return; }
        setLoading(true);
        setError(null);
        const result = await freezeMotherAccount(motherAccountId);
        if (result.error) {
            setError(result.error);
        } else {
            onFrozen();
        }
        setLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-blue-400">
                        <Snowflake className="h-4 w-4" />
                        Congelar cuenta
                    </DialogTitle>
                    <DialogDescription>
                        {platform} · <span className="font-mono text-xs">{email}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-3">
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 flex items-start gap-3">
                        <Snowflake className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-200 space-y-1">
                            <p>La <strong>cuenta completa</strong> quedará congelada ❄️.</p>
                            <p className="text-blue-300/70 text-xs">No se podrán asignar nuevos clientes. Los slots actuales no se modifican. Podés reactivarla desde editar cuenta.</p>
                        </div>
                    </div>
                    {error && <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
                    <Button
                        size="sm"
                        onClick={handleFreeze}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                        {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        ❄️ Congelar cuenta
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
