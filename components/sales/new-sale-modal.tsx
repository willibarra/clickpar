'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, DollarSign, AlertCircle, Search, UserPlus, Check, X, Copy, Package, Users, MessageCircle } from 'lucide-react';
import { createQuickSale, createFullAccountSale } from '@/lib/actions/sales';
import { createClient } from '@/lib/supabase/client';
import { SlotPicker } from './slot-picker';
import { SlotWithAccount } from '@/lib/utils/tetris-algorithm';
import { normalizePhone, safeNormalizePhone } from '@/lib/utils/phone';
import { getWhatsAppInstanceConfig, type WhatsAppInstanceConfig } from '@/lib/actions/whatsapp-config';

/**
 * Returns the number of days from today until the same calendar day next month.
 * Example: March 6 → April 6 = 31 days (March has 31 days)
 * Handles edge cases: Jan 31 → Feb 28 = 28 days
 */
function daysUntilSameDayNextMonth(): number {
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const diff = next.getTime() - today.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
}


interface DBPlatform {
    id: string;
    name: string;
    default_slot_price_gs: number | null;
    business_type: string;
}

interface Customer {
    id: string;
    full_name: string;
    phone: string;
    customer_type?: string;
    whatsapp_instance?: string | null;
}



interface FullAccount {
    id: string;
    platform: string;
    email: string;
    max_slots: number;
    renewal_date: string;
}

interface NewSaleModalProps {
    // Props opcionales para control externo (ej: desde Venta Rápida)
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    preselectedPlatform?: string;
}

