'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Loader2, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateCustomer, deleteCustomer } from '@/lib/actions/customers';

interface Customer {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    customer_type?: string;
}

export function EditCustomerModal({ customer }: { customer: Customer }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
