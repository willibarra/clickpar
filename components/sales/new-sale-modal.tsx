'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, DollarSign, AlertCircle, Search, UserPlus, Check, X } from 'lucide-react';
import { createQuickSale } from '@/lib/actions/sales';
import { createClient } from '@/lib/supabase/client';
import { SlotPicker } from './slot-picker';
import { SlotWithAccount } from '@/lib/utils/tetris-algorithm';

interface DBPlatform {
    id: string;
    name: string;
    default_slot_price_gs: number | null;
}

interface Customer {
    id: string;
    full_name: string;
    phone: string;
}

export function NewSaleModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [allSlots, setAllSlots] = useState<SlotWithAccount[]>([]);
    const [dbPlatforms, setDbPlatforms] = useState<DBPlatform[]>([]);
    const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

    // Customer search & selection
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerPhone, setNewCustomerPhone] = useState('');
    const [creatingCustomer, setCreatingCustomer] = useState(false);

    // Form state
    const [selectedPlatform, setSelectedPlatform] = useState<string>('');
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [salePrice, setSalePrice] = useState<string>('');
    const [defaultPrice, setDefaultPrice] = useState<number | null>(null);
    const [duration, setDuration] = useState<string>('30');
    const [priceOverridden, setPriceOverridden] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (open) {
            // Fetch customers
            supabase
                .from('customers')
                .select('id, full_name, phone')
                .order('full_name', { ascending: true })
                .then(({ data }) => setCustomers(data || []));

            // Fetch platforms from DB
            supabase
                .from('platforms')
                .select('id, name, default_slot_price_gs')
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
                        target_billing_day, max_slots
                    )
                `)
                .eq('status', 'available')
                .then(({ data }) => {
                    const slots = (data || []) as any[];
                    const slotsWithPrice = slots.map((slot: any) => ({
                        ...slot,
                        mother_accounts: slot.mother_accounts ? {
                            ...slot.mother_accounts,
                            default_slot_price_gs: 30000,
                        } : null,
                    }));
                    setAllSlots(slotsWithPrice as SlotWithAccount[]);

                    // Extract unique platforms that have available slots
                    const platformsWithStock = [...new Set(
                        slots
                            .map((s: any) => s.mother_accounts?.platform)
                            .filter(Boolean) as string[]
                    )];
                    setAvailablePlatforms(platformsWithStock);
                });
        }
    }, [open, supabase]);

    // Filter customers based on search
    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return [];
        const search = customerSearch.toLowerCase();
        return customers.filter(c =>
            c.full_name?.toLowerCase().includes(search) ||
            c.phone?.includes(search)
        ).slice(0, 8);
    }, [customers, customerSearch]);

    // Reset form when platform changes
    useEffect(() => {
        setSelectedSlotId(null);
        setPriceOverridden(false);
        if (selectedPlatform) {
            const plat = dbPlatforms.find(p => p.name === selectedPlatform);
            const price = plat?.default_slot_price_gs || 30000;
            setDefaultPrice(price);
            setSalePrice(price.toString());
        } else {
            setDefaultPrice(null);
            setSalePrice('');
        }
    }, [selectedPlatform, dbPlatforms]);

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

    // Create new customer
    const handleCreateCustomer = async () => {
        if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
            setError('Ingresa nombre y teléfono del cliente');
            return;
        }

        setCreatingCustomer(true);
        setError(null);

        // Normalize phone
        let phone = newCustomerPhone.trim().replace(/\D/g, '');
        if (!phone.startsWith('595')) {
            phone = '595' + phone.replace(/^0/, '');
        }

        const { data, error: createError } = await (supabase
            .from('customers') as any)
            .insert({
                full_name: newCustomerName.trim(),
                phone: phone,
            })
            .select('id, full_name, phone')
            .single();

        if (createError) {
            setError(`Error creando cliente: ${createError.message}`);
            setCreatingCustomer(false);
            return;
        }

        // Add to list and select
        setCustomers(prev => [data, ...prev]);
        setSelectedCustomer(data);
        setShowNewCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setCustomerSearch('');
        setCreatingCustomer(false);
    };

    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch('');
    };

    const handleClearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
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

        if (!selectedSlotId) {
            setError('Selecciona un slot disponible');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await createQuickSale({
                platform: selectedPlatform,
                customerPhone: selectedCustomer.phone || '',
                customerId: selectedCustomer.id,
                price: Number(salePrice),
                specificSlotId: selectedSlotId,
                durationDays: parseInt(duration) || 30,
            });

            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }

            // Show success
            setSuccess(true);

            // Reset and close after delay
            setTimeout(() => {
                setSelectedPlatform('');
                setSelectedSlotId(null);
                setSalePrice('');
                setDefaultPrice(null);
                setPriceOverridden(false);
                setSelectedCustomer(null);
                setCustomerSearch('');
                setSuccess(false);
                setOpen(false);
                setLoading(false);
                // Force page refresh to show new sale
                window.location.reload();
            }, 1500);

        } catch (err: any) {
            setError(err.message || 'Error desconocido');
            setLoading(false);
        }
    }

    const resetForm = () => {
        setSelectedPlatform('');
        setSelectedSlotId(null);
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
    };

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
                    <div className="py-12 text-center">
                        <div className="mx-auto w-16 h-16 rounded-full bg-[#86EFAC]/20 flex items-center justify-center mb-4">
                            <Check className="h-8 w-8 text-[#86EFAC]" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">¡Venta Registrada!</h3>
                        <p className="text-muted-foreground text-sm mt-1">La venta se ha guardado correctamente</p>
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
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/5">
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
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar por nombre o teléfono..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            className="pl-9"
                                        />

                                        {/* Dropdown de resultados - solo cuando hay búsqueda activa */}
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
                                        {availablePlatforms.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {p}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Slot Picker */}
                            {selectedPlatform && (
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

                            {/* Precio y Duración */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="sale_price_gs" className="flex items-center gap-2">
                                        Precio (Gs.)
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
                                            placeholder={defaultPrice?.toString() || '30000'}
                                            className="pl-9"
                                            required
                                        />
                                    </div>
                                    {defaultPrice && (
                                        <p className="text-xs text-muted-foreground">
                                            Precio sugerido: Gs. {defaultPrice.toLocaleString('es-PY')}
                                        </p>
                                    )}
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
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                disabled={loading || !selectedCustomer || !selectedSlotId}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Procesando...
                                    </>
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
