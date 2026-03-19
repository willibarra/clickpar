'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    ShoppingCart,
    CheckCircle,
    Loader2,
    Edit3,
    Plus,
    Search,
    Package,
    Layers,
    MousePointer2,
    Trash2,
    AlertCircle,
    Copy,
    Check,
    Calendar,
    UserPlus,
    X
} from 'lucide-react';
import { SlotSelectorModal } from './slot-selector-modal';
import { createClient } from '@/lib/supabase/client';

interface SelectedCustomer {
    id: string;
    full_name: string;
    phone: string;
}

interface Platform {
    id: string;
    name: string;
    color: string;
    icon_letter: string;
    price?: number;
}

interface ComboItem {
    id: string; // unique row key
    platform: string;
    quantity: number;
}

interface QuickSaleWidgetProps {
    platforms: Platform[];
    preselect?: { platform: string; slotId: string } | null;
}

type SaleMode = 'individual' | 'combo';

export function QuickSaleWidget({ platforms, preselect }: QuickSaleWidgetProps) {
    // Mode toggle
    const [saleMode, setSaleMode] = useState<SaleMode>('individual');

    // Individual mode state
    const [selectedPlatform, setSelectedPlatform] = useState<string>('');
    const [price, setPrice] = useState<number>(25000);
    const [isOverridePrice, setIsOverridePrice] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'select' | 'customer' | 'confirm'>('select');
    const [showManualAssign, setShowManualAssign] = useState(false);
    const [saleComplete, setSaleComplete] = useState(false);
    const [showSlotModal, setShowSlotModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState('');

    // Customer search state
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState<SelectedCustomer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerPhone, setNewCustomerPhone] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);

    const supabase = createClient();

    // Handle preselect from sell-from-slot
    useEffect(() => {
        if (!preselect || !preselect.platform) return;
        const platform = platforms.find(p => p.name === preselect.platform);
        if (platform) {
            setSelectedPlatform(platform.name);
            setPrice(platform.price || 25000);
            setStep('customer');
            // If we have a slotId, pre-assign the slot
            if (preselect.slotId) {
                setShowManualAssign(true);
                setSelectedSlot({ id: preselect.slotId, mother_account: { email: '(prellenado)' }, slot_identifier: 'Asignado desde inventario' });
            }
        }
    }, [preselect, platforms]);

    // Combo mode state
    const [comboItems, setComboItems] = useState<ComboItem[]>([]);
    const [comboPrice, setComboPrice] = useState<number>(0);

    // Suggested price for combo (sum of individual platform prices)
    const suggestedComboPrice = useMemo(() => {
        return comboItems.reduce((total, item) => {
            const p = platforms.find(pl => pl.name === item.platform);
            return total + (p?.price || 25000) * item.quantity;
        }, 0);
    }, [comboItems, platforms]);

    // Combo items management
    const addComboItem = () => {
        // Default to first platform not already in list, or first platform
        const usedPlatforms = comboItems.map(ci => ci.platform);
        const available = platforms.find(p => !usedPlatforms.includes(p.name));
        setComboItems([...comboItems, {
            id: crypto.randomUUID(),
            platform: available?.name || platforms[0]?.name || '',
            quantity: 1
        }]);
    };

    const removeComboItem = (id: string) => {
        setComboItems(comboItems.filter(ci => ci.id !== id));
    };

    const updateComboItem = (id: string, field: 'platform' | 'quantity', value: string | number) => {
        setComboItems(comboItems.map(ci =>
            ci.id === id ? { ...ci, [field]: value } : ci
        ));
    };

    const handlePlatformSelect = (platform: Platform) => {
        setSelectedPlatform(platform.name);
        setPrice(platform.price || 25000);
        setStep('customer');
    };

    const handleComboNext = () => {
        if (comboItems.length === 0) return;
        // Set suggested price if user hasn't changed it
        if (comboPrice === 0) {
            setComboPrice(suggestedComboPrice);
        }
        setStep('customer');
    };

    // Debounced customer search
    useEffect(() => {
        if (!customerSearch.trim() || customerSearch.trim().length < 2) {
            setCustomerResults([]);
            return;
        }
        const timeout = setTimeout(async () => {
            setSearchLoading(true);
            const q = customerSearch.trim().toLowerCase();
            // If query looks like a phone (digits, spaces, +), normalize for DB search
            const digits = q.replace(/\D/g, '');
            const isPhoneQuery = digits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
            const phoneQ = isPhoneQuery ? digits : q;
            const { data } = await (supabase.from('customers') as any)
                .select('id, full_name, phone')
                .or(`full_name.ilike.%${q}%,phone.ilike.%${phoneQ}%`)
                .limit(8);
            setCustomerResults(data || []);
            setSearchLoading(false);
        }, 300);
        return () => clearTimeout(timeout);
    }, [customerSearch]);

    const handleSelectCustomer = (c: SelectedCustomer) => {
        setSelectedCustomer(c);
        setCustomerSearch('');
        setCustomerResults([]);
    };

    const handleCreateInlineCustomer = async () => {
        if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;
        setSearchLoading(true);
        try {
            const { normalizePhone } = await import('@/lib/utils/phone');
            const phone = normalizePhone(newCustomerPhone);
            const { data, error } = await (supabase.from('customers') as any)
                .insert({ full_name: newCustomerName.trim(), phone })
                .select('id, full_name, phone')
                .single();
            if (error) {
                setErrorMsg(`Error creando cliente: ${error.message}`);
                setSearchLoading(false);
                return;
            }
            setSelectedCustomer(data);
            setShowNewCustomerForm(false);
            setNewCustomerName('');
            setNewCustomerPhone('');
        } catch (e: any) {
            setErrorMsg(e.message || 'Error creando cliente');
        }
        setSearchLoading(false);
    };

    const handleCustomerNext = () => {
        if (selectedCustomer) {
            setStep('confirm');
        }
    };

    const handleSale = async () => {
        setIsLoading(true);
        setErrorMsg(null);

        try {
            if (!selectedCustomer) {
                setErrorMsg('Selecciona o crea un cliente');
                setIsLoading(false);
                return;
            }

            if (saleMode === 'combo') {
                const { processComboSale } = await import('@/lib/actions/sales');
                const result = await processComboSale({
                    items: comboItems.map(ci => ({ platform: ci.platform, quantity: ci.quantity })),
                    customerPhone: selectedCustomer.phone,
                    customerName: selectedCustomer.full_name || undefined,
                    totalPrice: comboPrice,
                    deliveryDate: deliveryDate || undefined,
                });

                if (result.error) {
                    setErrorMsg(result.error);
                    setIsLoading(false);
                    return;
                }
            } else {
                const { createQuickSale } = await import('@/lib/actions/sales');
                const result = await createQuickSale({
                    platform: selectedPlatform,
                    customerPhone: selectedCustomer.phone,
                    customerName: selectedCustomer.full_name || undefined,
                    customerId: selectedCustomer.id,
                    price,
                    platformPrice: price,
                    specificSlotId: selectedSlot?.id,
                    deliveryDate: deliveryDate || undefined,
                });

                if (result.error) {
                    setErrorMsg(result.error);
                    setIsLoading(false);
                    return;
                }
            }

            setSaleComplete(true);
            setIsLoading(false);

        } catch (error) {
            console.error(error);
            setErrorMsg('Error inesperado procesando la venta');
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setStep('select');
        setSelectedPlatform('');
        setSelectedCustomer(null);
        setCustomerSearch('');
        setCustomerResults([]);
        setShowNewCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setPrice(25000);
        setIsOverridePrice(false);
        setSaleComplete(false);
        setShowManualAssign(false);
        setSelectedSlot(null);
        setComboItems([]);
        setComboPrice(0);
        setErrorMsg('');
        setDeliveryDate('');
    };

    const getComboLabel = () => {
        return comboItems.map(ci => `${ci.quantity}x ${ci.platform}`).join(' + ');
    };

    const getSaleName = () => {
        if (saleMode === 'combo') {
            return getComboLabel();
        }
        return selectedPlatform;
    };

    const getFinalPrice = () => {
        return saleMode === 'combo' ? comboPrice : price;
    };

    const handleCopyData = () => {
        const now = new Date();
        const fecha = now.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const text = [
            `✅ *Venta Registrada*`,
            `📦 Servicio: ${getSaleName()}`,
            `👤 Cliente: ${selectedCustomer?.full_name || ''}`,
            `📱 Teléfono: ${selectedCustomer?.phone || ''}`,
            `💰 Precio: Gs. ${getFinalPrice().toLocaleString('es-PY')}`,
            `📅 Fecha: ${fecha}`,
        ].join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (saleComplete) {
        return (
            <Card className="border-[#86EFAC]/50 bg-gradient-to-br from-[#86EFAC]/10 to-[#1a1a1a]">
                <CardContent className="flex flex-col items-center justify-center py-8">
                    <CheckCircle className="h-16 w-16 text-[#86EFAC] animate-pulse" />
                    <h3 className="mt-4 text-xl font-bold text-foreground">¡Venta Registrada!</h3>
                    <p className="mt-2 text-muted-foreground text-center">
                        {getSaleName()} → {selectedCustomer?.full_name || selectedCustomer?.phone || ''}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#86EFAC]">
                        Gs. {getFinalPrice().toLocaleString('es-PY')}
                    </p>
                    <div className="flex gap-2 mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyData}
                            className={`gap-2 transition-all ${copied ? 'border-[#86EFAC] text-[#86EFAC]' : ''}`}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? '¡Copiado!' : 'Copiar Datos'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleReset}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/80 gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Nueva Venta
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border bg-gradient-to-br from-[#86EFAC]/5 to-[#1a1a1a]">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ShoppingCart className="h-5 w-5 text-[#86EFAC]" />
                        Venta Rápida
                    </CardTitle>
                    {/* Mode Toggle */}
                    <div className="flex rounded-lg bg-[#1a1a1a] p-1">
                        <button
                            onClick={() => { setSaleMode('individual'); handleReset(); }}
                            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${saleMode === 'individual'
                                ? 'bg-[#86EFAC] text-black'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Package className="h-3 w-3" />
                            Individual
                        </button>
                        <button
                            onClick={() => { setSaleMode('combo'); handleReset(); }}
                            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${saleMode === 'combo'
                                ? 'bg-[#F97316] text-white'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Layers className="h-3 w-3" />
                            Combo
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Error Display */}
                {errorMsg && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Step 1: Selection (Platform or Combo Builder) */}
                {step === 'select' && (
                    <div className="space-y-3">
                        {saleMode === 'individual' ? (
                            <>
                                <p className="text-sm text-muted-foreground">Selecciona una plataforma:</p>
                                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                                    {platforms.map((platform) => (
                                        <button
                                            key={platform.id}
                                            onClick={() => handlePlatformSelect(platform)}
                                            className="flex flex-col items-center gap-1 rounded-lg border border-border bg-[#1a1a1a] p-3 transition-all hover:border-[#86EFAC] hover:bg-[#86EFAC]/10"
                                        >
                                            <div
                                                className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-bold"
                                                style={{ backgroundColor: platform.color }}
                                            >
                                                {platform.icon_letter}
                                            </div>
                                            <span className="text-xs text-foreground truncate w-full text-center">
                                                {platform.name}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            /* ======= COMBO BUILDER ======= */
                            <>
                                <p className="text-sm text-muted-foreground">Arma el combo de plataformas:</p>

                                {/* Dynamic combo items list */}
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {comboItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-2 rounded-lg border border-border bg-[#1a1a1a] p-2"
                                        >
                                            {/* Platform selector */}
                                            <select
                                                value={item.platform}
                                                onChange={(e) => updateComboItem(item.id, 'platform', e.target.value)}
                                                className="flex-1 rounded-md bg-card border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                                            >
                                                {platforms.map(p => (
                                                    <option key={p.id} value={p.name}>{p.name}</option>
                                                ))}
                                            </select>

                                            {/* Quantity input */}
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground">Qty:</span>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={10}
                                                    value={item.quantity}
                                                    onChange={(e) => updateComboItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                                    className="w-14 h-8 text-center text-sm px-1"
                                                />
                                            </div>

                                            {/* Remove button */}
                                            <button
                                                onClick={() => removeComboItem(item.id)}
                                                className="rounded-md p-1.5 text-red-400 hover:bg-red-400/10 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add platform button */}
                                <button
                                    onClick={addComboItem}
                                    className="w-full rounded-lg border border-dashed border-[#F97316]/40 bg-[#F97316]/5 p-2.5 text-sm text-[#F97316] hover:bg-[#F97316]/10 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    Agregar Plataforma
                                </button>

                                {/* Suggested price preview */}
                                {comboItems.length > 0 && (
                                    <div className="rounded-lg bg-[#1a1a1a] p-3 space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Items:</span>
                                            <span className="text-foreground font-medium">
                                                {getComboLabel()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Precio sugerido:</span>
                                            <span className="text-[#F97316] font-medium">
                                                Gs. {suggestedComboPrice.toLocaleString('es-PY')}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Next button */}
                                <Button
                                    onClick={handleComboNext}
                                    disabled={comboItems.length === 0}
                                    className="w-full bg-[#F97316] hover:bg-[#F97316]/80 text-white"
                                >
                                    Siguiente
                                </Button>
                            </>
                        )}
                    </div>
                )}

                {/* Step 2: Customer Info */}
                {step === 'customer' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            {saleMode === 'individual' ? (
                                <>
                                    <div
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-bold"
                                        style={{ backgroundColor: platforms.find(p => p.name === selectedPlatform)?.color || '#666' }}
                                    >
                                        {platforms.find(p => p.name === selectedPlatform)?.icon_letter || 'X'}
                                    </div>
                                    <span className="font-medium text-foreground">{selectedPlatform}</span>
                                </>
                            ) : (
                                <>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F97316] text-white text-sm font-bold">
                                        <Layers className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <span className="font-medium text-foreground text-sm">{getComboLabel()}</span>
                                        <p className="text-xs text-[#F97316]">
                                            Gs. {comboPrice.toLocaleString('es-PY')}
                                        </p>
                                    </div>
                                </>
                            )}
                            <button
                                onClick={() => setStep('select')}
                                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                            >
                                Cambiar
                            </button>
                        </div>

                        {/* Cliente — buscador unificado */}
                        <div className="space-y-2">
                            <label className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Cliente</span>
                                {!showNewCustomerForm && !selectedCustomer && (
                                    <button
                                        onClick={() => setShowNewCustomerForm(true)}
                                        className="flex items-center gap-1 text-xs text-[#86EFAC] hover:text-[#86EFAC]/80"
                                    >
                                        <UserPlus className="h-3 w-3" />
                                        Nuevo Cliente
                                    </button>
                                )}
                            </label>

                            {showNewCustomerForm ? (
                                <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">Nuevo Cliente</span>
                                        <button onClick={() => setShowNewCustomerForm(false)}>
                                            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                        </button>
                                    </div>
                                    <Input
                                        placeholder="Nombre completo"
                                        value={newCustomerName}
                                        onChange={(e) => setNewCustomerName(e.target.value)}
                                        className="text-sm"
                                    />
                                    <Input
                                        placeholder="Teléfono (ej: 981123456)"
                                        value={newCustomerPhone}
                                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                                        className="text-sm"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                        onClick={handleCreateInlineCustomer}
                                        disabled={searchLoading || !newCustomerName.trim() || !newCustomerPhone.trim()}
                                    >
                                        {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear Cliente'}
                                    </Button>
                                </div>
                            ) : selectedCustomer ? (
                                <div className="flex items-center justify-between p-3 rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/5">
                                    <div>
                                        <p className="font-medium text-foreground text-sm">{selectedCustomer.full_name}</p>
                                        <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                                    </div>
                                    <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>
                                        <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por nombre o teléfono..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className="pl-10"
                                    />
                                    {customerSearch.trim().length >= 2 && (
                                        <div className="absolute z-10 w-full mt-1 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                                            {searchLoading ? (
                                                <div className="px-3 py-3 text-center">
                                                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                                                </div>
                                            ) : customerResults.length > 0 ? (
                                                customerResults.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        className="w-full px-3 py-2 text-left hover:bg-muted/50 flex justify-between items-center"
                                                        onClick={() => handleSelectCustomer(c)}
                                                    >
                                                        <span className="font-medium text-sm">{c.full_name}</span>
                                                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-3 py-3 text-center text-muted-foreground">
                                                    <p className="text-sm">No se encontraron clientes</p>
                                                    <button
                                                        type="button"
                                                        className="text-xs text-[#86EFAC] mt-1 hover:underline flex items-center gap-1 mx-auto"
                                                        onClick={() => {
                                                            setShowNewCustomerForm(true);
                                                            setNewCustomerName(customerSearch);
                                                        }}
                                                    >
                                                        <UserPlus className="h-3 w-3" />
                                                        Crear nuevo cliente
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Fecha de Entrega (optional) */}
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                Fecha de Entrega
                                <span className="text-muted-foreground/50">(opcional)</span>
                            </label>
                            <Input
                                type="date"
                                value={deliveryDate}
                                onChange={(e) => setDeliveryDate(e.target.value)}
                                className="text-sm"
                            />
                            {deliveryDate && (
                                <p className="text-xs text-[#86EFAC]">
                                    ✓ Vence el {new Date(deliveryDate + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setStep('select')}
                                className="flex-1"
                            >
                                Atrás
                            </Button>
                            <Button
                                onClick={handleCustomerNext}
                                disabled={!selectedCustomer}
                                className={`flex-1 ${saleMode === 'combo' ? 'bg-[#F97316] hover:bg-[#F97316]/80' : 'bg-[#86EFAC] hover:bg-[#86EFAC]/80'} text-black`}
                            >
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Confirm & Price */}
                {step === 'confirm' && (
                    <div className="space-y-4">
                        <div className="rounded-lg bg-[#1a1a1a] p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {saleMode === 'individual' ? (
                                        <div
                                            className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-bold"
                                            style={{ backgroundColor: platforms.find(p => p.name === selectedPlatform)?.color || '#666' }}
                                        >
                                            {platforms.find(p => p.name === selectedPlatform)?.icon_letter || 'X'}
                                        </div>
                                    ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F97316] text-white">
                                            <Layers className="h-4 w-4" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-medium text-foreground">{getSaleName()}</p>
                                        <p className="text-sm text-muted-foreground">{selectedCustomer?.full_name || ''} · {selectedCustomer?.phone || ''}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Price section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-muted-foreground">
                                    {saleMode === 'combo' ? 'Precio Total del Combo:' : 'Precio:'}
                                </label>
                                {saleMode === 'individual' && (
                                    <button
                                        onClick={() => setIsOverridePrice(!isOverridePrice)}
                                        className="flex items-center gap-1 text-xs text-[#86EFAC] hover:underline"
                                    >
                                        <Edit3 className="h-3 w-3" />
                                        {isOverridePrice ? 'Usar precio sugerido' : 'Editar precio'}
                                    </button>
                                )}
                            </div>
                            {saleMode === 'combo' ? (
                                /* Combo: always editable */
                                <div className="space-y-1">
                                    <Input
                                        type="number"
                                        value={comboPrice}
                                        onChange={(e) => setComboPrice(Number(e.target.value))}
                                        className="text-lg font-bold"
                                    />
                                    {comboPrice !== suggestedComboPrice && (
                                        <button
                                            onClick={() => setComboPrice(suggestedComboPrice)}
                                            className="text-xs text-muted-foreground hover:text-[#F97316]"
                                        >
                                            Sugerido: Gs. {suggestedComboPrice.toLocaleString('es-PY')}
                                        </button>
                                    )}
                                </div>
                            ) : isOverridePrice ? (
                                <Input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    className="text-lg font-bold"
                                />
                            ) : (
                                <div className="text-2xl font-bold text-[#86EFAC]">
                                    Gs. {price.toLocaleString('es-PY')}
                                </div>
                            )}
                        </div>

                        {/* Manual Assignment Toggle (only for individual) */}
                        {saleMode === 'individual' && (
                            <>
                                <button
                                    onClick={() => setShowManualAssign(!showManualAssign)}
                                    className="w-full rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground hover:border-[#86EFAC] hover:text-foreground"
                                >
                                    <Edit3 className="mr-2 inline h-4 w-4" />
                                    {showManualAssign ? 'Usar asignación automática (Tetris)' : 'Seleccionar slot manualmente'}
                                </button>

                                {showManualAssign && (
                                    <div className="rounded-lg bg-[#1a1a1a] p-3 space-y-2">
                                        {selectedSlot ? (
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-[#86EFAC]">
                                                        <MousePointer2 className="inline h-3 w-3 mr-1" />
                                                        {selectedSlot.mother_account?.email}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Perfil: {selectedSlot.slot_identifier || 'Sin nombre'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setShowSlotModal(true)}
                                                    className="text-xs text-[#86EFAC] hover:underline"
                                                >
                                                    Cambiar
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowSlotModal(true)}
                                                className="w-full rounded-lg bg-[#86EFAC]/10 border border-[#86EFAC]/30 p-3 text-sm text-[#86EFAC] hover:bg-[#86EFAC]/20"
                                            >
                                                <MousePointer2 className="inline h-4 w-4 mr-2" />
                                                Elegir cuenta y perfil
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Combo detail breakdown */}
                        {saleMode === 'combo' && (
                            <div className="rounded-lg bg-[#1a1a1a] p-3 space-y-1.5">
                                <p className="text-xs text-muted-foreground font-medium">Detalle del combo:</p>
                                {comboItems.map((item) => {
                                    const plt = platforms.find(p => p.name === item.platform);
                                    return (
                                        <div key={item.id} className="flex items-center gap-2 text-sm">
                                            <div
                                                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                                style={{ backgroundColor: plt?.color || '#666' }}
                                            >
                                                {plt?.icon_letter || '?'}
                                            </div>
                                            <span className="text-foreground">{item.quantity}x {item.platform}</span>
                                            <span className="ml-auto text-xs text-muted-foreground">
                                                Asignación automática
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setStep('customer')}
                                className="flex-1"
                            >
                                Atrás
                            </Button>
                            <Button
                                onClick={handleSale}
                                disabled={isLoading || (saleMode === 'combo' && comboPrice <= 0)}
                                className={`flex-1 ${saleMode === 'combo' ? 'bg-[#F97316] hover:bg-[#F97316]/80' : 'bg-[#86EFAC] hover:bg-[#86EFAC]/80'} text-black`}
                            >
                                {isLoading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
                                ) : saleMode === 'combo' ? (
                                    <><Layers className="mr-2 h-4 w-4" /> Vender Combo</>
                                ) : (
                                    <><Plus className="mr-2 h-4 w-4" /> Confirmar Venta</>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            {/* Slot Selector Modal */}
            <SlotSelectorModal
                isOpen={showSlotModal}
                platform={selectedPlatform}
                onClose={() => setShowSlotModal(false)}
                onSelect={(slot) => {
                    setSelectedSlot(slot);
                    setShowSlotModal(false);
                }}
            />
        </Card>
    );
}
