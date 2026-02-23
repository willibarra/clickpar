'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { createCustomer } from '@/lib/actions/customers';

export function AddCustomerModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await createCustomer(formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setOpen(false);
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo Cliente
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle>Agregar Cliente</DialogTitle>
                    <DialogDescription>
                        Registra un nuevo cliente en el sistema
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
                                placeholder="Juan Pérez"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email (opcional)</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="cliente@email.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone_number">Teléfono (WhatsApp)</Label>
                            <Input
                                id="phone_number"
                                name="phone_number"
                                placeholder="+595 9XX XXX XXX"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña inicial</Label>
                            <Input
                                id="password"
                                name="password"
                                type="text"
                                placeholder="Dejar vacío para generar automáticamente"
                            />
                            <p className="text-xs text-muted-foreground">
                                El cliente podrá cambiarla después
                            </p>
                        </div>
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
                                    Creando...
                                </>
                            ) : (
                                'Crear Cliente'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
