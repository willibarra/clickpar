'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Loader2, Trash2, Key, EyeOff, RefreshCw, Copy, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateCustomer, deleteCustomer } from '@/lib/actions/customers';

interface Customer {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    customer_type?: string;
    whatsapp_instance?: string | null;
    creator_slug?: string | null;
}

interface EditCustomerModalProps {
    customer: Customer;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function EditCustomerModal({ customer, defaultOpen = false, onOpenChange: onOpenChangeProp }: EditCustomerModalProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [portalPassword, setPortalPassword] = useState<string | null>(null);
    const [loadingPassword, setLoadingPassword] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [customerType, setCustomerType] = useState(customer.customer_type || 'cliente');

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await updateCustomer(customer.id, formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setOpen(false);
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) return;

        setDeleting(true);
        const result = await deleteCustomer(customer.id);

        if (result.error) {
            setError(result.error);
            setDeleting(false);
        } else {
            setOpen(false);
        }
    }

    async function handleShowPassword() {
        setLoadingPassword(true);
        try {
            const res = await fetch('/api/admin/decrypt-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: customer.id }),
            });
            const data = await res.json();
            if (data.password) {
                setPortalPassword(data.password);
            } else {
                setPortalPassword(null);
                setError(data.error || 'No se pudo obtener la contraseña');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoadingPassword(false);
        }
    }

    async function handleRegeneratePassword() {
        if (!confirm('¿Regenerar la contraseña? La contraseña anterior dejará de funcionar.')) return;

        setRegenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/regenerate-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: customer.id }),
            });
            const data = await res.json();
            if (data.password) {
                setPortalPassword(data.password);
            } else {
                setError(data.error || 'No se pudo regenerar la contraseña');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setRegenerating(false);
        }
    }

    function formatPhoneDisplay(phone: string | null) {
        if (!phone) return '';
        const clean = phone.replace(/^\+?595/, '0');
        return clean;
    }

    async function handleCopyCredentials() {
        if (!portalPassword) {
            // Need to fetch password first
            await handleShowPassword();
            return;
        }

        const phoneDisplay = formatPhoneDisplay(customer.phone_number);
        const text = [
            `🔐 Datos de acceso a ClickPar`,
            `📱 Teléfono: ${phoneDisplay}`,
            `🔑 Contraseña: ${portalPassword}`,
            `🌐 Portal: clickpar.shop/cliente/login`,
        ].join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('No se pudo copiar al portapapeles');
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) { setPortalPassword(null); setCopied(false); }
            onOpenChangeProp?.(v);
        }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8">
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle>Editar Cliente</DialogTitle>
                    <DialogDescription>
                        Modifica los datos de {customer.full_name}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="full_name">Nombre completo</Label>
                            <Input
                                id="full_name"
                                name="full_name"
                                defaultValue={customer.full_name || ''}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone_number">Teléfono (WhatsApp)</Label>
                            <Input
                                id="phone_number"
                                name="phone_number"
                                defaultValue={customer.phone_number || ''}
                                placeholder="+595 9XX XXX XXX"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Tipo de cliente</Label>
                            <Select name="customer_type" defaultValue={customer.customer_type || 'cliente'} onValueChange={setCustomerType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cliente">👤 Cliente</SelectItem>
                                    <SelectItem value="creador">🎬 Creador (Canje)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Creator slug — only shown when type is creador */}
                        {customerType === 'creador' && (
                            <div className="space-y-2">
                                <Label htmlFor="creator_slug">URL personalizada</Label>
                                <div className="flex items-center rounded-md border border-input bg-muted/30 px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
                                    <span className="text-muted-foreground select-none whitespace-nowrap">clickpar.net/</span>
                                    <input
                                        id="creator_slug"
                                        name="creator_slug"
                                        defaultValue={customer.creator_slug || ''}
                                        placeholder="genaro"
                                        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50 font-mono"
                                        pattern="[a-z0-9_-]+"
                                        title="Solo letras minúsculas, números, guiones y guiones bajos"
                                        onChange={(e) => {
                                            e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guiones. Ej: <code>genaro</code></p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>WhatsApp preferido</Label>
                            <Select name="whatsapp_instance" defaultValue={customer.whatsapp_instance || 'auto'}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">🔄 Automático (round-robin)</SelectItem>
                                    <SelectItem value="clickpar-1">📱 WhatsApp 1</SelectItem>
                                    <SelectItem value="clickpar-2">📱 WhatsApp 2</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Portal password section */}
                        <div className="space-y-2">
                            <Label>Contraseña del Portal</Label>
                            <div className="space-y-2">
                                {portalPassword ? (
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 rounded-md bg-muted/50 px-3 py-2 text-sm font-mono text-[#86EFAC]">
                                            {portalPassword}
                                        </code>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPortalPassword(null)}
                                            title="Ocultar"
                                        >
                                            <EyeOff className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleShowPassword}
                                        disabled={loadingPassword}
                                        className="gap-1.5"
                                    >
                                        {loadingPassword ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Key className="h-3.5 w-3.5" />
                                        )}
                                        Ver contraseña
                                    </Button>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRegeneratePassword}
                                        disabled={regenerating}
                                        className="gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-300"
                                    >
                                        {regenerating ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Regenerar contraseña
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopyCredentials}
                                        className={`gap-1.5 transition-colors ${copied
                                            ? 'text-[#86EFAC] border-[#86EFAC]/30 bg-[#86EFAC]/10'
                                            : 'text-blue-400 border-blue-400/30 hover:bg-blue-400/10 hover:text-blue-300'
                                        }`}
                                    >
                                        {copied ? (
                                            <Check className="h-3.5 w-3.5" />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                        )}
                                        {copied ? '¡Copiado!' : 'Copiar datos'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-between">
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
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
            </DialogContent>
        </Dialog>
    );
}
