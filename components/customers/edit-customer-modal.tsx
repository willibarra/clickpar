'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Loader2, Trash2, Key, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateCustomer, deleteCustomer } from '@/lib/actions/customers';

interface Customer {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    customer_type?: string;
    whatsapp_instance?: string | null;
}

export function EditCustomerModal({ customer }: { customer: Customer }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [portalPassword, setPortalPassword] = useState<string | null>(null);
    const [loadingPassword, setLoadingPassword] = useState(false);

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


    return (
        <Dialog open={open} onOpenChange={setOpen}>
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
                            <Select name="customer_type" defaultValue={customer.customer_type || 'cliente'}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cliente">👤 Cliente</SelectItem>
                                    <SelectItem value="creador">🎬 Creador (Canje)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

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

                        {/* Portal password reveal */}
                        <div className="space-y-2">
                            <Label>Contraseña del Portal</Label>
                            <div className="flex items-center gap-2">
                                {portalPassword ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <code className="flex-1 rounded-md bg-muted/50 px-3 py-2 text-sm font-mono text-[#86EFAC]">
                                            {portalPassword}
                                        </code>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPortalPassword(null)}
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
