'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    User, Monitor, Truck, Phone, Loader2, SearchX, ArrowLeft,
    Repeat, Save, Check, Eye, EyeOff, Clock, Copy, Pencil, X,
    ChevronDown, ChevronUp, UserCircle, Search, ArrowUpDown,
    Plus, Trash2, Shield, ShieldCheck, Lock, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SwapServiceModal } from './swap-service-modal';
import { ExtendSaleModal } from '@/components/customers/extend-sale-modal';
import { createSlot, deleteSlot, renumberSlots, reactivateAccount } from '@/lib/actions/inventory';
import { cancelSubscription } from '@/lib/actions/sales';

/* ── Types ───────────────────────────────────────────────────── */

interface ServiceInfo {
    sale_id: string;
    slot_id: string;
    platform: string;
    slot_identifier: string;
    pin_code: string;
    slot_status: string;
    account_email: string;
    account_password: string;
    mother_account_id: string;
    renewal_date: string;
    sale_type: string; // 'profile' | 'complete' (familia)
    sale_end_date: string;
    amount: number;
    start_date: string;
    is_combo?: boolean;
    is_family?: boolean;
    mother_platform?: string;
    client_email?: string;
    client_password?: string;
}

interface SlotCustomer {
    sale_id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    amount: number;
    start_date: string;
    end_date: string;
}

interface SlotDetail {
    id: string;
    identifier: string;
    status: string;
    pin_code: string;
    customer: SlotCustomer | null;
    is_family?: boolean;
}

interface SearchResult {
    id: string;
    type: 'customer' | 'account' | 'supplier';
    title: string;
    subtitle: string;
    platform?: string;
    status?: string;
    email?: string;
    password?: string;
    renewal_date?: string;
    purchase_cost_gs?: number;
    sale_price_gs?: number;
    sale_type?: string; // 'profile' | 'complete'
    supplier_name?: string;
    supplier_phone?: string;
    services?: ServiceInfo[];
    totalSlots?: number;
    availableSlots?: number;
    soldSlots?: number;
    slots?: SlotDetail[];
    is_family?: boolean;
}

type SortField = 'platform' | 'email' | 'password' | 'sale_price_gs' | 'renewal_date' | 'days';
type SortDir = 'asc' | 'desc';

/* ── Helpers ─────────────────────────────────────────────────── */

const platformColors: Record<string, string> = {
    Netflix: '#E50914', Spotify: '#1DB954', HBO: '#5c16c5', 'HBO Max': '#5c16c5',
    'Disney+': '#0063e5', 'Amazon Prime': '#00a8e1', 'YouTube Premium': '#ff0000',
    'Apple TV+': '#555', Crunchyroll: '#F47521', 'Paramount+': '#0064FF',
    'Star+': '#C724B1', Tidal: '#000',
};

const statusLabels: Record<string, string> = {
    available: 'Disponible', sold: 'Vendido', reserved: 'Reservado', warranty_claim: 'Garantía',
};

const statusColors: Record<string, string> = {
    available: '#86EFAC', sold: '#F97316', reserved: '#EAB308', warranty_claim: '#EF4444',
};

