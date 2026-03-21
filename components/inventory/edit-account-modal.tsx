'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Loader2, Trash2, AlertTriangle, RefreshCw, Link } from 'lucide-react';
import { updateMotherAccount, deleteMotherAccount, syncSlots } from '@/lib/actions/inventory';
import { createClient } from '@/lib/supabase/client';

const fallbackPlatforms = ['Netflix', 'Spotify', 'HBO Max', 'Disney+', 'Amazon Prime', 'YouTube Premium', 'Apple TV+', 'Crunchyroll', 'Paramount+', 'Star+'];

interface Platform {
    id: string;
    name: string;
    business_type?: string;
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
    sale_slots?: { id: string }[];
    supplier_name?: string | null;
    supplier_phone?: string | null;
    invitation_url?: string | null;
    invite_address?: string | null;
    sale_type?: string | null;
}

export function EditAccountModal({ account }: { account: Account }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [selectedPlatformType, setSelectedPlatformType] = useState<string>('');

    useEffect(() => {
        if (open) {
            fetchPlatforms();
        }
    }, [open]);

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
            // Set type for current account platform
            const match = typedData.find((p: Platform) => p.name === account.platform);
            setSelectedPlatformType(match?.business_type || '');
        }
    }

    const isFamilyAccount = selectedPlatformType === 'family_account';

    const currentSlots = account.sale_slots?.length || 0;
    const needsSync = currentSlots < account.max_slots;

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

        const formData = new FormData(e.currentTarget);
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
        }
    }

    function handleOpenChange(newOpen: boolean) {
        setOpen(newOpen);
        if (!newOpen) {
            setConfirmDelete(false);
            setError(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] bg-card border-border max-h-[90vh] overflow-y-auto">
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

                {confirmDelete ? (
                    // Confirmation View
                    <div className="py-6">
                        <div className="flex items-center gap-4 rounded-lg bg-red-500/10 p-4 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-500 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-red-500">Esta acción no se puede deshacer</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Se eliminarán todos los slots asociados a esta cuenta.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <DialogFooter className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setConfirmDelete(false)}
                                disabled={deleting}
                            >
                                Cancelar
                            </Button>
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
                        </DialogFooter>
                    </div>
                ) : (
                    // Edit Form View
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
                                            setSelectedPlatformType(p?.business_type || '');
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
                                    type="email"
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
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Proveedor</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="supplier_name">Nombre Proveedor</Label>
                                        <Input
                                            id="supplier_name"
                                            name="supplier_name"
                                            type="text"
                                            defaultValue={account.supplier_name || ''}
                                            placeholder="Nombre del proveedor"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="supplier_phone">Número Proveedor</Label>
                                        <Input
                                            id="supplier_phone"
                                            name="supplier_phone"
                                            type="text"
                                            defaultValue={account.supplier_phone || ''}
                                            placeholder="+595 ..."
                                        />
                                    </div>
                                </div>
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
                        </div>

                        <DialogFooter className="flex justify-between">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => setConfirmDelete(true)}
                                disabled={loading}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
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
