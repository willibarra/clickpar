'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, User, Lock } from 'lucide-react';
import { createMotherAccount } from '@/lib/actions/inventory';
import { createClient } from '@/lib/supabase/client';

const fallbackPlatforms = ['Netflix', 'Spotify', 'HBO Max', 'Disney+', 'Amazon Prime', 'YouTube Premium', 'Apple TV+', 'Crunchyroll', 'Paramount+', 'Star+'];

interface Platform {
    id: string;
    name: string;
    business_type: string;
    default_max_slots: number;
    slot_label: string;
}

interface CustomSlot {
    name: string;
    pin: string;
}

function getToday(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getDaysInCurrentMonth(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function AddAccountModal() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
    const [maxSlots, setMaxSlots] = useState(5);
    const [serviceDays, setServiceDays] = useState(getDaysInCurrentMonth());
    const [customizeSlots, setCustomizeSlots] = useState(false);
    const [customSlots, setCustomSlots] = useState<CustomSlot[]>([]);
    const [isOwnedEmail, setIsOwnedEmail] = useState(false);
    const [emailPassword, setEmailPassword] = useState('');
    const [showEmailPass, setShowEmailPass] = useState(false);
    const [saleType, setSaleType] = useState<'profile' | 'complete'>('profile');

    useEffect(() => {
        if (open) {
            fetchPlatforms();
            setError(null);
            setSelectedPlatform(null);
            setCustomizeSlots(false);
            setIsOwnedEmail(false);
            setEmailPassword('');
            setShowEmailPass(false);
            setSaleType('profile');
            setServiceDays(getDaysInCurrentMonth());
            const defaultSlots = 5;
            setMaxSlots(defaultSlots);
            setCustomSlots(Array.from({ length: defaultSlots }, () => ({ name: '', pin: '' })));
        }
    }, [open]);

    // Sync custom slots array when maxSlots changes
    useEffect(() => {
        setCustomSlots(prev => {
            const arr: CustomSlot[] = [];
            for (let i = 0; i < maxSlots; i++) {
                arr.push(prev[i] || { name: '', pin: '' });
            }
            return arr;
        });
    }, [maxSlots]);

    async function fetchPlatforms() {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('platforms')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error || !data || data.length === 0) {
            setPlatforms(fallbackPlatforms.map((name, i) => ({
                id: `fallback-${i}`,
                name,
                business_type: 'profile_sharing',
                default_max_slots: 5,
                slot_label: 'Perfil'
            })));
        } else {
            setPlatforms(data);
        }
    }

    function handlePlatformChange(platformName: string) {
        const platform = platforms.find(p => p.name === platformName);
        setSelectedPlatform(platform || null);
        if (platform) {
            setMaxSlots(platform.default_max_slots || 5);
        }
    }

    function updateCustomSlot(index: number, field: 'name' | 'pin', value: string) {
        setCustomSlots(prev => {
            const arr = [...prev];
            arr[index] = { ...arr[index], [field]: value };
            return arr;
        });
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);

        // Compute renewal_date = purchase_date + service_days
        const purchaseDate = formData.get('purchase_date') as string;
        if (purchaseDate && serviceDays > 0) {
            const expDate = new Date(purchaseDate + 'T12:00:00');
            expDate.setDate(expDate.getDate() + serviceDays);
            const y = expDate.getFullYear();
            const m = String(expDate.getMonth() + 1).padStart(2, '0');
            const d = String(expDate.getDate()).padStart(2, '0');
            formData.set('renewal_date', `${y}-${m}-${d}`);
        } else {
            formData.set('renewal_date', purchaseDate || getToday());
        }
        formData.delete('purchase_date');

        // Inject custom slots as JSON if enabled
        if (customizeSlots && customSlots.some(s => s.name || s.pin)) {
            formData.set('custom_slots', JSON.stringify(customSlots));
        }

        // Owned email data
        if (isOwnedEmail) {
            formData.set('is_owned_email', 'true');
            formData.set('email_password', emailPassword);
        }

        // Sale type
        formData.set('sale_type', saleType);
        if (saleType === 'complete') {
            formData.set('max_slots', '0');
        }

        const result = await createMotherAccount(formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setOpen(false);
            setLoading(false);
            router.refresh();
        }
    }

    const slotLabel = selectedPlatform?.business_type === 'family_account' ? 'Miembros' : 'Perfiles';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva Cuenta
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Agregar Cuenta Madre</DialogTitle>
                    <DialogDescription>
                        Ingresa los datos de la nueva cuenta de streaming
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    <div className="grid gap-4 py-4">
                        {/* Row 1: Platform */}
                        <div className="space-y-2">
                            <Label htmlFor="platform">Plataforma</Label>
                            <Select name="platform" required onValueChange={handlePlatformChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    {platforms.map((p) => (
                                        <SelectItem key={p.id} value={p.name}>
                                            <div className="flex items-center gap-2">
                                                <span>{p.name}</span>
                                                {p.business_type === 'family_account' && (
                                                    <span className="text-xs text-muted-foreground">(Familia)</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Sale Type Toggle */}
                        <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-[#0d0d0d] p-3">
                            <div className="flex items-center gap-3 flex-1">
                                <button
                                    type="button"
                                    onClick={() => setSaleType('profile')}
                                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${saleType === 'profile'
                                        ? 'bg-[#86EFAC]/20 text-[#86EFAC] border border-[#86EFAC]/30'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                        }`}
                                >
                                    Por Perfiles
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSaleType('complete')}
                                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${saleType === 'complete'
                                        ? 'bg-[#818CF8]/20 text-[#818CF8] border border-[#818CF8]/30'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                        }`}
                                >
                                    Cuenta Completa
                                </button>
                            </div>
                        </div>

                        {/* Max Slots - Only for profile type */}
                        {saleType === 'profile' && (
                            <div className="space-y-2">
                                <Label htmlFor="max_slots">
                                    Máx. {slotLabel}
                                </Label>
                                <Input
                                    id="max_slots"
                                    name="max_slots"
                                    type="number"
                                    value={maxSlots}
                                    onChange={(e) => setMaxSlots(parseInt(e.target.value) || 1)}
                                    min={1}
                                    max={10}
                                    required
                                />
                            </div>
                        )}

                        {/* Row 2: Email + Password */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email de la cuenta</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="cuenta@gmail.com"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="text"
                                    placeholder="Contraseña"
                                    required
                                />
                            </div>
                        </div>

                        {/* Owned Email Checkbox */}
                        <div className="rounded-lg border border-border/40 bg-[#0d0d0d] p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="is_owned_email"
                                    checked={isOwnedEmail}
                                    onCheckedChange={(v) => setIsOwnedEmail(v === true)}
                                />
                                <label htmlFor="is_owned_email" className="text-sm font-medium text-foreground cursor-pointer select-none">
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

                        {/* Row 3: Cost USDT + Cost GS */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="purchase_cost_usdt">Costo (USDT)</Label>
                                <Input
                                    id="purchase_cost_usdt"
                                    name="purchase_cost_usdt"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchase_cost_gs">Costo (Gs.)</Label>
                                <Input
                                    id="purchase_cost_gs"
                                    name="purchase_cost_gs"
                                    type="number"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Row 4: Purchase Date + Service Days + Sale Price */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="purchase_date">Fecha de Compra</Label>
                                <Input
                                    id="purchase_date"
                                    name="purchase_date"
                                    type="date"
                                    defaultValue={getToday()}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="service_days">Días de Servicio</Label>
                                <Input
                                    id="service_days"
                                    name="service_days"
                                    type="number"
                                    value={serviceDays}
                                    onChange={(e) => setServiceDays(parseInt(e.target.value) || 0)}
                                    min={1}
                                    placeholder="30"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sale_price_gs">Precio Venta (Gs.)</Label>
                                <Input
                                    id="sale_price_gs"
                                    name="sale_price_gs"
                                    type="number"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Row 5: Supplier Name + Supplier Phone */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="supplier_name">Nombre Proveedor</Label>
                                <Input
                                    id="supplier_name"
                                    name="supplier_name"
                                    type="text"
                                    placeholder="Nombre del proveedor"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supplier_phone">Número Proveedor</Label>
                                <Input
                                    id="supplier_phone"
                                    name="supplier_phone"
                                    type="text"
                                    placeholder="+595 ..."
                                />
                            </div>
                        </div>

                        {/* Divider: Custom Slots Toggle - Only for profile type */}
                        {saleType === 'profile' && (
                            <div className="flex items-center gap-3 pt-2 border-t border-border">
                                <input
                                    type="checkbox"
                                    id="customize_slots"
                                    checked={customizeSlots}
                                    onChange={(e) => setCustomizeSlots(e.target.checked)}
                                    className="h-4 w-4 rounded border-border accent-[#86EFAC]"
                                />
                                <Label htmlFor="customize_slots" className="cursor-pointer text-sm">
                                    Personalizar nombres y PINs de {slotLabel.toLowerCase()}
                                </Label>
                            </div>
                        )}

                        {/* Custom Slot Fields */}
                        {saleType === 'profile' && customizeSlots && (
                            <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                                <p className="text-xs text-muted-foreground mb-2">
                                    Asigna nombre y PIN a cada {slotLabel.toLowerCase().slice(0, -1)}
                                </p>
                                {customSlots.map((slot, i) => (
                                    <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                                        <span className="text-xs text-muted-foreground w-6 text-center">
                                            {i + 1}
                                        </span>
                                        <div className="relative">
                                            <User className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                            <Input
                                                value={slot.name}
                                                onChange={(e) => updateCustomSlot(i, 'name', e.target.value)}
                                                placeholder={`Nombre perfil ${i + 1}`}
                                                className="h-8 text-sm pl-7"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                            <Input
                                                value={slot.pin}
                                                onChange={(e) => updateCustomSlot(i, 'pin', e.target.value)}
                                                placeholder="PIN"
                                                className="h-8 text-sm pl-7"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
