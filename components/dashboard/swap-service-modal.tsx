'use client';

import { useState, useEffect } from 'react';
import { Repeat, Loader2, Monitor, ChevronDown, UserCircle, AlertTriangle, Trash2, Shield, ArrowRight, Check, X, Copy, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { swapService, getAccountSiblings, bulkSwapAccountClients } from '@/lib/actions/sales';
import { quarantineAccount, deleteMotherAccount } from '@/lib/actions/inventory';

interface SwapServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: {
        sale_id: string;
        slot_id: string;
        platform: string;
        slot: string;
        account_email: string;
        amount: number;
    };
    customerId: string;
    customerName: string;
    onSwapped: (newAccountEmail?: string) => void;
}

interface AvailableSlot {
    id: string;
    identifier: string;
    platform: string;
    account_email: string;
    account_id: string;
}

interface SiblingInfo {
    sale_id: string;
    slot_id: string;
    slot_identifier: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    amount: number;
}

const platformColors: Record<string, string> = {
    Netflix: '#E50914',
    Spotify: '#1DB954',
    HBO: '#5c16c5',
    'HBO Max': '#5c16c5',
    'Disney+': '#0063e5',
    'Amazon Prime': '#00a8e1',
    'YouTube Premium': '#ff0000',
    'Apple TV+': '#555',
    Crunchyroll: '#F47521',
    'Paramount+': '#0064FF',
    'Star+': '#C724B1',
    Tidal: '#000',
};

type Step = 'select_slot' | 'post_swap';

import { createPortal } from 'react-dom';