function daysRemaining(dateStr: string): number {
    if (!dateStr) return 0;
    const diff = new Date(dateStr + 'T12:00:00').getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function daysBadge(dateStr: string) {
    const days = daysRemaining(dateStr);
    let cls = 'text-[#86EFAC]';
    if (days <= 3) cls = 'text-red-500';
    else if (days <= 7) cls = 'text-yellow-500';
    return <span className={`font-mono font-semibold text-sm ${cls}`}>{days}d</span>;
}

function formatDate(d: string) {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatGs(n: number | null | undefined) {
    if (n == null) return '—';
    return `Gs. ${Number(n).toLocaleString('es-PY')}`;
}

/* ── Copy helper ─────────────────────────────────────────────── */

function useCopy() {
    const [copied, setCopied] = useState(false);
    const copy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return { copied, copy };
}

function CopyButton({ getText, size = 'sm' }: { getText: () => string; size?: 'sm' | 'xs' }) {
    const { copied, copy } = useCopy();
    const cls = size === 'xs'
        ? 'p-1.5 rounded text-[10px] min-h-[28px]'
        : 'px-2.5 py-1.5 rounded-md text-xs min-h-[36px]';
    return (
        <button
            onClick={() => copy(getText())}
            className={`flex items-center gap-1 font-medium transition-all ${cls} ${copied
                ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                : 'bg-[#818CF8]/10 text-[#818CF8] hover:bg-[#818CF8]/20'
                }`}
            title="Copiar datos"
        >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {size === 'sm' && (copied ? 'Copiado' : 'Copiar')}
        </button>
    );
}

/* ── SearchByPhone button ─────────────────────────────────────── */

function SearchPhoneButton({ phone }: { phone: string }) {
    const router = useRouter();
    if (!phone) return null;
    return (
        <button
            onClick={() => router.push(`/?q=${encodeURIComponent(phone)}`)}
            className="flex items-center gap-1 p-1.5 rounded text-[10px] font-medium bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/20 transition-colors min-h-[28px]"
            title={`Buscar ${phone}`}
        >
            <Search className="h-3 w-3" />
        </button>
    );
}

/* ── Update helper ───────────────────────────────────────────── */

async function saveField(type: string, id: string, fields: Record<string, any>) {
    const res = await fetch('/api/search/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, fields }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
}

/* ── Editable input components ───────────────────────────────── */

function EditInput({ value, onChange, placeholder, type = 'text', className = '' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none transition-colors w-full ${className}`}
        />
    );
}

function PassInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 pr-7 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none transition-colors w-full"
            />
            <button onClick={() => setShow(!show)} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
        </div>
    );
}

/* ── Visible password display ──────────────────────────────────── */

function VisiblePassword({ value }: { value: string }) {
    const [show, setShow] = useState(false);
    return (
        <span className="inline-flex items-center gap-1">
            <span className="text-sm text-foreground">{show ? value : '••••••'}</span>
            <button onClick={() => setShow(!show)} className="text-muted-foreground hover:text-foreground p-0.5">
                {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
        </span>
    );
}

/* ═══════════════════════════════════════════════════════════════
   CUSTOMER SERVICE ROW
   compact read-only → edit mode with all fields
   ═══════════════════════════════════════════════════════════════ */

function CustomerServiceRow({ svc, onSwap, onSaved }: { svc: ServiceInfo; onSwap: () => void; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Editable state
    const [status, setStatus] = useState(svc.slot_status);
    const [renewalDate, setRenewalDate] = useState(svc.renewal_date);
    const [saleEndDate, setSaleEndDate] = useState(svc.sale_end_date || svc.renewal_date); // vencimiento del CLIENTE
    const [email, setEmail] = useState(svc.account_email);
    const [password, setPassword] = useState(svc.account_password);
    const [slotName, setSlotName] = useState(svc.slot_identifier);
    const [pin, setPin] = useState(svc.pin_code);
    const [amount, setAmount] = useState(String(svc.amount || ''));

    const color = platformColors[svc.platform] || '#86EFAC';

    const handleSave = async () => {
        setSaving(true); setError(''); setSaved(false);
        try {
            await saveField('slot', svc.slot_id, { slot_identifier: slotName, pin_code: pin, status });
            await saveField('account', svc.mother_account_id, { email, password });
            await saveField('sale', svc.sale_id, { amount_gs: parseInt(amount) || 0, end_date: saleEndDate || null });
            setSaved(true);
            setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
            onSaved();
        } catch (err: any) { setError(err.message || 'Error'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        setDeleting(true); setError('');
        try {
            const result = await cancelSubscription(svc.sale_id, svc.slot_id);
            if (result.error) throw new Error(result.error);
            onSaved(); // refresh parent
        } catch (err: any) { setError(err.message || 'Error'); setDeleting(false); setConfirmDelete(false); }
    };

    // Usar el end_date del cliente (su slot), no el renewal_date de la madre
    const customerExpiry = svc.sale_end_date || svc.renewal_date;

    const copyText = () => {
        if (isFamilyAccount) {
            // For family accounts, only share client-facing credentials
            return [
                `${svc.platform} (Plan Familiar)`,
                `Correo: ${svc.client_email || slotName}`,
                `Contraseña: ${svc.client_password || pin}`,
                `Vence: ${formatDate(customerExpiry)}`,
            ].filter(Boolean).join('\n');
        }
        return `${svc.platform}\nUsuario: ${email}\nClave: ${password}\nPantalla: ${slotName}${pin ? `\nPIN: ${pin}` : ''}\nVence: ${formatDate(customerExpiry)}\nPrecio: ${formatGs(Number(amount))}`;
    };

    // Detectar si es cuenta familia (usando el flag del API, o fallback al heurístico)
    const isFamilyAccount = svc.is_family || (slotName || '').includes('@');

    /* ── COMPACT VIEW ──────────────────────────────────────── */
    if (!editing) {
        return (
            <div className="rounded-lg border border-border/40 bg-[#111] overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-3 py-2.5 md:px-4">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                    <div className={`flex-1 grid grid-cols-2 ${isFamilyAccount ? 'md:grid-cols-7' : 'md:grid-cols-6'} gap-x-3 gap-y-1 items-center min-w-0`}>
                        <div>
                            <span className="text-xs text-muted-foreground block">Plataforma</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-foreground">{svc.platform}</span>
                                {svc.is_combo && (
                                    <span className="inline-flex items-center rounded-full bg-[#818CF8]/15 border border-[#818CF8]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#818CF8]">
                                        Combo
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Para cuentas FAMILIA: mostrar correo/contraseña FINAL del cliente (no la madre) */}
                        {isFamilyAccount ? (
                            <>
                                <div className="truncate">
                                    <span className="text-xs text-blue-400 block">Correo final</span>
                                    <span className="text-sm text-foreground truncate block font-medium">{svc.client_email || slotName}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-blue-400 block">Contraseña final</span>
                                    <VisiblePassword value={svc.client_password || pin} />
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Acceso cuenta madre (email + clave) */}
                                <div className="truncate">
                                    <span className="text-xs text-muted-foreground block">Acceso</span>
                                    <span className="text-sm text-muted-foreground truncate block">{email || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">Clave</span>
                                    <VisiblePassword value={password} />
                                </div>
                                {/* Perfil del cliente */}
                                <div className="truncate">
                                    <span className="text-xs text-muted-foreground block">Perfil</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-sm text-foreground truncate block font-medium">{slotName}</span>
                                        {pin && <span className="text-[10px] text-muted-foreground">(PIN: {pin})</span>}
                                    </div>
                                </div>
                            </>
                        )}
                        <div>
                            <span className="text-xs text-muted-foreground block">Vencimiento</span>
                            <span className="text-sm text-foreground">{formatDate(customerExpiry)}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block">Días</span>
                            {daysBadge(customerExpiry)}
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block">Precio</span>
                            <span className="text-sm font-semibold text-[#86EFAC]">{formatGs(Number(amount))}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                        <CopyButton getText={copyText} />
                        <button
                            onClick={() => setEditing(true)}
                            className="flex items-center gap-1 rounded-md bg-yellow-500/10 px-2.5 py-1.5 text-xs font-medium text-yellow-500 hover:bg-yellow-500/20 transition-colors min-h-[36px]"
                        >
                            <Pencil className="h-3 w-3" /> Editar
                        </button>
                        <button
                            onClick={onSwap}
                            className="flex items-center gap-1 rounded-md bg-[#F97316]/10 px-2.5 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20 transition-colors min-h-[36px]"
                        >
                            <Repeat className="h-3 w-3" /> Intercambiar
                        </button>
                        {/* Extender — uses the modal's built-in trigger button */}
                        <ExtendSaleModal
                            saleId={svc.sale_id}
                            currentEndDate={svc.sale_end_date || svc.renewal_date}
                            customerName={''}
                            platform={svc.platform}
                            onSuccess={() => onSaved()}
                        />
                        {confirmDelete ? (
                            <>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex items-center gap-1 rounded-md bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 min-h-[36px]"
                                >
                                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : '¿Seguro?'}
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    No
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="flex items-center gap-1 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors min-h-[36px]"
                                title="Cancelar suscripción"
                            >
                                <Trash2 className="h-3 w-3" /> Eliminar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ── EDIT VIEW ─────────────────────────────────────────── */
    return (
        <div className="rounded-lg border border-yellow-500/40 bg-[#111] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-border/30">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold">{svc.platform}</span>
                    <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-500 bg-yellow-500/5">Editando</Badge>
                </div>
                <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-1">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Estado</label>
                    <select value={status} onChange={e => setStatus(e.target.value)}
                        className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none w-full">
                        {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Vencimiento Cliente</label>
                    <EditInput type="date" value={saleEndDate} onChange={setSaleEndDate} />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Días Restantes</label>
                    <div className="flex items-center h-[30px]">{daysBadge(saleEndDate)}</div>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Usuario</label>
                    <EditInput value={email} onChange={setEmail} placeholder="email" />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Clave</label>
                    <PassInput value={password} onChange={setPassword} />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Pantalla</label>
                    <EditInput value={slotName} onChange={setSlotName} placeholder="Perfil 1" />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">PIN</label>
                    <EditInput value={pin} onChange={setPin} placeholder="1234" />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Precio Venta (Gs)</label>
                    <EditInput type="number" value={amount} onChange={setAmount} placeholder="25000" />
                </div>
            </div>

            <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-[#0d0d0d]">
                <div>{error && <span className="text-xs text-red-500">{error}</span>}</div>
                <div className="flex items-center gap-2">
                    {confirmDelete ? (
                        <>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex items-center gap-1 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                                {deleting ? <><Loader2 className="h-3 w-3 animate-spin" /> Eliminando...</> : '¿Confirmar eliminación?'}
                            </button>
                            <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">No</button>
                        </>
                    ) : (
                        <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                            <Trash2 className="h-3 w-3" /> Eliminar
                        </button>
                    )}
                    <button onClick={onSwap} className="flex items-center gap-1 rounded-md bg-[#F97316]/10 px-3 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20 transition-colors">
                        <Repeat className="h-3 w-3" /> Intercambiar
                    </button>
                    <ExtendSaleModal
                        saleId={svc.sale_id}
                        currentEndDate={svc.sale_end_date || svc.renewal_date}
                        customerName={''}
                        platform={svc.platform}
                        onSuccess={() => onSaved()}
                    />
                    <button onClick={handleSave} disabled={saving}
                        className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-all ${saved ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-[#86EFAC]/10 text-[#86EFAC] hover:bg-[#86EFAC]/20'
                            } disabled:opacity-50`}>
                        {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
                            : saved ? <><Check className="h-3 w-3" /> Guardado</>
                                : <><Save className="h-3 w-3" /> Guardar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNT CARD — reordered columns, hidden slots, sort support
   ═══════════════════════════════════════════════════════════════ */

function AccountCard({ account, onRefresh, onSwapSlot }: { account: SearchResult; onRefresh: () => void; onSwapSlot?: (slot: SlotDetail, account: SearchResult) => void }) {
    const color = platformColors[account.platform || ''] || '#86EFAC';
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [slotsOpen, setSlotsOpen] = useState(false); // hidden by default
    const [reactivating, setReactivating] = useState(false);
    const [reactivated, setReactivated] = useState(false);

    // Slot management state
    const [addingSlot, setAddingSlot] = useState(false);
    const [newSlotName, setNewSlotName] = useState('');
    const [newSlotPin, setNewSlotPin] = useState('');
    const [slotActionLoading, setSlotActionLoading] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Editable state
    const [email, setEmail] = useState(account.email || '');
    const [password, setPassword] = useState(account.password || '');
    const [renewalDate, setRenewalDate] = useState(account.renewal_date || '');
    const [purchaseCost, setPurchaseCost] = useState(String(account.purchase_cost_gs || ''));
    const [salePrice, setSalePrice] = useState(String(account.sale_price_gs || ''));
    const [supplierName, setSupplierName] = useState(account.supplier_name || '');
    const [supplierPhone, setSupplierPhone] = useState(account.supplier_phone || '');

    const handleSave = async () => {
        setSaving(true); setError(''); setSaved(false);
        try {
            await saveField('account', account.id, {
                email, password, renewal_date: renewalDate,
            });
            setSaved(true);
            setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
            onRefresh();
        } catch (err: any) { setError(err.message || 'Error'); }
        finally { setSaving(false); }
    };

    const handleAddSlot = async () => {
        if (!newSlotName.trim()) return;
        setSlotActionLoading('adding');
        setError('');
        try {
            const fd = new FormData();
            fd.set('mother_account_id', account.id);
            fd.set('slot_identifier', newSlotName.trim());
            fd.set('pin_code', newSlotPin.trim());
            const result = await createSlot(fd);
            if (result.error) throw new Error(result.error);
            await renumberSlots(account.id);
            setNewSlotName('');
            setNewSlotPin('');
            setAddingSlot(false);
            onRefresh();
        } catch (err: any) { setError(err.message || 'Error al agregar slot'); }
        finally { setSlotActionLoading(null); }
    };

    const handleDeleteSlot = async (slotId: string) => {
        setSlotActionLoading(slotId);
        setError('');
        try {
            const result = await deleteSlot(slotId);
            if (result.error) throw new Error(result.error);
            await renumberSlots(account.id);
            setConfirmDeleteId(null);
            onRefresh();
        } catch (err: any) { setError(err.message || 'Error al eliminar slot'); }
        finally { setSlotActionLoading(null); }
    };

    const copyText = () =>
        `${account.platform}\nUsuario: ${email}\nClave: ${password}\nVence: ${formatDate(renewalDate)}`;

    const available = account.availableSlots || 0;
    const sold = account.soldSlots || 0;
    const total = account.totalSlots || 0;

    // Sort slots by number prefix (1. xxx, 2. xxx, 3. xxx)
    const extractSlotNum = (s: SlotDetail) => {
        const m = (s.identifier || '').match(/^(\d+)/);
        return m ? parseInt(m[1]) : 999;
    };
    // Sold slots WITH customer data → shown with customer info
    const soldSlots = (account.slots || []).filter(s => s.status === 'sold' && s.customer).sort((a, b) => extractSlotNum(a) - extractSlotNum(b));
    // Free slots OR orphaned sold slots (sold but no customer → treat as free)
    const freeSlots = (account.slots || []).filter(s => s.status !== 'sold' || !s.customer).sort((a, b) => extractSlotNum(a) - extractSlotNum(b));
    const allSlotsSorted = [...(account.slots || [])].sort((a, b) => extractSlotNum(a) - extractSlotNum(b));

    const isQuarantined = account.status === 'quarantine';
    const isFamily = account.is_family || false;

    return (
        <Card className={`border-border bg-card overflow-hidden ${isQuarantined ? 'opacity-60 border-yellow-500/30' : ''}`}>
            <CardContent className="p-0">
                {/* ── COMPACT INFO ROW — Plataforma, Usuario, Clave, Proveedor, Vencimiento, Días ── */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-3 py-3 md:px-4">
                    <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: isQuarantined ? '#EAB308' : color }} />

                    <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-x-4 gap-y-1 items-center min-w-0">
                        <div>
                            <span className="text-xs text-muted-foreground block">Plataforma</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-foreground">{account.platform}</span>
                                {isQuarantined && <Badge variant="outline" className="text-[9px] border-yellow-500/40 text-yellow-500 px-1 py-0"><Shield className="h-2.5 w-2.5 mr-0.5 inline" />Cuarentena</Badge>}
                            </div>
                        </div>
                        <div className="truncate">
                            <span className="text-xs text-muted-foreground block">Usuario</span>
                            <span
                                className="text-sm text-foreground truncate block cursor-pointer hover:text-[#818CF8] transition-colors"
                                title="Click para copiar"
                                onClick={async () => {
                                    if (email) {
                                        await navigator.clipboard.writeText(email);
                                    }
                                }}
                            >{email || '—'}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block">Clave</span>
                            <VisiblePassword value={password} />
                        </div>
                        <div className="truncate">
                            <span className="text-xs text-muted-foreground block">Proveedor</span>
                            <span className="text-sm text-foreground truncate block">{supplierName || '—'}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block">Vencimiento</span>
                            <span className="text-sm text-foreground">{formatDate(renewalDate)}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block">Días</span>
                            {daysBadge(renewalDate)}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                        {isQuarantined && !reactivated && (
                            <button
                                onClick={async () => {
                                    setReactivating(true);
                                    const result = await reactivateAccount(account.id);
                                    if (!result.error) {
                                        setReactivated(true);
                                        setTimeout(() => onRefresh(), 800);
                                    } else {
                                        setError(result.error);
                                    }
                                    setReactivating(false);
                                }}
                                disabled={reactivating}
                                className="flex items-center gap-1 rounded-md bg-[#86EFAC]/10 px-2.5 py-1.5 text-xs font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors disabled:opacity-50 min-h-[36px]"
                            >
                                {reactivating ? <Loader2 className="h-3 w-3 animate-spin" /> : reactivated ? <Check className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                                {reactivated ? 'Reactivada' : 'Reactivar'}
                            </button>
                        )}
                        <Link
                            href={`/inventory?q=${encodeURIComponent(email || account.platform || '')}`}
                            className="flex items-center gap-1 rounded-md bg-[#818CF8]/10 px-2.5 py-1.5 text-xs font-medium text-[#818CF8] hover:bg-[#818CF8]/20 transition-colors min-h-[36px]"
                        >
                            <ExternalLink className="h-3 w-3" /> Gestionar
                        </Link>
                    </div>
                </div>

                {/* ── EDIT PANEL — only Vencimiento, Usuario, Clave, Guardar ── */}
                {editing && (
                    <div className="border-t border-yellow-500/30 bg-[#0d0d0d]">
                        <div className="px-4 py-2">
                            <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-500 bg-yellow-500/5 mb-2">Editando cuenta</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 pb-3">
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Vencimiento</label>
                                <EditInput type="date" value={renewalDate} onChange={setRenewalDate} />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Usuario</label>
                                <EditInput value={email} onChange={setEmail} placeholder="email" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Clave</label>
                                <PassInput value={password} onChange={setPassword} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-4 pb-3">
                            <div>{error && <span className="text-xs text-red-500">{error}</span>}</div>
                            <button onClick={handleSave} disabled={saving}
                                className={`flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all ${saved ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-[#86EFAC]/10 text-[#86EFAC] hover:bg-[#86EFAC]/20'} disabled:opacity-50`}>
                                {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
                                    : saved ? <><Check className="h-3 w-3" /> Guardado</>
                                        : <><Save className="h-3 w-3" /> Guardar</>}
                            </button>
                        </div>

                        {/* ── GESTIÓN DE SLOTS ── */}
                        <div className="border-t border-border/30 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Gestión de Slots ({total})</span>
                                {!addingSlot && (
                                    <button
                                        onClick={() => setAddingSlot(true)}
                                        className="flex items-center gap-1 rounded-md bg-[#818CF8]/10 px-2.5 py-1 text-[11px] font-medium text-[#818CF8] hover:bg-[#818CF8]/20 transition-colors"
                                    >
                                        <Plus className="h-3 w-3" /> Agregar Slot
                                    </button>
                                )}
                            </div>

                            {/* Slot list — compact info rows */}
                            <div className="space-y-1.5">
                                {allSlotsSorted.map(slot => (
                                    <div key={slot.id} className="flex items-center gap-2 rounded-md bg-[#111] px-3 py-2 border border-border/30">
                                        {/* Status dot */}
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColors[slot.status] || '#666' }} />
                                        {/* Perfil / Correo Final */}
                                        {isFamily ? (
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-[10px] text-blue-400">Correo final</span>
                                                <span className="text-sm font-medium text-foreground truncate">{slot.identifier || 'Sin correo'}</span>
                                                {slot.pin_code && (
                                                    <span className="text-[10px] text-muted-foreground truncate">Clave: {slot.pin_code}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium text-foreground w-16 flex-shrink-0 truncate">{slot.identifier || 'Sin nombre'}</span>
                                        )}
                                        {/* Customer info */}
                                        {slot.customer ? (
                                            <>
                                                {!isFamily && <span className="text-sm text-foreground flex-1 truncate">{slot.customer.customer_name}</span>}
                                                {isFamily && <span className="text-sm text-foreground flex-1 truncate">{slot.customer.customer_name}</span>}
                                                <span className="text-xs text-muted-foreground w-28 flex-shrink-0 truncate">{slot.customer.customer_phone || '—'}</span>
                                                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                                                    {slot.customer.end_date
                                                        ? new Date(slot.customer.end_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
                                                        : '—'}
                                                </span>
                                                {/* Search by phone */}
                                                {slot.customer.customer_phone && (
                                                    <SearchPhoneButton phone={slot.customer.customer_phone} />
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-xs text-muted-foreground flex-1 italic">Libre</span>
                                        )}
                                        {/* Status badge */}
                                        <Badge variant="outline" className="text-[10px] flex-shrink-0" style={{
                                            borderColor: `${statusColors[slot.status]}40`,
                                            color: statusColors[slot.status],
                                        }}>
                                            {statusLabels[slot.status] || slot.status}
                                        </Badge>
                                        {/* Delete (only available slots) */}
                                        {slot.status !== 'sold' && (
                                            confirmDeleteId === slot.id ? (
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <button
                                                        onClick={() => handleDeleteSlot(slot.id)}
                                                        disabled={slotActionLoading === slot.id}
                                                        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                                    >
                                                        {slotActionLoading === slot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '¿Seguro?'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        No
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDeleteId(slot.id)}
                                                    className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                                                    title="Eliminar slot"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Formulario para agregar nuevo slot */}
                            {addingSlot && (
                                <div className="mt-2 flex items-center gap-2 rounded-md bg-[#111] px-3 py-2 border border-[#818CF8]/30">
                                    <input
                                        type="text"
                                        value={newSlotName}
                                        onChange={e => setNewSlotName(e.target.value)}
                                        placeholder={isFamily ? 'correo@gmail.com' : 'Nombre (ej: Perfil 5)'}
                                        className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#818CF8]/50 focus:outline-none flex-1"
                                        autoFocus
                                    />
                                    <input
                                        type="text"
                                        value={newSlotPin}
                                        onChange={e => setNewSlotPin(e.target.value)}
                                        placeholder={isFamily ? 'Contraseña final' : 'PIN (opcional)'}
                                        className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#818CF8]/50 focus:outline-none w-28"
                                    />
                                    <button
                                        onClick={handleAddSlot}
                                        disabled={!newSlotName.trim() || slotActionLoading === 'adding'}
                                        className="flex items-center gap-1 rounded-md bg-[#818CF8]/15 px-3 py-1 text-xs font-medium text-[#818CF8] hover:bg-[#818CF8]/25 transition-colors disabled:opacity-50"
                                    >
                                        {slotActionLoading === 'adding' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                        Agregar
                                    </button>
                                    <button
                                        onClick={() => { setAddingSlot(false); setNewSlotName(''); setNewSlotPin(''); }}
                                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {error && <p className="text-xs text-red-500 px-4 pb-2">{error}</p>}
                    </div>
                )}

                {/* ── SLOTS TOGGLE — hidden by default ── */}
                {!editing && total > 0 && (
                    <div className="border-t border-border/30">
                        <button
                            onClick={() => setSlotsOpen(!slotsOpen)}
                            className="flex items-center justify-between w-full px-4 py-2 hover:bg-[#111] transition-colors"
                        >
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-muted-foreground">{total} slots</span>
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-[#86EFAC]" />
                                    <span className="text-[#86EFAC]">{available} libre{available !== 1 ? 's' : ''}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-[#F97316]" />
                                    <span className="text-[#F97316]">{sold} vendido{sold !== 1 ? 's' : ''}</span>
                                </span>
                            </div>
                            {slotsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>

                        {slotsOpen && (
                            <div className="px-4 pb-3 space-y-1.5">
                                {allSlotsSorted.map(slot => (
                                    slot.status === 'sold' && slot.customer ? (
                                        <SlotCustomerRow
                                            key={slot.id}
                                            slot={slot}
                                            accountEmail={email}
                                            accountPassword={password}
                                            renewalDate={renewalDate}
                                            platform={account.platform || ''}
                                            onSwap={onSwapSlot ? () => onSwapSlot(slot, account) : undefined}
                                        />
                                    ) : (
                                        <div key={slot.id} className="flex items-center gap-3 rounded-md bg-[#111] px-3 py-1.5 border border-border/30">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[slot.status] || '#666' }} />
                                            <span className="text-sm text-foreground">{slot.identifier || 'Sin nombre'}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto" style={{
                                                borderColor: `${statusColors[slot.status]}40`,
                                                color: statusColors[slot.status],
                                            }}>
                                                {statusLabels[slot.status] || slot.status}
                                            </Badge>
                                        </div>
                                    )
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SUPPLIER ACCOUNT ROW — compact, no slots
   (same info as AccountCard header row but without slot management)
   ═══════════════════════════════════════════════════════════════ */

function SupplierAccountRow({ account, onRefresh }: { account: SearchResult; onRefresh: () => void }) {
    const color = platformColors[account.platform || ''] || '#86EFAC';
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [email, setEmail] = useState(account.email || '');
    const [password, setPassword] = useState(account.password || '');
    const [renewalDate, setRenewalDate] = useState(account.renewal_date || '');
    const [salePrice, setSalePrice] = useState(String(account.sale_price_gs || ''));

    const handleSave = async () => {
        setSaving(true); setError(''); setSaved(false);
        try {
            await saveField('account', account.id, { email, password, renewal_date: renewalDate });
            setSaved(true);
            setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
            onRefresh();
        } catch (err: any) { setError(err.message || 'Error'); }
        finally { setSaving(false); }
    };

    const available = account.availableSlots || 0;
    const sold = account.soldSlots || 0;
    const total = account.totalSlots || 0;
    const copyText = () => `${account.platform}\nUsuario: ${email}\nClave: ${password}\nVence: ${formatDate(renewalDate)}`;

    return (
        <div className={`rounded-lg border bg-[#0d0d0d] overflow-hidden ${
            editing ? 'border-yellow-500/40' : 'border-border/40 hover:border-border/70'
        } transition-colors`}>
            {/* Compact row */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-3 py-2.5 md:px-4">
                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-x-4 gap-y-1 items-center min-w-0">
                    <div>
                        <span className="text-xs text-muted-foreground block">Plataforma</span>
                        <span className="text-sm font-semibold text-foreground">{account.platform}</span>
                    </div>
                    <div className="truncate">
                        <span className="text-xs text-muted-foreground block">Usuario</span>
                        <span
                            className="text-sm text-foreground truncate block cursor-pointer hover:text-[#818CF8] transition-colors"
                            title="Click para copiar"
                            onClick={async () => { if (email) await navigator.clipboard.writeText(email); }}
                        >{email || '—'}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Clave</span>
                        <VisiblePassword value={password} />
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">P. Venta</span>
                        <span className="text-sm font-semibold text-[#86EFAC]">{formatGs(Number(salePrice))}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Vencimiento</span>
                        <span className="text-sm text-foreground">{formatDate(renewalDate)}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Días</span>
                        {daysBadge(renewalDate)}
                    </div>
                </div>

                {/* Slot summary pills */}
                <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 text-[11px]">
                    <span className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#86EFAC]" />
                        <span className="text-[#86EFAC]">{available}L</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                        <span className="text-[#F97316]">{sold}V</span>
                    </span>
                    <span className="text-muted-foreground/40">/{total}</span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    <CopyButton getText={copyText} />
                    <button
                        onClick={() => setEditing(!editing)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${
                            editing ? 'bg-yellow-500/20 text-yellow-500' : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                        }`}
                    >
                        {editing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                        {editing ? 'Cerrar' : 'Editar'}
                    </button>
                </div>
            </div>

            {/* Edit panel */}
            {editing && (
                <div className="border-t border-yellow-500/30 bg-[#0a0a0a]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Vencimiento</label>
                            <EditInput type="date" value={renewalDate} onChange={setRenewalDate} />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Usuario</label>
                            <EditInput value={email} onChange={setEmail} placeholder="email" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Clave</label>
                            <PassInput value={password} onChange={setPassword} />
                        </div>
                    </div>
                    <div className="flex items-center justify-between px-4 pb-3">
                        <div>{error && <span className="text-xs text-red-500">{error}</span>}</div>
                        <button onClick={handleSave} disabled={saving}
                            className={`flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all ${
                                saved ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-[#86EFAC]/10 text-[#86EFAC] hover:bg-[#86EFAC]/20'
                            } disabled:opacity-50`}>
                            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
                                : saved ? <><Check className="h-3 w-3" /> Guardado</>
                                    : <><Save className="h-3 w-3" /> Guardar</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SlotCustomerRow({ slot, accountEmail, accountPassword, renewalDate, platform, onSwap }: {
    slot: SlotDetail; accountEmail: string; accountPassword: string; renewalDate: string; platform: string; onSwap?: () => void;
}) {
    const cust = slot.customer!;
    const custExpiry = cust.end_date || renewalDate;
    const custDays = custExpiry ? daysRemaining(custExpiry) : null;
    const copyText = () =>
        `${platform}\nUsuario: ${accountEmail}\nClave: ${accountPassword}\nPantalla: ${slot.identifier}${slot.pin_code ? `\nPIN: ${slot.pin_code}` : ''}\nVence: ${formatDate(custExpiry)}`;

    return (
        <div className="flex items-center gap-2.5 rounded-md bg-[#111] px-3 py-2 border border-border/30">
            <div className="w-2 h-2 rounded-full bg-[#F97316] flex-shrink-0" />
            {/* Correo del slot/miembro */}
            <span className="text-sm font-medium text-foreground truncate min-w-[100px] max-w-[180px]">{slot.identifier || '—'}</span>
            {/* PIN con icono candado (sin palabra PIN) */}
            {slot.pin_code && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0" title="PIN">
                    <Lock className="h-3 w-3" />
                    <span>{slot.pin_code}</span>
                </span>
            )}
            <span className="text-muted-foreground flex-shrink-0">·</span>
            {/* Nombre y teléfono del cliente */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <UserCircle className="h-3.5 w-3.5 text-[#F97316] flex-shrink-0" />
                <span className="text-sm text-foreground truncate">{cust.customer_name}</span>
                {cust.customer_phone && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">{cust.customer_phone}</span>
                )}
            </div>
            {/* Vencimiento de la suscripción del cliente */}
            <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(custExpiry)}</span>
            {/* Días restantes con color */}
            {custDays !== null && (
                <span className={`text-xs font-mono font-bold flex-shrink-0 ${custDays <= 3 ? 'text-red-400' : custDays <= 7 ? 'text-yellow-400' : 'text-[#86EFAC]'}`}>
                    {custDays}d
                </span>
            )}
            {/* Precio */}
            <span className="text-sm font-semibold text-[#86EFAC] flex-shrink-0">{formatGs(cust.amount)}</span>
            <CopyButton getText={copyText} size="xs" />
            <SearchPhoneButton phone={cust.customer_phone} />
            {onSwap && (
                <button
                    onClick={onSwap}
                    className="flex items-center gap-1 rounded-md bg-[#F97316]/10 px-2 py-1 text-[10px] font-medium text-[#F97316] hover:bg-[#F97316]/20 transition-colors flex-shrink-0"
                    title="Intercambiar servicio"
                >
                    <Repeat className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   CUSTOMER INVENTORY VIEW
   Jerárquica: cuenta madre arriba → slots abajo → cliente buscado resaltado
   ═══════════════════════════════════════════════════════════════ */

function CustomerInventoryView({ customer, onSwap, onSaved }: {
    customer: SearchResult;
    onSwap: (svc: ServiceInfo) => void;
    onSaved: () => void;
}) {
    const services = customer.services || [];

    // Group services by mother_account_id so each account appears once
    const grouped = new Map<string, { accountEmail: string; accountPassword: string; platform: string; renewalDate: string; saleType: string; svcs: ServiceInfo[] }>();
    services.forEach(svc => {
        const key = svc.mother_account_id || svc.sale_id;
        if (!grouped.has(key)) {
            grouped.set(key, {
                accountEmail: svc.account_email,
                accountPassword: svc.account_password,
                platform: svc.platform,
                renewalDate: svc.renewal_date,
                saleType: svc.sale_type || 'profile',
                svcs: [],
            });
        }
        grouped.get(key)!.svcs.push(svc);
    });

    return (
        <div className="space-y-3">
            {/* ── Customer identity header ── */}
            <div className="flex items-center gap-3 px-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
                    style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>
                    <User className="h-4 w-4 text-[#F97316]" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base text-white truncate">{customer.title}</p>
                    {customer.subtitle && (
                        <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: '#8b8ba7' }}>
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span>{customer.subtitle}</span>
                        </div>
                    )}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#8b8ba7' }}>
                    {services.length} servicio{services.length !== 1 ? 's' : ''}
                </span>
            </div>

            {services.length === 0 ? (
                <p className="ml-12 text-xs italic" style={{ color: '#8b8ba7' }}>Sin servicios activos</p>
            ) : (
                <div className="ml-12 space-y-3">
                    {[...grouped.entries()].map(([key, group]) => {
                        const acctColor = platformColors[group.platform] || '#86EFAC';
                        const isFamily = group.saleType === 'complete';
                        const expiry = group.renewalDate;
                        const daysLeft = expiry ? daysRemaining(expiry) : null;

                        return (
                            <div key={key} className="rounded-xl overflow-hidden"
                                style={{ border: '1px solid rgba(134,239,172,0.25)', background: '#0d1117' }}>

                                {/* ── Cuenta Madre Header ── */}
                                <div className="flex items-center gap-3 px-4 py-3"
                                    style={{ background: 'rgba(134,239,172,0.05)', borderBottom: '1px solid rgba(134,239,172,0.15)' }}>
                                    <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: acctColor }} />

                                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 items-center">
                                        <div>
                                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: '#8b8ba7' }}>Cuenta Madre</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-bold text-white">{group.platform}</span>
                                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                                    style={{ background: isFamily ? 'rgba(249,115,22,0.12)' : 'rgba(134,239,172,0.12)', color: isFamily ? '#F97316' : '#86EFAC', border: `1px solid ${isFamily ? 'rgba(249,115,22,0.25)' : 'rgba(134,239,172,0.25)'}` }}>
                                                    {isFamily ? '👨‍👩‍👧 Familia' : '🖥️ Perfiles'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="truncate">
                                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: '#8b8ba7' }}>Usuario</span>
                                            <span className="text-sm text-white truncate block cursor-pointer hover:text-[#818CF8] transition-colors"
                                                title="Click para copiar"
                                                onClick={async () => { if (group.accountEmail) await navigator.clipboard.writeText(group.accountEmail); }}>
                                                {group.accountEmail || '—'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: '#8b8ba7' }}>Clave</span>
                                            <VisiblePassword value={group.accountPassword} />
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: '#8b8ba7' }}>Vence Cuenta</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-white">{formatDate(expiry)}</span>
                                                {daysLeft !== null && (
                                                    <span className={`text-xs font-mono font-bold ${daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-[#86EFAC]'}`}>
                                                        {daysLeft}d
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <CopyButton getText={() => `${group.platform}\nUsuario: ${group.accountEmail}\nClave: ${group.accountPassword}\nVence: ${formatDate(expiry)}`} />
                                </div>

                                {/* ── Slots / Miembros de esta cuenta ── */}
                                <div className="px-4 py-2 space-y-1.5">
                                    {group.svcs.map((svc, i) => {
                                        const custExpiry = svc.sale_end_date || svc.renewal_date;
                                        const custDays = custExpiry ? daysRemaining(custExpiry) : null;

                                        return (
                                            <div key={`${svc.sale_id}-${i}`}
                                                className="rounded-lg px-3 py-2.5 transition-all"
                                                style={{
                                                    background: 'rgba(249,115,22,0.06)',
                                                    border: '1.5px solid rgba(249,115,22,0.4)',
                                                }}>
                                                <div className="flex items-center gap-3">
                                                    {/* Star + searched badge */}
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <span className="text-[#F97316] text-sm">★</span>
                                                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                                            style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316', border: '1px solid rgba(249,115,22,0.3)' }}>
                                                            Buscado
                                                        </span>
                                                    </div>

                                                    {/* Slot info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-semibold text-white">
                                                                {isFamily ? '👤 Miembro:' : '🖥️'}
                                                                {' '}
                                                                <span className="text-[#F97316]">{svc.slot_identifier || '—'}</span>
                                                            </span>
                                                            {svc.pin_code && !isFamily && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#8b8ba7' }}>
                                                                    PIN: {svc.pin_code}
                                                                </span>
                                                            )}
                                                            {svc.is_combo && (
                                                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                                                    style={{ background: 'rgba(129,140,248,0.15)', color: '#818CF8', border: '1px solid rgba(129,140,248,0.3)' }}>
                                                                    Combo
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                            <span className="text-[11px]" style={{ color: '#8b8ba7' }}>
                                                                Vence: <span className="text-white">{formatDate(custExpiry)}</span>
                                                            </span>
                                                            {custDays !== null && (
                                                                <span className={`text-xs font-mono font-bold ${custDays <= 3 ? 'text-red-400' : custDays <= 7 ? 'text-yellow-400' : 'text-[#86EFAC]'}`}>
                                                                    {custDays}d
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-semibold text-[#86EFAC]">{formatGs(svc.amount)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <CopyButton size="xs" getText={() =>
                                                            `${svc.platform}\nUsuario: ${svc.account_email}\nClave: ${svc.account_password}${!isFamily ? `\nPantalla: ${svc.slot_identifier}` : ''}${svc.pin_code ? `\nPIN: ${svc.pin_code}` : ''}\nVence: ${formatDate(custExpiry)}\nPrecio: ${formatGs(svc.amount)}`
                                                        } />
                                                        <ExtendSaleModal
                                                            saleId={svc.sale_id}
                                                            currentEndDate={svc.sale_end_date || svc.renewal_date}
                                                            customerName={customer.title}
                                                            platform={svc.platform}
                                                            onSuccess={onSaved}
                                                        />
                                                        <button
                                                            onClick={() => onSwap(svc)}
                                                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                                                            style={{ background: 'rgba(249,115,22,0.1)', color: '#F97316' }}
                                                            title="Intercambiar servicio"
                                                        >
                                                            <Repeat className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Sort controls ─────────────────────────────────────────────── */

const sortFieldLabels: Record<SortField, string> = {
    platform: 'Plataforma',
    email: 'Usuario',
    password: 'Clave',
    sale_price_gs: 'P. Venta',
    renewal_date: 'Vencimiento',
    days: 'Días',
};

function SortBar({ sortField, sortDir, onSort, pageSize, onPageSize }: {
    sortField: SortField; sortDir: SortDir;
    onSort: (f: SortField) => void;
    pageSize: number; onPageSize: (n: number) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowUpDown className="h-3 w-3" /> Ordenar:
                </span>
                {(Object.keys(sortFieldLabels) as SortField[]).map(f => (
                    <button
                        key={f}
                        onClick={() => onSort(f)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${sortField === f
                            ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                            : 'bg-[#1a1a1a] text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {sortFieldLabels[f]}
                        {sortField === f && (
                            <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Mostrar:</span>
                {[10, 20, 50].map(n => (
                    <button
                        key={n}
                        onClick={() => onPageSize(n)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${pageSize === n
                            ? 'bg-[#818CF8]/20 text-[#818CF8]'
                            : 'bg-[#1a1a1a] text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function SearchResults({ query }: { query: string }) {
    const router = useRouter();
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pageSize, setPageSize] = useState(10);
    const [sortField, setSortField] = useState<SortField>('platform');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // Swap modal
    const [swapOpen, setSwapOpen] = useState(false);
    const [swapSvc, setSwapSvc] = useState<ServiceInfo | null>(null);
    const [swapCustId, setSwapCustId] = useState('');
    const [swapCustName, setSwapCustName] = useState('');

    const fetchResults = useCallback(() => {
        if (!query || query.length < 2) { setResults([]); setIsLoading(false); return; }
        setIsLoading(true);
        fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${pageSize}`)
            .then(r => r.json())
            .then(d => setResults(d.results || []))
            .catch(() => setResults([]))
            .finally(() => setIsLoading(false));
    }, [query, pageSize]);

    useEffect(() => { fetchResults(); }, [fetchResults]);

    const toggleSort = (f: SortField) => {
        if (sortField === f) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(f);
            setSortDir('asc');
        }
    };

    const handleSwap = (svc: ServiceInfo, custId: string, custName: string) => {
        setSwapSvc(svc); setSwapCustId(custId); setSwapCustName(custName); setSwapOpen(true);
    };

    const customers = results.filter(r => r.type === 'customer');
    const rawSuppliers = results.filter(r => r.type === 'supplier');

    // Group accounts: those whose supplier_name matches are shown under the supplier section
    // We detect a supplier search when all found accounts share the same supplier_name
    const allAccounts = results.filter(r => r.type === 'account');

    // Group by supplier_name
    const supplierAccountsMap = new Map<string, SearchResult[]>();
    const standaloneAccounts: SearchResult[] = [];

    allAccounts.forEach(acct => {
        const sn = acct.supplier_name?.trim();
        if (sn) {
            if (!supplierAccountsMap.has(sn)) supplierAccountsMap.set(sn, []);
            supplierAccountsMap.get(sn)!.push(acct);
        } else {
            standaloneAccounts.push(acct);
        }
    });

    // Only group into supplier sections when the query looks like a supplier search
    // (i.e. most accounts share the same supplier_name and it matches the query)
    const isSupplierSearch = supplierAccountsMap.size > 0 &&
        [...supplierAccountsMap.keys()].some(name =>
            name.toLowerCase().includes(query.toLowerCase())
        );

    // Accounts to show in supplier groups vs standalone accounts section
    const supplierGroups: { name: string; accounts: SearchResult[] }[] = [];
    const finalStandaloneAccounts: SearchResult[] = [...standaloneAccounts];

    if (isSupplierSearch) {
        supplierAccountsMap.forEach((accts, name) => {
            if (name.toLowerCase().includes(query.toLowerCase())) {
                supplierGroups.push({ name, accounts: accts });
            } else {
                finalStandaloneAccounts.push(...accts);
            }
        });
    } else {
        supplierAccountsMap.forEach((accts) => finalStandaloneAccounts.push(...accts));
    }

    // Sort standalone accounts
    const accounts = useMemo(() => {
        return finalStandaloneAccounts.sort((a, b) => {
            let va: any, vb: any;
            switch (sortField) {
                case 'platform': va = a.platform || ''; vb = b.platform || ''; break;
                case 'email': va = a.email || ''; vb = b.email || ''; break;
                case 'password': va = a.password || ''; vb = b.password || ''; break;
                case 'sale_price_gs': va = a.sale_price_gs || 0; vb = b.sale_price_gs || 0; break;
                case 'renewal_date': va = a.renewal_date || ''; vb = b.renewal_date || ''; break;
                case 'days': va = daysRemaining(a.renewal_date || ''); vb = daysRemaining(b.renewal_date || ''); break;
            }
            if (typeof va === 'string') {
                const cmp = va.localeCompare(vb);
                return sortDir === 'asc' ? cmp : -cmp;
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [results, sortField, sortDir, isSupplierSearch]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Breadcrumb query={query} />
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
                    <p className="text-muted-foreground">Buscando...</p>
                </div>
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="space-y-6">
                <Breadcrumb query={query} />
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1a1a]">
                        <SearchX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium">Sin resultados para &quot;{query}&quot;</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Breadcrumb query={query} />
                <span className="text-sm text-muted-foreground">{results.length} resultado{results.length > 1 ? 's' : ''}</span>
            </div>

            {/* ── SORT + PAGE SIZE CONTROLS ── */}
            {accounts.length > 0 && (
                <SortBar sortField={sortField} sortDir={sortDir} onSort={toggleSort} pageSize={pageSize} onPageSize={setPageSize} />
            )}

            {/* ── CUSTOMERS: Vista Jerárquica Inventario ── */}
            {customers.length > 0 && (
                <Section icon={<User className="h-3.5 w-3.5 text-[#F97316]" />} label="Clientes" count={customers.length} color="#F97316">
                    {customers.map(c => (
                        <CustomerInventoryView
                            key={c.id}
                            customer={c}
                            onSwap={(svc) => handleSwap(svc, c.id, c.title)}
                            onSaved={fetchResults}
                        />
                    ))}
                </Section>
            )}

            {/* ── ACCOUNTS ── */}
            {accounts.length > 0 && (
                <Section icon={<Monitor className="h-3.5 w-3.5 text-[#86EFAC]" />} label="Cuentas" count={accounts.length} color="#86EFAC">
                    {accounts.map(a => (
                        <AccountCard key={a.id} account={a} onRefresh={fetchResults} onSwapSlot={(slot, acct) => {
                            if (!slot.customer) return;
                            handleSwap({
                                sale_id: slot.customer.sale_id,
                                slot_id: slot.id,
                                platform: acct.platform || '',
                                slot_identifier: slot.identifier,
                                pin_code: slot.pin_code,
                                slot_status: slot.status,
                                account_email: acct.email || '',
                                account_password: acct.password || '',
                                mother_account_id: acct.id,
                                renewal_date: acct.renewal_date || '',
                                sale_type: acct.sale_type || 'profile',
                                sale_end_date: '',
                                amount: slot.customer.amount,
                                start_date: slot.customer.start_date || '',
                            }, slot.customer.customer_id, slot.customer.customer_name);
                        }} />
                    ))}
                </Section>
            )}

            {/* ── PROVEEDORES (grouped accounts by supplier_name) ── */}
            {supplierGroups.map(group => (
                <Section
                    key={group.name}
                    icon={<Truck className="h-3.5 w-3.5 text-[#818CF8]" />}
                    label={`Proveedor: ${group.name}`}
                    count={group.accounts.length}
                    color="#818CF8"
                >
                    {/* Summary header */}
                    <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[#818CF8]/5 border border-[#818CF8]/20">
                        <Truck className="h-4 w-4 text-[#818CF8] flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-[#818CF8]">{group.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {group.accounts.length} cuenta{group.accounts.length !== 1 ? 's' : ''} · {' '}
                                {group.accounts.reduce((s, a) => s + (a.availableSlots || 0), 0)} libres · {' '}
                                {group.accounts.reduce((s, a) => s + (a.soldSlots || 0), 0)} vendidos
                            </p>
                        </div>
                    </div>
                    {/* Accounts list (no slots visible) */}
                    {group.accounts
                        .sort((a, b) => (a.platform || '').localeCompare(b.platform || ''))
                        .map(a => (
                            <SupplierAccountRow key={a.id} account={a} onRefresh={fetchResults} />
                        ))}
                </Section>
            ))}

            {/* ── SUPPLIERS from table (basic cards) ── */}
            {rawSuppliers.length > 0 && (
                <Section icon={<Truck className="h-3.5 w-3.5 text-[#818CF8]" />} label="Proveedores" count={rawSuppliers.length} color="#818CF8">
                    {rawSuppliers.map(s => (
                        <Card key={s.id} className="border-border bg-card hover:border-[#818CF8]/30 transition-colors">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#818CF8]/20 flex-shrink-0">
                                        <Truck className="h-5 w-5 text-[#818CF8]" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">{s.title}</p>
                                        {s.subtitle && <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span>{s.subtitle}</span></div>}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </Section>
            )}

            {/* Swap Modal */}
            {swapSvc && (
                <SwapServiceModal
                    isOpen={swapOpen}
                    onClose={() => { setSwapOpen(false); setSwapSvc(null); }}
                    service={{
                        sale_id: swapSvc.sale_id, slot_id: swapSvc.slot_id,
                        platform: swapSvc.platform, slot: swapSvc.slot_identifier,
                        account_email: swapSvc.account_email, amount: swapSvc.amount,
                    }}
                    customerId={swapCustId}
                    customerName={swapCustName}
                    onSwapped={(newAccountEmail) => {
                        if (newAccountEmail) {
                            // "Ir al cliente": navigate to the new account
                            router.push(`/inventory?q=${encodeURIComponent(newAccountEmail)}`);
                        } else {
                            // "Quedarme aquí": just refresh current search results
                            fetchResults();
                        }
                    }}
                />
            )}
        </div>
    );
}

/* ── Sub-components ──────────────────────────────────────────── */

function Breadcrumb({ query }: { query: string }) {
    return (
        <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm">
                <ArrowLeft className="h-4 w-4" /> Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Resultados para &quot;{query}&quot;</span>
        </div>
    );
}

function Section({ icon, label, count, color, children }: {
    icon: React.ReactNode; label: string; count: number; color: string; children: React.ReactNode;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: `${color}20` }}>
                    {icon}
                </div>
                <h2 className="text-lg font-semibold">{label}</h2>
                <Badge variant="outline" className="text-xs" style={{ borderColor: `${color}40`, color }}>{count}</Badge>
            </div>
            <div className="grid gap-3">{children}</div>
        </div>
    );
}
