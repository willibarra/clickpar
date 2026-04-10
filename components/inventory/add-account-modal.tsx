'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Pencil, Check, FileSpreadsheet, AlertCircle, CheckCircle2, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, User, Lock } from 'lucide-react';
import { createMotherAccount, bulkCreateMotherAccounts } from '@/lib/actions/inventory';
import { createClient } from '@/lib/supabase/client';
import { useUsdtRate } from '@/lib/usdt-rate';

const fallbackPlatforms = ['Netflix', 'Spotify', 'HBO Max', 'Disney+', 'Amazon Prime', 'YouTube Premium', 'Apple TV+', 'Crunchyroll', 'Paramount+', 'Star+'];

interface Platform {
    id: string;
    name: string;
    business_type: string;
    default_max_slots: number;
    slot_label: string;
}

interface Supplier {
    id: string;
    name: string;
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

function parseAccountLines(text: string): { email: string; password: string }[] {
    if (!text.trim()) return [];
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // Split only on the FIRST occurrence of : or tab
            // Priority: colon first, then tab, then space
            let email = '';
            let password = '';
            const colonIdx = line.indexOf(':');
            const tabIdx = line.indexOf('\t');

            if (colonIdx > 0) {
                email = line.substring(0, colonIdx).trim();
                password = line.substring(colonIdx + 1).trim();
            } else if (tabIdx > 0) {
                email = line.substring(0, tabIdx).trim();
                password = line.substring(tabIdx + 1).trim();
            } else {
                // Fallback: split on first space
                const spaceIdx = line.indexOf(' ');
                if (spaceIdx > 0) {
                    email = line.substring(0, spaceIdx).trim();
                    password = line.substring(spaceIdx + 1).trim();
                } else {
                    email = line;
                    password = '';
                }
            }

            return { email, password };
        })
        .filter(entry => entry.email && entry.password);
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
    const [instructions, setInstructions] = useState('');
    const [sendInstructions, setSendInstructions] = useState(false);
    const [isAutopay, setIsAutopay] = useState(false);
    const [invitationUrl, setInvitationUrl] = useState('');
    const [inviteAddress, setInviteAddress] = useState('');

    // Copy last record
    const [copyingLast, setCopyingLast] = useState(false);
    const [copiedFlash, setCopiedFlash] = useState(false);

    // Bulk mode
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkNotes, setBulkNotes] = useState('');
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
    const [bulkResult, setBulkResult] = useState<{ created: number; errors: { email: string; error: string }[] } | null>(null);

    // USDT exchange rate
    const { rate, setRate, convertToGs, loaded: rateLoaded } = useUsdtRate();
    const [usdtCost, setUsdtCost] = useState('');
    const [gsCost, setGsCost] = useState('');
    const [editingRate, setEditingRate] = useState(false);
    const [rateInput, setRateInput] = useState('');

    // Controlled supplier + sale price (needed for copy last record)
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [supplierName, setSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [salePriceGs, setSalePriceGs] = useState('');

    // Controlled platform select
    const [selectedPlatformName, setSelectedPlatformName] = useState<string>('');
    // Whether user manually changed max slots (so we don't overwrite on platform change)
    const [userEditedSlots, setUserEditedSlots] = useState(false);

    // Parse bulk text in real-time
    const bulkAccounts = useMemo(() => parseAccountLines(bulkText), [bulkText]);
    const bulkDuplicates = useMemo(() => {
        const emails = bulkAccounts.map(a => a.email.toLowerCase());
        return emails.filter((e, i) => emails.indexOf(e) !== i);
    }, [bulkAccounts]);

    useEffect(() => {
        if (open) {
            fetchPlatforms();
            fetchSuppliers();
            setError(null);
            setSelectedPlatform(null);
            setSelectedPlatformName('');
            setUserEditedSlots(false);
            setCustomizeSlots(false);
            setIsOwnedEmail(false);
            setEmailPassword('');
            setShowEmailPass(false);
            setInstructions('');
            setSendInstructions(false);
            setIsAutopay(false);
            setInvitationUrl('');
            setInviteAddress('');
            setUsdtCost('');
            setGsCost('');
            setEditingRate(false);
            setServiceDays(getDaysInCurrentMonth());
            setBulkMode(false);
            setBulkText('');
            setBulkNotes('');
            setBulkProgress(null);
            setBulkResult(null);
            setSupplierName('');
            setSupplierPhone('');
            setSelectedSupplierId('');
            setSalePriceGs('');
            setCopiedFlash(false);
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

    async function fetchSuppliers() {
        const supabase = createClient();
        const { data } = await supabase.from('suppliers').select('id, name').order('name');
        setSuppliers((data as Supplier[]) || []);
    }

    async function handleCopyLastRecord() {
        setCopyingLast(true);
        try {
            const supabase = createClient();
            type LastRecord = {
                platform: string | null;
                max_slots: number | null;
                purchase_cost_usdt: number | null;
                purchase_cost_gs: number | null;
                sale_price_gs: number | null;
                supplier_name: string | null;
                supplier_phone: string | null;
                service_days: number | null;
                instructions: string | null;
                send_instructions: boolean | null;
                is_autopay: boolean | null;
                is_owned_email: boolean | null;
                invitation_url: string | null;
                invite_address: string | null;
            };
            const { data: rawData, error } = await supabase
                .from('mother_accounts')
                .select('platform, max_slots, purchase_cost_usdt, purchase_cost_gs, sale_price_gs, supplier_name, supplier_phone, service_days, instructions, send_instructions, is_autopay, is_owned_email, invitation_url, invite_address')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            const data = rawData as LastRecord | null;

            if (error || !data) {
                setError('No se encontró ningún registro anterior.');
                return;
            }

            // Apply platform
            if (data.platform) {
                handlePlatformChange(data.platform);
            }

            // Apply slots
            if (data.max_slots) setMaxSlots(data.max_slots);

            // Apply costs
            if (data.purchase_cost_usdt) {
                setUsdtCost(String(data.purchase_cost_usdt));
                if (rate > 0) setGsCost(String(convertToGs(data.purchase_cost_usdt)));
                else if (data.purchase_cost_gs) setGsCost(String(data.purchase_cost_gs));
            } else if (data.purchase_cost_gs) {
                setGsCost(String(data.purchase_cost_gs));
            }

            // Apply service days
            if (data.service_days) setServiceDays(data.service_days);

            // Apply supplier
            setSupplierName(data.supplier_name || '');
            setSupplierPhone(data.supplier_phone || '');

            // Apply instructions
            if (data.instructions) {
                setInstructions(data.instructions);
                setSendInstructions(data.send_instructions || false);
            }

            // Apply checkboxes
            setIsAutopay(data.is_autopay || false);
            setIsOwnedEmail(data.is_owned_email || false);

            // Apply family account fields
            if (data.invitation_url) setInvitationUrl(data.invitation_url);
            if (data.invite_address) setInviteAddress(data.invite_address);

            // Apply sale price gs
            if (data.sale_price_gs) setSalePriceGs(String(data.sale_price_gs));

            // Flash feedback
            setCopiedFlash(true);
            setTimeout(() => setCopiedFlash(false), 2000);
        } catch {
            setError('Error al obtener el último registro.');
        } finally {
            setCopyingLast(false);
        }
    }

    function handlePlatformChange(platformName: string) {
        const platform = platforms.find(p => p.name === platformName);
        setSelectedPlatform(platform || null);
        setSelectedPlatformName(platformName);
        // Only set default max_slots if user hasn't manually edited the field
        if (platform && !userEditedSlots) {
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

    function handleUsdtChange(value: string) {
        setUsdtCost(value);
        const usdt = parseFloat(value);
        if (!isNaN(usdt) && usdt > 0 && rate > 0) {
            setGsCost(String(convertToGs(usdt)));
        } else if (value === '') {
            setGsCost('');
        }
    }

    function handleSaveRate() {
        const parsed = parseFloat(rateInput);
        if (!isNaN(parsed) && parsed > 0) {
            setRate(parsed);
            // Recalculate Gs if USDT is set
            const usdt = parseFloat(usdtCost);
            if (!isNaN(usdt) && usdt > 0) {
                setGsCost(String(Math.round(usdt * parsed)));
            }
        }
        setEditingRate(false);
    }

    // Build shared data from the form for bulk mode
    function getSharedDataFromForm(form: HTMLFormElement) {
        const formData = new FormData(form);
        const purchaseDate = formData.get('purchase_date') as string;
        let renewalDate = purchaseDate || getToday();
        if (purchaseDate && serviceDays > 0) {
            const expDate = new Date(purchaseDate + 'T12:00:00');
            expDate.setDate(expDate.getDate() + serviceDays);
            const y = expDate.getFullYear();
            const m = String(expDate.getMonth() + 1).padStart(2, '0');
            const d = String(expDate.getDate()).padStart(2, '0');
            renewalDate = `${y}-${m}-${d}`;
        }

        let parsedCustomSlots: { name: string; pin: string }[] | null = null;
        if (customizeSlots && customSlots.some(s => s.name || s.pin)) {
            parsedCustomSlots = customSlots;
        }

        return {
            platform: formData.get('platform') as string || selectedPlatformName,
            max_slots: maxSlots,
            purchase_cost_usdt: parseFloat(formData.get('purchase_cost_usdt') as string) || 0,
            purchase_cost_gs: parseFloat(formData.get('purchase_cost_gs') as string) || 0,
            renewal_date: renewalDate,
            service_days: serviceDays,
            sale_price_gs: parseFloat(formData.get('sale_price_gs') as string) || null,
            supplier_name: (formData.get('supplier_name') as string) || null,
            supplier_phone: (formData.get('supplier_phone') as string) || null,
            sale_type: 'profile',
            notes: bulkNotes.trim() || null,
            instructions: instructions.trim() || null,
            send_instructions: sendInstructions,
            is_autopay: isAutopay,
            is_owned_email: isOwnedEmail,
            email_password_shared: emailPassword || null,
            invitation_url: invitationUrl.trim() || null,
            invite_address: inviteAddress.trim() || null,
            custom_slots: parsedCustomSlots,
        };
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

        if (bulkMode) {
            // --- BULK MODE ---
            if (bulkAccounts.length === 0) {
                setError('No se detectaron cuentas válidas. Usa el formato email:contraseña (una por línea).');
                setLoading(false);
                return;
            }

            if (bulkDuplicates.length > 0) {
                setError(`Emails duplicados detectados: ${bulkDuplicates.join(', ')}`);
                setLoading(false);
                return;
            }

            const sharedData = getSharedDataFromForm(e.currentTarget);
            setBulkProgress({ current: 0, total: bulkAccounts.length });

            const result = await bulkCreateMotherAccounts(sharedData, bulkAccounts);
            setBulkProgress(null);
            setBulkResult(result);
            setLoading(false);

            if (result.errors.length === 0) {
                // Auto-close after a short delay on full success
                setTimeout(() => {
                    setOpen(false);
                    router.refresh();
                }, 2000);
            } else {
                router.refresh();
            }
        } else {
            // --- INDIVIDUAL MODE (original) ---
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

            // Inject custom slots as JSON
            // For family accounts: always inject if any slot has data (correo/contraseña final)
            // For regular accounts: only inject if customization checkbox is checked
            if (isFamilyAccount && customSlots.some(s => s.name || s.pin)) {
                formData.set('custom_slots', JSON.stringify(customSlots));
            } else if (!isFamilyAccount && customizeSlots && customSlots.some(s => s.name || s.pin)) {
                formData.set('custom_slots', JSON.stringify(customSlots));
            }

            // Owned email data
            if (isOwnedEmail) {
                formData.set('is_owned_email', 'true');
                formData.set('email_password', emailPassword);
            }

            // Always profile type — Cuenta Completa is auto-detected by slot availability
            formData.set('sale_type', 'profile');

            // Instructions
            if (instructions.trim()) {
                formData.set('instructions', instructions.trim());
            }
            formData.set('send_instructions', sendInstructions ? 'true' : 'false');
            formData.set('is_autopay', isAutopay ? 'true' : 'false');

            // Family account fields
            if (invitationUrl.trim()) {
                formData.set('invitation_url', invitationUrl.trim());
            }
            if (inviteAddress.trim()) {
                formData.set('invite_address', inviteAddress.trim());
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
    }

    const slotLabel = selectedPlatform?.business_type === 'family_account' ? 'Miembros' : 'Perfiles';
    const isFamilyAccount = selectedPlatform?.business_type === 'family_account';

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
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <DialogTitle>Agregar Cuenta Madre</DialogTitle>
                            <DialogDescription>
                                Ingresa los datos de la nueva cuenta de streaming
                            </DialogDescription>
                        </div>
                        {!bulkMode && (
                            <button
                                type="button"
                                onClick={handleCopyLastRecord}
                                disabled={copyingLast}
                                title="Copiar datos del último registro (sin email ni contraseña)"
                                className={`flex items-center gap-1.5 shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                                    copiedFlash
                                        ? 'border-[#86EFAC]/60 bg-[#86EFAC]/10 text-[#86EFAC]'
                                        : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-border/80'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {copyingLast ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : copiedFlash ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : (
                                    <ClipboardCopy className="h-3.5 w-3.5" />
                                )}
                                {copiedFlash ? '¡Copiado!' : 'Copiar Último'}
                            </button>
                        )}
                    </div>
                </DialogHeader>

                {/* Mode Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/50">
                    <button
                        type="button"
                        onClick={() => { setBulkMode(false); setBulkResult(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                            !bulkMode
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Individual
                    </button>
                    <button
                        type="button"
                        onClick={() => { setBulkMode(true); setBulkResult(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                            bulkMode
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Carga Masiva
                    </button>
                </div>

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
                            <Select name="platform" required value={selectedPlatformName} onValueChange={handlePlatformChange}>
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

                        {/* Max Slots */}
                        <div className="space-y-2">
                            <Label htmlFor="max_slots">
                                Máx. {slotLabel}
                            </Label>
                            <Input
                                id="max_slots"
                                name="max_slots"
                                type="number"
                                value={maxSlots}
                                onChange={(e) => {
                                    const v = parseInt(e.target.value) || 1;
                                    setMaxSlots(v);
                                    setUserEditedSlots(true);
                                }}
                                min={1}
                                max={10}
                                required
                            />
                        </div>

                        {/* ==================== */}
                        {/* EMAIL/PASSWORD AREA  */}
                        {/* ==================== */}
                        {bulkMode ? (
                            <>
                                {/* Bulk textarea */}
                                <div className="space-y-2">
                                    <Label htmlFor="bulk_accounts">
                                        Lista de Cuentas
                                        {bulkAccounts.length > 0 && (
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#86EFAC]/20 text-[#86EFAC]">
                                                {bulkAccounts.length} cuenta{bulkAccounts.length !== 1 ? 's' : ''} detectada{bulkAccounts.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </Label>
                                    <textarea
                                        id="bulk_accounts"
                                        value={bulkText}
                                        onChange={(e) => setBulkText(e.target.value)}
                                        placeholder={`Pega las cuentas aquí, una por línea:\ncuenta1@gmail.com:contraseña123\ncuenta2@gmail.com:contraseña456\ncuenta3@gmail.com contraseña789`}
                                        rows={6}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/50 placeholder:text-muted-foreground"
                                    />
                                    {bulkDuplicates.length > 0 && (
                                        <div className="flex items-start gap-2 rounded-md bg-orange-500/10 p-2 text-xs text-orange-400">
                                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                            <span>Emails duplicados: {[...new Set(bulkDuplicates)].join(', ')}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Bulk Observación */}
                                <div className="space-y-2">
                                    <Label htmlFor="bulk_notes">Observación <span className="text-xs text-muted-foreground font-normal">(opcional, aplica a todas)</span></Label>
                                    <textarea
                                        id="bulk_notes"
                                        value={bulkNotes}
                                        onChange={(e) => setBulkNotes(e.target.value)}
                                        placeholder="Ej: Lote comprado a Proveedor X, Marzo 2026..."
                                        rows={2}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/50 placeholder:text-muted-foreground"
                                    />
                                </div>

                                {/* Bulk Result */}
                                {bulkResult && (
                                    <div className="rounded-lg border border-border p-3 space-y-2">
                                        {bulkResult.created > 0 && (
                                            <div className="flex items-center gap-2 text-sm text-[#86EFAC]">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span>{bulkResult.created} cuenta{bulkResult.created !== 1 ? 's' : ''} creada{bulkResult.created !== 1 ? 's' : ''} exitosamente</span>
                                            </div>
                                        )}
                                        {bulkResult.errors.length > 0 && (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-sm text-red-400">
                                                    <AlertCircle className="h-4 w-4" />
                                                    <span>{bulkResult.errors.length} error{bulkResult.errors.length !== 1 ? 'es' : ''}</span>
                                                </div>
                                                <div className="max-h-24 overflow-y-auto space-y-1 pl-6">
                                                    {bulkResult.errors.map((err, i) => (
                                                        <p key={i} className="text-xs text-red-400/80">
                                                            <span className="font-mono">{err.email}</span>: {err.error}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Loading progress */}
                                {bulkProgress && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Creando cuentas...</span>
                                            <span>{bulkProgress.current} de {bulkProgress.total}</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#86EFAC] transition-all duration-300"
                                                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Row 2: Email + Password (individual) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email de la cuenta</Label>
                                        <Input
                                            id="email"
                                            name="email"
                                            type="text"
                                            placeholder="cuenta@gmail.com o usuario123"
                                            required={!bulkMode}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Contraseña</Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="text"
                                            placeholder="Contraseña"
                                            required={!bulkMode}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

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
                        {/* USDT Rate Banner */}
                        {rateLoaded && (
                            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">💱 Cambio del día:</span>
                                {editingRate ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">1 USDT =</span>
                                        <Input
                                            type="number"
                                            value={rateInput}
                                            onChange={(e) => setRateInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveRate(); } if (e.key === 'Escape') setEditingRate(false); }}
                                            placeholder="7800"
                                            className="h-7 text-sm w-28"
                                            autoFocus
                                        />
                                        <span className="text-xs text-muted-foreground">Gs.</span>
                                        <button type="button" onClick={handleSaveRate} className="text-[#86EFAC] hover:text-[#86EFAC]/80">
                                            <Check className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        {rate > 0 ? (
                                            <span className="text-sm font-medium text-foreground">
                                                1 USDT = <span className="text-[#86EFAC]">{rate.toLocaleString('es-PY')}</span> Gs.
                                            </span>
                                        ) : (
                                            <span className="text-xs text-orange-400">⚠ Sin cambio configurado</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => { setRateInput(rate > 0 ? String(rate) : ''); setEditingRate(true); }}
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="purchase_cost_usdt">Costo (USDT)</Label>
                                <Input
                                    id="purchase_cost_usdt"
                                    name="purchase_cost_usdt"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={usdtCost}
                                    onChange={(e) => handleUsdtChange(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchase_cost_gs">
                                    Costo (Gs.)
                                    {rate > 0 && usdtCost && (
                                        <span className="ml-1 text-xs text-[#86EFAC] font-normal">auto</span>
                                    )}
                                </Label>
                                <Input
                                    id="purchase_cost_gs"
                                    name="purchase_cost_gs"
                                    type="number"
                                    placeholder="0"
                                    value={gsCost}
                                    onChange={(e) => setGsCost(e.target.value)}
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
                                    value={salePriceGs}
                                    onChange={(e) => setSalePriceGs(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Autopay checkbox */}
                        <div className="flex items-center gap-2 px-1">
                            <input
                                type="checkbox"
                                id="is_autopay"
                                checked={isAutopay}
                                onChange={(e) => setIsAutopay(e.target.checked)}
                                className="h-4 w-4 rounded border-border accent-[#86EFAC]"
                            />
                            <Label htmlFor="is_autopay" className="cursor-pointer text-sm font-normal">
                                🔄 Cuenta autopagable <span className="text-muted-foreground">(sin fecha de vencimiento fija, revisión cada 15 días)</span>
                            </Label>
                        </div>

                        {/* Family account: Invitation fields */}
                        {selectedPlatform?.business_type === 'family_account' && (
                            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-3">
                                <p className="text-xs font-medium text-yellow-400">🔗 Cuenta Familiar — Datos de Invitación</p>
                                <div className="space-y-2">
                                    <Label htmlFor="invitation_url" className="text-sm">Link de Invitación</Label>
                                    <Input
                                        id="invitation_url"
                                        value={invitationUrl}
                                        onChange={(e) => setInvitationUrl(e.target.value)}
                                        placeholder="https://www.spotify.com/py/family/join/invite/..."
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invite_address" className="text-sm">Ubicación / Dirección <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                    <Input
                                        id="invite_address"
                                        value={inviteAddress}
                                        onChange={(e) => setInviteAddress(e.target.value)}
                                        placeholder="Ciudad, País..."
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Row 5: Supplier Select (REQUIRED) */}
                        <div className="space-y-2">
                            <Label>Proveedor <span className="text-red-500">*</span></Label>
                            {/* Hidden inputs carry supplier_id and supplier_name through formData */}
                            <input type="hidden" name="supplier_id" value={selectedSupplierId} />
                            <input type="hidden" name="supplier_name" value={supplierName} />
                            <Select
                                value={selectedSupplierId}
                                onValueChange={(val) => {
                                    setSelectedSupplierId(val);
                                    setSupplierName(suppliers.find(s => s.id === val)?.name || '');
                                }}
                            >
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

                        {/* Slot customization section */}
                        {isFamilyAccount ? (
                            // ── FAMILIA: Correos y contraseñas de clientes finales ──
                            <div className="space-y-3 pt-2 border-t border-border">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                                        Datos de Clientes Finales
                                    </p>
                                    <span className="text-xs text-muted-foreground font-normal">(se guardan en los slots)</span>
                                </div>
                                <div className="space-y-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                                    <p className="text-[10px] text-muted-foreground mb-2">
                                        Ingresa el correo y contraseña que le darás a cada cliente. Estos son los datos que recibirá por WhatsApp.
                                    </p>
                                    {customSlots.map((slot, i) => (
                                        <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                                            <span className="text-xs text-muted-foreground w-6 text-center font-mono">
                                                {i + 1}
                                            </span>
                                            <div className="relative">
                                                <User className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                <Input
                                                    value={slot.name}
                                                    onChange={(e) => updateCustomSlot(i, 'name', e.target.value)}
                                                    placeholder={`correo${i + 1}@gmail.com`}
                                                    className="h-8 text-sm pl-7"
                                                />
                                            </div>
                                            <div className="relative">
                                                <Lock className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                <Input
                                                    value={slot.pin}
                                                    onChange={(e) => updateCustomSlot(i, 'pin', e.target.value)}
                                                    placeholder="Contraseña final"
                                                    className="h-8 text-sm pl-7"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // ── NON-FAMILIA: Checkbox + Personalizar nombres y PINs ──
                            <>
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

                                {customizeSlots && (
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
                            </>
                        )}

                        {/* OBS / Instrucciones */}
                        <div className="space-y-2 pt-2 border-t border-border">
                            <Label htmlFor="instructions" className="flex items-center gap-2">
                                📝 OBS / Instrucciones
                                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                            </Label>
                            <textarea
                                id="instructions"
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="Ej: Para acceder ir a configuración → Perfil → Ingresar código de pantalla..."
                                rows={3}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/50 placeholder:text-muted-foreground"
                            />
                            {instructions.trim() && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="send_instructions"
                                        checked={sendInstructions}
                                        onChange={(e) => setSendInstructions(e.target.checked)}
                                        className="h-4 w-4 rounded border-border accent-[#86EFAC]"
                                    />
                                    <Label htmlFor="send_instructions" className="cursor-pointer text-sm font-normal text-muted-foreground">
                                        Enviar instrucciones por WhatsApp al vender
                                    </Label>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            disabled={loading || (bulkResult !== null && bulkResult.errors.length === 0)}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {bulkMode ? 'Creando...' : 'Guardando...'}
                                </>
                            ) : bulkMode ? (
                                `Crear ${bulkAccounts.length || ''} Cuenta${bulkAccounts.length !== 1 ? 's' : ''}`
                            ) : (
                                'Guardar'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog >
    );
}