export function SwapServiceModal({ isOpen, onClose, service, customerId, customerName, onSwapped }: SwapServiceModalProps) {
    const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSwapping, setIsSwapping] = useState(false);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [filterPlatform, setFilterPlatform] = useState<string>('all');

    // Post-swap state
    const [step, setStep] = useState<Step>('select_slot');
    const [siblings, setSiblings] = useState<SiblingInfo[]>([]);
    const [motherAccountId, setMotherAccountId] = useState('');
    const [swappedPlatform, setSwappedPlatform] = useState('');
    const [isBulkMoving, setIsBulkMoving] = useState(false);
    const [isQuarantining, setIsQuarantining] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [postSwapMessage, setPostSwapMessage] = useState('');
    const [accountActionDone, setAccountActionDone] = useState('');
    const [copied, setCopied] = useState(false);
    const [newAccountEmail, setNewAccountEmail] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        setSelectedSlotId(null);
        setError('');
        setFilterPlatform(service.platform || 'all');
        setStep('select_slot');
        setSiblings([]);
        setMotherAccountId('');
        setPostSwapMessage('');
        setAccountActionDone('');
        setConfirmDelete(false);
        setNewAccountEmail('');

        // Fetch available slots
        fetch('/api/search/available-slots')
            .then(res => res.json())
            .then(data => {
                const slots = data.slots || [];
                setAvailableSlots(slots);
                // Auto-select first slot matching the current platform filter
                const platformFilter = service.platform || 'all';
                const matching = platformFilter === 'all' ? slots : slots.filter((s: AvailableSlot) => s.platform === platformFilter);
                if (matching.length > 0) {
                    setSelectedSlotId(matching[0].id);
                }
            })
            .catch(err => {
                console.error('Error fetching slots:', err);
                setError('Error cargando slots disponibles');
            })
            .finally(() => setIsLoading(false));
    }, [isOpen, service.platform]);

    const handleSwap = async () => {
        if (!selectedSlotId) return;
        setIsSwapping(true);
        setError('');

        const result = await swapService({
            oldSaleId: service.sale_id,
            oldSlotId: service.slot_id,
            customerId,
            newSlotId: selectedSlotId,
        });

        if (result.error) {
            setError(result.error);
            setIsSwapping(false);
            return;
        }

        // Swap successful — check for siblings
        const maId = result.motherAccountId || '';
        const plat = result.platform || '';
        const newEmail = result.newAccountEmail || '';
        setMotherAccountId(maId);
        setSwappedPlatform(plat);
        setPostSwapMessage(result.message || 'Intercambio exitoso');

        if (maId) {
            const sibResult = await getAccountSiblings(maId, service.slot_id);
            setSiblings(sibResult.siblings || []);
        }

        setIsSwapping(false);
        setStep('post_swap');
        // Store new account email for redirect on finish
        setNewAccountEmail(newEmail);
    };

    const handleBulkMove = async () => {
        if (!motherAccountId) return;
        setIsBulkMoving(true);
        setError('');

        const result = await bulkSwapAccountClients(motherAccountId);
        if (result.error) {
            setError(result.error);
        } else {
            setSiblings([]);
            setPostSwapMessage(`${result.moved} cliente(s) movidos exitosamente`);
        }
        setIsBulkMoving(false);
    };

    const handleQuarantine = async () => {
        if (!motherAccountId) return;
        setIsQuarantining(true);
        setError('');

        const result = await quarantineAccount(motherAccountId);
        if (result.error) {
            setError(result.error);
        } else {
            setAccountActionDone('quarantine');
        }
        setIsQuarantining(false);
    };

    const handleDelete = async () => {
        if (!motherAccountId) return;
        setIsDeleting(true);
        setError('');

        const result = await deleteMotherAccount(motherAccountId);
        if (result.error) {
            setError(result.error);
        } else {
            setAccountActionDone('deleted');
        }
        setIsDeleting(false);
    };

    const handleFinish = (navigateToNew: boolean) => {
        onSwapped(navigateToNew ? (newAccountEmail || undefined) : undefined);
        onClose();
    };

    // Get unique platforms from available slots
    const platforms = [...new Set(availableSlots.map(s => s.platform))].sort();
    const filteredSlots = filterPlatform === 'all'
        ? availableSlots
        : availableSlots.filter(s => s.platform === filterPlatform);

    // Group slots by platform > account
    const grouped = new Map<string, Map<string, AvailableSlot[]>>();
    filteredSlots.forEach(slot => {
        if (!grouped.has(slot.platform)) grouped.set(slot.platform, new Map());
        const platformGroup = grouped.get(slot.platform)!;
        if (!platformGroup.has(slot.account_email)) platformGroup.set(slot.account_email, []);
        platformGroup.get(slot.account_email)!.push(slot);
    });

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && (step === 'post_swap' ? handleFinish(false) : onClose())}>
            <div className="w-full max-w-xl rounded-xl border border-border bg-[#0d0d0d] shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border p-5">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${step === 'post_swap' ? 'bg-[#86EFAC]/20' : 'bg-[#F97316]/20'}`}>
                            {step === 'post_swap' ? <Check className="h-5 w-5 text-[#86EFAC]" /> : <Repeat className="h-5 w-5 text-[#F97316]" />}
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                {step === 'post_swap' ? 'Intercambio Completado' : 'Intercambiar Servicio'}
                            </h2>
                            <p className="text-sm text-muted-foreground">{customerName}</p>
                        </div>
                    </div>
                    <button onClick={step === 'post_swap' ? () => handleFinish(false) : onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-[#222] transition-colors">
                        ✕
                    </button>
                </div>

                {/* ═══ STEP 1: SELECT SLOT ═══ */}
                {step === 'select_slot' && (
                    <>
                        {/* Current Service Info */}
                        <div className="px-5 py-3 border-b border-border bg-[#111]">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Servicio Actual</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: platformColors[service.platform] || '#86EFAC' }} />
                                    <span className="font-medium text-foreground">{service.platform}</span>
                                    {service.slot && <span className="text-sm text-muted-foreground">— {service.slot}</span>}
                                </div>
                                <Badge variant="outline" className="text-xs border-red-500/40 text-red-500">
                                    Se reemplazará
                                </Badge>
                            </div>
                        </div>

                        {/* Platform Filter */}
                        <div className="px-5 py-3 border-b border-border">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Nuevo servicio — seleccioná un slot disponible</p>
                            <div className="flex gap-1.5 flex-wrap">
                                <button
                                    onClick={() => {
                                        setFilterPlatform('all');
                                        if (availableSlots.length > 0) setSelectedSlotId(availableSlots[0].id);
                                    }}
                                    className={`rounded-md px-3 py-1 text-xs transition-colors ${filterPlatform === 'all' ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'text-muted-foreground hover:text-foreground hover:bg-[#222]'}`}
                                >
                                    Todas ({availableSlots.length})
                                </button>
                                {platforms.map(p => {
                                    const count = availableSlots.filter(s => s.platform === p).length;
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => {
                                                setFilterPlatform(p);
                                                const matching = availableSlots.filter(s => s.platform === p);
                                                if (matching.length > 0) setSelectedSlotId(matching[0].id);
                                            }}
                                            className={`rounded-md px-3 py-1 text-xs transition-colors ${filterPlatform === p ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'text-muted-foreground hover:text-foreground hover:bg-[#222]'}`}
                                        >
                                            {p} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Available Slots */}
                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            {isLoading && (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            )}

                            {!isLoading && filteredSlots.length === 0 && (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    No hay slots disponibles{filterPlatform !== 'all' ? ` para ${filterPlatform}` : ''}
                                </p>
                            )}

                            {!isLoading && Array.from(grouped.entries()).map(([platform, accounts]) => (
                                <div key={platform} className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: platformColors[platform] || '#86EFAC' }} />
                                        <span className="text-sm font-semibold text-foreground">{platform}</span>
                                    </div>
                                    {Array.from(accounts.entries()).map(([email, slots]) => (
                                        <div key={email} className="ml-4 mb-2">
                                            <p className="text-xs text-muted-foreground mb-1">{email}</p>
                                            <div className="space-y-1">
                                                {slots.map(slot => (
                                                    <button
                                                        key={slot.id}
                                                        onClick={() => setSelectedSlotId(slot.id)}
                                                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 border transition-all text-left ${selectedSlotId === slot.id
                                                            ? 'border-[#86EFAC] bg-[#86EFAC]/10'
                                                            : 'border-border/50 bg-[#111] hover:border-border hover:bg-[#1a1a1a]'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${selectedSlotId === slot.id ? 'border-[#86EFAC]' : 'border-muted-foreground/30'}`}>
                                                                {selectedSlotId === slot.id && <div className="w-1.5 h-1.5 rounded-full bg-[#86EFAC]" />}
                                                            </div>
                                                            <span className="text-sm text-foreground">{slot.identifier}</span>
                                                        </div>
                                                        <Badge variant="outline" className="text-[10px] border-[#86EFAC]/40 text-[#86EFAC] bg-[#86EFAC]/5">
                                                            Disponible
                                                        </Badge>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="px-5 py-2">
                                <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-border p-5">
                            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSwap}
                                disabled={!selectedSlotId || isSwapping}
                                className="flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#F97316]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSwapping ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Intercambiando...
                                    </>
                                ) : (
                                    <>
                                        <Repeat className="h-4 w-4" />
                                        Intercambiar Servicio
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                )}

                {/* ═══ STEP 2: POST-SWAP ═══ */}
                {step === 'post_swap' && (
                    <>
                        {/* Success message */}
                        <div className="px-5 py-4 border-b border-border bg-[#86EFAC]/5">
                            <div className="flex items-center gap-2 text-[#86EFAC]">
                                <Check className="h-4 w-4" />
                                <span className="text-sm font-medium">{postSwapMessage}</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                            {/* ── Other clients in same account ── */}
                            {siblings.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                        <span className="text-sm font-semibold text-yellow-500">
                                            {siblings.length} cliente{siblings.length > 1 ? 's' : ''} más en esta cuenta
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 mb-3">
                                        {siblings.map(sib => (
                                            <div key={sib.slot_id} className="flex items-center gap-3 rounded-md bg-[#111] px-3 py-2 border border-border/30">
                                                <UserCircle className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm text-foreground truncate block">{sib.customer_name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{sib.slot_identifier} · {sib.customer_phone}</span>
                                                </div>
                                                <span className="text-xs font-semibold text-[#86EFAC]">Gs. {sib.amount?.toLocaleString('es-PY')}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleBulkMove}
                                            disabled={isBulkMoving}
                                            className="flex items-center gap-1.5 rounded-lg bg-[#F97316]/10 px-4 py-2 text-sm font-medium text-[#F97316] hover:bg-[#F97316]/20 transition-colors disabled:opacity-50 flex-1 justify-center"
                                        >
                                            {isBulkMoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                                            Mover todos a otra cuenta
                                        </button>
                                        <button
                                            onClick={() => setSiblings([])}
                                            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-[#222] transition-colors"
                                        >
                                            Dejar por ahora
                                        </button>
                                    </div>
                                </div>
                            )}

                            {siblings.length === 0 && !accountActionDone && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-[#111] rounded-lg px-3 py-2">
                                    <Check className="h-4 w-4 text-[#86EFAC]" />
                                    No hay otros clientes en esta cuenta
                                </div>
                            )}

                            {/* ── Account action ── */}
                            {motherAccountId && !accountActionDone && (
                                <div className="border-t border-border/30 pt-4">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold">
                                        ¿Qué hacer con la cuenta origen?
                                    </p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={handleQuarantine}
                                            disabled={isQuarantining || isDeleting}
                                            className="w-full flex items-center gap-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-4 py-3 text-left hover:bg-yellow-500/10 transition-colors disabled:opacity-50"
                                        >
                                            {isQuarantining ? <Loader2 className="h-5 w-5 animate-spin text-yellow-500" /> : <Shield className="h-5 w-5 text-yellow-500 flex-shrink-0" />}
                                            <div>
                                                <span className="text-sm font-medium text-yellow-500 block">Cuarentena</span>
                                                <span className="text-[11px] text-muted-foreground">Bloquear la cuenta. Si se soluciona, se puede reactivar.</span>
                                            </div>
                                        </button>
                                        {!confirmDelete ? (
                                            <button
                                                onClick={() => setConfirmDelete(true)}
                                                disabled={isQuarantining || isDeleting}
                                                className="w-full flex items-center gap-3 rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3 text-left hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                            >
                                                <Trash2 className="h-5 w-5 text-red-500 flex-shrink-0" />
                                                <div>
                                                    <span className="text-sm font-medium text-red-500 block">Eliminar cuenta</span>
                                                    <span className="text-[11px] text-muted-foreground">Eliminar permanentemente la cuenta y sus slots.</span>
                                                </div>
                                            </button>
                                        ) : (
                                            <div className="w-full flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
                                                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                                                <span className="text-sm text-red-400 flex-1">¿Estás seguro? Esto es irreversible.</span>
                                                <button
                                                    onClick={handleDelete}
                                                    disabled={isDeleting}
                                                    className="flex items-center gap-1 rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                                >
                                                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí, eliminar'}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(false)}
                                                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    No
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Account action done */}
                            {accountActionDone && (
                                <div className="border-t border-border/30 pt-4">
                                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${accountActionDone === 'quarantine' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-400'}`}>
                                        {accountActionDone === 'quarantine' ? <Shield className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                        <span className="text-sm font-medium">
                                            {accountActionDone === 'quarantine' ? 'Cuenta puesta en cuarentena' : 'Cuenta eliminada'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="px-5 py-2">
                                <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-border p-5">
                            <button
                                onClick={() => {
                                    const now = new Date();
                                    const fecha = now.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                    const text = [
                                        `🔄 *Intercambio de Servicio*`,
                                        `👤 Cliente: ${customerName}`,
                                        `📦 Plataforma: ${service.platform}`,
                                        `📧 Cuenta anterior: ${service.account_email}`,
                                        `✅ ${postSwapMessage}`,
                                        `📅 Fecha: ${fecha}`,
                                    ].join('\n');
                                    navigator.clipboard.writeText(text).then(() => {
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    });
                                }}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${copied ? 'bg-[#86EFAC]/10 text-[#86EFAC]' : 'bg-[#222] text-muted-foreground hover:text-foreground hover:bg-[#333]'}`}
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? '¡Copiado!' : 'Copiar Datos'}
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleFinish(false)}
                                    className="flex items-center gap-2 rounded-lg bg-[#222] px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[#333] transition-colors"
                                >
                                    <Check className="h-4 w-4" />
                                    Quedarme aquí
                                </button>
                                {newAccountEmail && (
                                    <button
                                        onClick={() => handleFinish(true)}
                                        className="flex items-center gap-2 rounded-lg bg-[#86EFAC]/10 px-5 py-2 text-sm font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Ir al cliente
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>, document.body
    );
}