export function NewSaleModal({ open: externalOpen, onOpenChange: externalOnOpenChange, preselectedPlatform }: NewSaleModalProps = {}) {
    const [internalOpen, setInternalOpen] = useState(false);

    // Usar estado externo si se provee, si no usar estado interno
    const open = externalOpen !== undefined ? externalOpen : internalOpen;
    const setOpen = (val: boolean) => {
        setInternalOpen(val);
        externalOnOpenChange?.(val);
    };
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [allSlots, setAllSlots] = useState<SlotWithAccount[]>([]);
    const [dbPlatforms, setDbPlatforms] = useState<DBPlatform[]>([]);
    const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
    const [fullAccounts, setFullAccounts] = useState<FullAccount[]>([]);

    // Sale mode: 'profile' | 'full'
    const [saleMode, setSaleMode] = useState<'profile' | 'full'>('profile');

    // Customer search & selection
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerPhone, setNewCustomerPhone] = useState('');
    const [creatingCustomer, setCreatingCustomer] = useState(false);

    // WhatsApp instance state
    const [waConfig, setWaConfig] = useState<WhatsAppInstanceConfig | null>(null);
    const [selectedWaInstance, setSelectedWaInstance] = useState<string | null>(null);

    // Form state
    const [selectedPlatform, setSelectedPlatform] = useState<string>('');
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [selectedFullAccountId, setSelectedFullAccountId] = useState<string>('');
    const [salePrice, setSalePrice] = useState<string>('');
    const [defaultPrice, setDefaultPrice] = useState<number | null>(null);
    const [duration, setDuration] = useState<string>(String(daysUntilSameDayNextMonth()));
    const [priceOverridden, setPriceOverridden] = useState(false);
    const [isCreadorCustomer, setIsCreadorCustomer] = useState(false);

    // Family account fields
    const [familyAccessType, setFamilyAccessType] = useState<'credentials' | 'invite'>('credentials');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPassword, setClientPassword] = useState('');
    const [saleInstructions, setSaleInstructions] = useState<string | null>(null);
    const [saleCredentials, setSaleCredentials] = useState<{
        email?: string;
        password?: string;
        profile?: string;
        pin?: string;
        expirationDate?: string;
        clientEmail?: string;
        clientPassword?: string;
        familyAccessType?: string;
    } | null>(null);


    const supabase = createClient();

    // Preseleccionar plataforma cuando se abre con preselectedPlatform
    useEffect(() => {
        if (open && preselectedPlatform) {
            setSelectedPlatform(preselectedPlatform);
        }
        if (!open) {
            // reset interno cuando se cierra
        }
    }, [open, preselectedPlatform]);

    // Fetch WhatsApp instance config
    useEffect(() => {
        getWhatsAppInstanceConfig().then(setWaConfig);
    }, []);

    useEffect(() => {
        if (open) {
            // Fetch customers
            supabase
                .from('customers')
                .select('id, full_name, phone, customer_type, whatsapp_instance')
                .order('full_name', { ascending: true })
                .then(({ data }) => setCustomers((data as Customer[]) || []));

            supabase
                .from('platforms')
                .select('id, name, default_slot_price_gs, business_type')
                .eq('is_active', true)
                .order('name')
                .then(({ data }) => setDbPlatforms((data as DBPlatform[]) || []));

            // Fetch available slots & determine which platforms have stock
            supabase
                .from('sale_slots')
                .select(`
                    id, slot_identifier, status,
                    mother_accounts:mother_account_id (
                        id, platform, email, renewal_date, 
                        target_billing_day, max_slots, status, deleted_at
                    )
                `)
                .eq('status', 'available')
                .then(({ data }) => {
                    const slots = (data || []) as any[];
                    // Filter out slots whose mother account is deleted or not active
                    const validSlots = slots.filter((slot: any) => {
                        const acct = slot.mother_accounts;
                        if (!acct) return false;
                        if (acct.deleted_at) return false;
                        if (acct.status !== 'active') return false;
                        return true;
                    });
                    const slotsWithPrice = validSlots.map((slot: any) => ({
                        ...slot,
                        mother_accounts: slot.mother_accounts ? {
                            ...slot.mother_accounts,
                            default_slot_price_gs: 30000,
                        } : null,
                    }));
                    setAllSlots(slotsWithPrice as SlotWithAccount[]);

                    // Extract unique platforms that have available slots
                    const platformsWithStock = [...new Set(
                        validSlots
                            .map((s: any) => s.mother_accounts?.platform)
                            .filter(Boolean) as string[]
                    )];
                    setAvailablePlatforms(platformsWithStock);
                });

            // Fetch full accounts (all slots available)
            supabase
                .from('mother_accounts' as any)
                .select('id, platform, email, max_slots, renewal_date, deleted_at, sale_slots (id, status)')
                .eq('status', 'active')
                .is('deleted_at', null)
                .then(({ data }) => {
                    const full = ((data || []) as any[]).filter((acct: any) => {
                        const slots = acct.sale_slots || [];
                        return slots.length > 0 && slots.every((s: any) => s.status === 'available');
                    });
                    setFullAccounts(full as FullAccount[]);
                });
        }
    }, [open]);

    // Filter customers based on search
    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return [];
        const search = customerSearch.toLowerCase();
        const searchDigits = search.replace(/\D/g, '');
        const normalizedSearch = searchDigits.length >= 4 ? safeNormalizePhone(searchDigits) : null;
        return customers.filter(c => {
            if (c.full_name?.toLowerCase().includes(search)) return true;
            if (c.phone?.includes(search)) return true;
            if (searchDigits.length >= 4 && c.phone?.includes(searchDigits)) return true;
            if (normalizedSearch && c.phone) {
                const normalizedPhone = safeNormalizePhone(c.phone);
                return normalizedPhone ? normalizedPhone.includes(normalizedSearch) : false;
            }
            return false;
        }).slice(0, 8);
    }, [customers, customerSearch]);

    // Full accounts filtered by selected platform
    const filteredFullAccounts = useMemo(() => {
        if (!selectedPlatform) return fullAccounts;
        return fullAccounts.filter(a => a.platform === selectedPlatform);
    }, [fullAccounts, selectedPlatform]);

    // Unique platforms with full accounts available
    const platformsWithFullAccounts = useMemo(() => {
        return [...new Set(fullAccounts.map(a => a.platform))];
    }, [fullAccounts]);

    // All platforms with any stock (union of individual + full)
    const allAvailablePlatforms = useMemo(() => {
        return [...new Set([...availablePlatforms, ...platformsWithFullAccounts])].sort();
    }, [availablePlatforms, platformsWithFullAccounts]);

    // Is the selected platform a family account?
    const selectedPlatformObj = dbPlatforms.find(p => p.name === selectedPlatform);
    const isFamilyPlatform = selectedPlatformObj?.business_type === 'family_account';

    // Reset form when platform or saleMode changes
    useEffect(() => {
        setSelectedSlotId(null);
        setSelectedFullAccountId('');
        setPriceOverridden(false);
        setClientEmail('');
        setClientPassword('');
        setFamilyAccessType('credentials');
        if (selectedPlatform) {
            const plat = dbPlatforms.find(p => p.name === selectedPlatform);
            const price = plat?.default_slot_price_gs || 30000;
            setDefaultPrice(price);
            setSalePrice(price.toString());
        } else {
            setDefaultPrice(null);
            setSalePrice('');
        }
    }, [selectedPlatform, saleMode, dbPlatforms]);

    const handleSlotSelect = useCallback((slotId: string, slotDefaultPrice: number | null) => {
        setSelectedSlotId(slotId);
        if (slotDefaultPrice && !priceOverridden) {
            setDefaultPrice(slotDefaultPrice);
            setSalePrice(slotDefaultPrice.toString());
        }
    }, [priceOverridden]);

    const handlePriceChange = (value: string) => {
        setSalePrice(value);
        if (defaultPrice && parseInt(value) !== defaultPrice) {
            setPriceOverridden(true);
        } else {
            setPriceOverridden(false);
        }
    };

    // Create new customer — nombre y teléfono obligatorios
    const handleCreateCustomer = async () => {
        if (!newCustomerName.trim()) {
            setError('El nombre del cliente es obligatorio');
            return;
        }
        if (!newCustomerPhone.trim()) {
            setError('El teléfono del cliente es obligatorio');
            return;
        }

        setCreatingCustomer(true);
        setError(null);

        const phone = normalizePhone(newCustomerPhone);

        // Validar duplicado por teléfono
        const { data: existingCust } = await (supabase
            .from('customers') as any)
            .select('id, full_name')
            .eq('phone', phone)
            .limit(1)
            .single();

        if (existingCust) {
            setError(`Ya existe un cliente con ese teléfono: ${existingCust.full_name}`);
            setCreatingCustomer(false);
            return;
        }

        const insertData: any = {
            full_name: newCustomerName.trim(),
            phone: phone,
        };
        // Si se eligió una instancia de WhatsApp, asignar al crear
        if (selectedWaInstance) insertData.whatsapp_instance = selectedWaInstance;

        const { data: newCustomerData, error: createError } = await (supabase
            .from('customers') as any)
            .insert(insertData)
            .select('id, full_name, phone, whatsapp_instance')
            .single();

        if (createError) {
            setError(`Error creando cliente: ${createError.message}`);
            setCreatingCustomer(false);
            return;
        }

        setCustomers(prev => [newCustomerData, ...prev]);
        setSelectedCustomer(newCustomerData);
        setShowNewCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setCustomerSearch('');
        setCreatingCustomer(false);
    };

    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch('');
        // Si es creador, auto-setear precio 0 y duración infinita (canje)
        const esCreador = customer.customer_type === 'creador';
        setIsCreadorCustomer(esCreador);
        if (esCreador) {
            setSalePrice('0');
            setDuration('9999');
            setPriceOverridden(false);
        }
        // Pre-setear instancia WhatsApp del cliente
        setSelectedWaInstance(customer.whatsapp_instance || null);
    };

    const handleClearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
        setIsCreadorCustomer(false);
        setSelectedWaInstance(null);
        // Restaurar precio default
        if (selectedPlatform) {
            const plat = dbPlatforms.find(p => p.name === selectedPlatform);
            const price = plat?.default_slot_price_gs || 30000;
            setSalePrice(price.toString());
        }
        setDuration(String(daysUntilSameDayNextMonth()));
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!selectedCustomer) {
            setError('Selecciona o crea un cliente');
            return;
        }

        if (!selectedPlatform) {
            setError('Selecciona una plataforma');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (saleMode === 'full') {
                // Venta de cuenta completa
                if (!selectedFullAccountId) {
                    setError('Selecciona una cuenta completa disponible');
                    setLoading(false);
                    return;
                }

                const result = await createFullAccountSale({
                    motherAccountId: selectedFullAccountId,
                    customerId: selectedCustomer.id,
                    price: Number(salePrice),
                    durationDays: parseInt(duration) || 30,
                });

                if (result.error) {
                    setError(result.error);
                    setLoading(false);
                    return;
                }
            } else {
                // Venta de perfil individual
                if (!selectedSlotId) {
                    setError('Selecciona un slot disponible');
                    setLoading(false);
                    return;
                }

                const result = await createQuickSale({
                    platform: selectedPlatform,
                    customerPhone: selectedCustomer.phone || '',
                    customerId: selectedCustomer.id,
                    price: Number(salePrice),
                    specificSlotId: selectedSlotId,
                    durationDays: isCreadorCustomer ? undefined : (parseInt(duration) || 30),
                    isCanje: isCreadorCustomer,
                    // Family account fields (only sent when applicable)
                    familyAccessType: isFamilyPlatform ? familyAccessType : undefined,
                    clientEmail: isFamilyPlatform && clientEmail ? clientEmail : undefined,
                    clientPassword: isFamilyPlatform && familyAccessType === 'credentials' ? clientPassword : undefined,
                    whatsappInstance: selectedWaInstance || undefined,
                });

                if (result.error) {
                    setError(result.error);
                    setLoading(false);
                    return;
                }
                // Store instructions and credentials for copy button
                if (result.instructions) setSaleInstructions(result.instructions);
                if (result.credentials) setSaleCredentials(result.credentials);
            }

            setSuccess(true);
            setLoading(false);

        } catch (err: any) {
            setError(err.message || 'Error desconocido');
            setLoading(false);
        }
    }

    const resetForm = () => {
        setSelectedPlatform('');
        setSelectedSlotId(null);
        setSelectedFullAccountId('');
        setSalePrice('');
        setDefaultPrice(null);
        setPriceOverridden(false);
        setSelectedCustomer(null);
        setCustomerSearch('');
        setShowNewCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setError(null);
        setSuccess(false);
        setSaleMode('profile');
        setClientEmail('');
        setClientPassword('');
        setFamilyAccessType('credentials');
        setIsCreadorCustomer(false);
        setSaleCredentials(null);
        setDuration(String(daysUntilSameDayNextMonth()));
        setSelectedWaInstance(null);
    };

    const selectedFullAccount = fullAccounts.find(a => a.id === selectedFullAccountId);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) resetForm();
        }}>
            <DialogTrigger asChild>
                <Button className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva Venta
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Registrar Venta</DialogTitle>
                    <DialogDescription>
                        Busca o crea un cliente, selecciona plataforma y slot.
                    </DialogDescription>
                </DialogHeader>

                {success ? (
                    <div className="py-8 text-center">
                        <div className="mx-auto w-16 h-16 rounded-full bg-[#86EFAC]/20 flex items-center justify-center mb-4">
                            <Check className="h-8 w-8 text-[#86EFAC]" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">¡Venta Registrada!</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            {selectedPlatform} {saleMode === 'full' ? '(Cuenta Completa)' : ''} → {selectedCustomer?.full_name || 'Cliente'}
                        </p>
                        <p className="text-lg font-semibold text-[#86EFAC] mt-1">
                            {isCreadorCustomer ? (
                                <span className="text-[#818CF8]">🎬 Canje — Gs. 0</span>
                            ) : (
                                `Gs. ${Number(salePrice).toLocaleString('es-PY')}`
                            )}
                        </p>
                        <div className="flex gap-2 justify-center mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    let lines: string[];

                                    if (saleCredentials?.familyAccessType === 'credentials' && saleCredentials.clientEmail && saleCredentials.clientPassword) {
                                        // Family account — credentials we created
                                        lines = [
                                            `✅ *Tu acceso a ${selectedPlatform} (Plan Familiar)*`,
                                            ``,
                                            `👤 Hola ${selectedCustomer?.full_name || ''}!`,
                                            `📧 *Correo:* ${saleCredentials.clientEmail}`,
                                            `🔑 *Contraseña:* ${saleCredentials.clientPassword}`,
                                            `📅 *Vigencia:* ${saleCredentials.expirationDate || ''}`,
                                            ``,
                                            `_Ingresá con estas credenciales a ${selectedPlatform}._`,
                                        ];
                                    } else if (saleCredentials?.familyAccessType === 'invite' && saleCredentials.clientEmail) {
                                        // Family account — invitation
                                        lines = [
                                            `✅ *Acceso a ${selectedPlatform} (Plan Familiar)*`,
                                            ``,
                                            `👤 Hola ${selectedCustomer?.full_name || ''}!`,
                                            `📧 Hemos enviado una invitación a: *${saleCredentials.clientEmail}*`,
                                            ``,
                                            `⚠️ *Revisá tu correo y aceptá la invitación* para activar tu acceso.`,
                                            `📅 *Vigencia:* ${saleCredentials.expirationDate || ''}`,
                                        ];
                                    } else if (saleCredentials?.email) {
                                        // Regular slot — standard credentials
                                        lines = [
                                            `✅ *Tus credenciales de ${selectedPlatform}*`,
                                            ``,
                                            `👤 Hola ${selectedCustomer?.full_name || ''}!`,
                                            `📧 *Correo:* ${saleCredentials.email}`,
                                            `🔑 *Contraseña:* ${saleCredentials.password}`,
                                            saleCredentials.profile ? `👤 *Perfil:* ${saleCredentials.profile}` : '',
                                            saleCredentials.pin ? `🔒 *PIN:* ${saleCredentials.pin}` : '',
                                            `📅 *Vigencia:* ${saleCredentials.expirationDate || ''}`,
                                        ].filter(Boolean);
                                    } else {
                                        // Fallback: generic info (no credentials available)
                                        const now = new Date();
                                        const fecha = now.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                        lines = [
                                            `✅ *Venta Registrada*`,
                                            `📦 Servicio: ${selectedPlatform}${saleMode === 'full' ? ' (Cuenta Completa)' : ''}`,
                                            `👤 Cliente: ${selectedCustomer?.full_name || 'N/A'}`,
                                            `📱 Teléfono: ${selectedCustomer?.phone || 'N/A'}`,
                                            `💰 Precio: Gs. ${Number(salePrice).toLocaleString('es-PY')}`,
                                            `⏰ Duración: ${duration} días`,
                                            `📅 Fecha: ${fecha}`,
                                        ];
                                    }

                                    // Append instructions if available
                                    if (saleInstructions) {
                                        lines.push(``, `📋 *Instrucciones:* ${saleInstructions}`);
                                    }

                                    const text = lines.join('\n');
                                    navigator.clipboard.writeText(text).then(() => {
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    });
                                }}
                                className={`gap-2 transition-all ${copied ? 'border-[#86EFAC] text-[#86EFAC]' : ''}`}
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? '¡Copiado!' : 'Copiar Datos'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                onClick={() => {
                                    resetForm();
                                    setOpen(false);
                                    window.location.reload();
                                }}
                            >
                                Cerrar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="grid gap-5 py-4">
                            {/* Cliente - Buscador */}
                            <div className="space-y-2">
                                <Label className="flex items-center justify-between">
                                    <span>Cliente</span>
                                    {!showNewCustomerForm && !selectedCustomer && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-[#86EFAC] hover:text-[#86EFAC]/80"
                                            onClick={() => setShowNewCustomerForm(true)}
                                        >
                                            <UserPlus className="h-3 w-3 mr-1" />
                                            Nuevo Cliente
                                        </Button>
                                    )}
                                </Label>

                                {showNewCustomerForm ? (
                                    <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Nuevo Cliente</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={() => setShowNewCustomerForm(false)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <Input
                                            placeholder="Nombre completo"
                                            value={newCustomerName}
                                            onChange={(e) => setNewCustomerName(e.target.value)}
                                        />
                                        <Input
                                            placeholder="Teléfono (ej: 981123456)"
                                            value={newCustomerPhone}
                                            onChange={(e) => setNewCustomerPhone(e.target.value)}
                                        />
                                        {/* WhatsApp instance selector for new customers */}
                                        {waConfig && (
                                            <div className="flex items-center gap-2">
                                                <MessageCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                                <select
                                                    value={selectedWaInstance || ''}
                                                    onChange={(e) => setSelectedWaInstance(e.target.value || null)}
                                                    className="flex-1 text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-green-400"
                                                >
                                                    <option value="">WhatsApp: Auto (rotación)</option>
                                                    <option value={waConfig.instance1Name}>{waConfig.instance1Alias}</option>
                                                    <option value={waConfig.instance2Name}>{waConfig.instance2Alias}</option>
                                                </select>
                                            </div>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                            onClick={handleCreateCustomer}
                                            disabled={creatingCustomer}
                                        >
                                            {creatingCustomer ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                'Crear Cliente'
                                            )}
                                        </Button>
                                    </div>
                                ) : selectedCustomer ? (
                                    <div className="p-3 rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-foreground">{selectedCustomer.full_name}</p>
                                                <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleClearCustomer}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        {/* WhatsApp instance — siempre editable */}
                                        {waConfig && (
                                            <div className="flex items-center gap-1.5">
                                                <MessageCircle className="h-3 w-3 text-green-400" />
                                                <select
                                                    value={selectedWaInstance || ''}
                                                    onChange={(e) => setSelectedWaInstance(e.target.value || null)}
                                                    className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-green-400"
                                                >
                                                    <option value="">Auto (rotación)</option>
                                                    <option value={waConfig.instance1Name}>{waConfig.instance1Alias}</option>
                                                    <option value={waConfig.instance2Name}>{waConfig.instance2Alias}</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar por nombre o teléfono..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            className="pl-9"
                                        />

                                        {customerSearch.trim() && (
                                            <div className="absolute z-10 w-full mt-1 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                                                {filteredCustomers.length > 0 ? (
                                                    filteredCustomers.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            className="w-full px-3 py-2 text-left hover:bg-muted/50 flex justify-between items-center"
                                                            onClick={() => handleSelectCustomer(c)}
                                                        >
                                                            <span className="font-medium">{c.full_name}</span>
                                                            <span className="text-sm text-muted-foreground">{c.phone}</span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="px-3 py-4 text-center text-muted-foreground">
                                                        <p className="text-sm">No se encontraron clientes</p>
                                                        <Button
                                                            type="button"
                                                            variant="link"
                                                            size="sm"
                                                            className="text-[#86EFAC] mt-1"
                                                            onClick={() => {
                                                                setShowNewCustomerForm(true);
                                                                setNewCustomerName(customerSearch);
                                                            }}
                                                        >
                                                            <UserPlus className="h-3 w-3 mr-1" />
                                                            Crear nuevo cliente
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Plataforma */}
                            <div className="space-y-2">
                                <Label>Plataforma</Label>
                                <Select
                                    value={selectedPlatform}
                                    onValueChange={setSelectedPlatform}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar plataforma" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allAvailablePlatforms.map((p) => {
                                            const indCount = allSlots.filter((s: any) => s.mother_accounts?.platform === p).length;
                                            const fullCount = fullAccounts.filter(a => a.platform === p).length;
                                            return (
                                                <SelectItem key={p} value={p}>
                                                    <span>{p}</span>
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {indCount > 0 && `Ind: ${indCount}`}
                                                        {indCount > 0 && fullCount > 0 && ' · '}
                                                        {fullCount > 0 && `Completas: ${fullCount}`}
                                                    </span>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Tipo de venta (only show when platform is selected) */}
                            {selectedPlatform && (
                                <div className="space-y-2">
                                    <Label>Tipo de Venta</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSaleMode('profile')}
                                            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all border ${saleMode === 'profile'
                                                ? 'bg-[#86EFAC] text-black border-[#86EFAC]'
                                                : 'bg-transparent text-muted-foreground border-border hover:border-[#86EFAC]/50'
                                                }`}
                                        >
                                            Por Perfil
                                            {availablePlatforms.includes(selectedPlatform) && (
                                                <span className="ml-1 text-xs opacity-70">
                                                    ({allSlots.filter((s: any) => s.mother_accounts?.platform === selectedPlatform).length})
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSaleMode('full')}
                                            disabled={filteredFullAccounts.length === 0}
                                            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all border ${saleMode === 'full'
                                                ? 'bg-[#F97316] text-white border-[#F97316]'
                                                : filteredFullAccounts.length === 0
                                                    ? 'opacity-40 cursor-not-allowed bg-transparent text-muted-foreground border-border'
                                                    : 'bg-transparent text-muted-foreground border-border hover:border-[#F97316]/50'
                                                }`}
                                        >
                                            <Package className="inline h-3.5 w-3.5 mr-1" />
                                            Cuenta Completa
                                            <span className="ml-1 text-xs opacity-70">
                                                ({filteredFullAccounts.length})
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Slot Picker — Profile mode */}
                            {selectedPlatform && saleMode === 'profile' && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        Slot Asignado
                                        <Badge variant="outline" className="text-xs">
                                            Algoritmo Tetris
                                        </Badge>
                                    </Label>
                                    <SlotPicker
                                        availableSlots={allSlots}
                                        platform={selectedPlatform}
                                        selectedSlotId={selectedSlotId}
                                        onSlotSelect={handleSlotSelect}
                                        durationDays={parseInt(duration) || 30}
                                    />
                                </div>
                            )}

                            {/* Family Account — Access type toggle + client credentials */}
                            {selectedPlatform && saleMode === 'profile' && isFamilyPlatform && (
                                <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-blue-400" />
                                        <span className="text-sm font-medium text-foreground">Cuenta Familia — Acceso del cliente</span>
                                    </div>

                                    {/* Toggle */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFamilyAccessType('credentials')}
                                            className={`rounded-md px-3 py-2 text-xs font-medium transition-all border ${familyAccessType === 'credentials'
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                : 'bg-transparent text-muted-foreground border-border hover:border-blue-500/30'
                                                }`}
                                        >
                                            🔑 Nosotros creamos la cuenta
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFamilyAccessType('invite')}
                                            className={`rounded-md px-3 py-2 text-xs font-medium transition-all border ${familyAccessType === 'invite'
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                : 'bg-transparent text-muted-foreground border-border hover:border-blue-500/30'
                                                }`}
                                        >
                                            📩 Cliente usa su correo
                                        </button>
                                    </div>

                                    {/* Client Email */}
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                            {familyAccessType === 'credentials' ? 'Correo creado para el cliente' : 'Correo del cliente a invitar'}
                                        </Label>
                                        <Input
                                            type="email"
                                            placeholder="cliente@gmail.com"
                                            value={clientEmail}
                                            onChange={(e) => setClientEmail(e.target.value)}
                                            className="h-8 text-sm"
                                        />
                                    </div>

                                    {/* Client Password — only when we created the account */}
                                    {familyAccessType === 'credentials' && (
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Contraseña asignada</Label>
                                            <Input
                                                type="text"
                                                placeholder="Contraseña del cliente"
                                                value={clientPassword}
                                                onChange={(e) => setClientPassword(e.target.value)}
                                                className="h-8 text-sm font-mono"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}



                            {/* Full Account Picker — Full mode */}
                            {selectedPlatform && saleMode === 'full' && (
                                <div className="space-y-2">
                                    <Label>Cuenta Completa Disponible</Label>
                                    {filteredFullAccounts.length === 0 ? (
                                        <div className="rounded-lg border border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                                            No hay cuentas completas disponibles para {selectedPlatform}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {filteredFullAccounts.map(acct => (
                                                <button
                                                    key={acct.id}
                                                    type="button"
                                                    onClick={() => setSelectedFullAccountId(acct.id)}
                                                    className={`w-full rounded-lg border p-3 text-left transition-all ${selectedFullAccountId === acct.id
                                                        ? 'border-[#F97316] bg-[#F97316]/10'
                                                        : 'border-border hover:border-[#F97316]/40 bg-transparent'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="font-medium text-foreground text-sm">{acct.email}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {acct.max_slots} perfiles · Vence: {acct.renewal_date ? new Date(acct.renewal_date + 'T12:00:00').toLocaleDateString('es-PY') : '—'}
                                                            </p>
                                                        </div>
                                                        <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${selectedFullAccountId === acct.id ? 'border-[#F97316] bg-[#F97316]' : 'border-muted-foreground'}`}>
                                                            {selectedFullAccountId === acct.id && <Check className="h-2.5 w-2.5 text-white" />}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Precio y Duración */}
                            {isCreadorCustomer ? (
                                <div className="rounded-lg border border-[#818CF8]/40 bg-[#818CF8]/10 p-4 flex items-center gap-3">
                                    <span className="text-2xl">🎬</span>
                                    <div>
                                        <p className="text-sm font-semibold text-[#818CF8]">Canje — Precio Gs. 0</p>
                                        <p className="text-xs text-muted-foreground">Este creador recibe acceso sin vencimiento ni costo</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="sale_price_gs" className="flex items-center gap-2">
                                            Precio (Gs.)
                                            {saleMode === 'full' && selectedFullAccount && (
                                                <Badge variant="outline" className="text-xs text-[#F97316] border-[#F97316]/30">
                                                    {selectedFullAccount.max_slots} perfiles
                                                </Badge>
                                            )}
                                            {priceOverridden && (
                                                <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                                                    Modificado
                                                </Badge>
                                            )}
                                        </Label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="sale_price_gs"
                                                name="sale_price_gs"
                                                type="number"
                                                value={salePrice}
                                                onChange={(e) => handlePriceChange(e.target.value)}
                                                placeholder={defaultPrice?.toString() || '0'}
                                                className="pl-9"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="duration_days">Duración (días)</Label>
                                        <Input
                                            id="duration_days"
                                            name="duration_days"
                                            type="number"
                                            value={duration}
                                            onChange={(e) => setDuration(e.target.value)}
                                            min={1}
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                className={saleMode === 'full'
                                    ? 'bg-[#F97316] hover:bg-[#F97316]/90 text-white'
                                    : 'bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90'
                                }
                                disabled={loading || !selectedCustomer || (saleMode === 'profile' ? !selectedSlotId : !selectedFullAccountId)}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Procesando...
                                    </>
                                ) : saleMode === 'full' ? (
                                    'Vender Cuenta Completa'
                                ) : (
                                    'Registrar Venta'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
