'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Lock, Key, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { updateSlot } from '@/lib/actions/inventory';

interface SlotDetailsModalProps {
    slot: {
        id: string;
        slot_identifier: string | null;
        status: string;
        pin_code: string | null;
    };
    account: {
        platform: string;
        email: string;
        password: string;
    };
}

const statusOptions = [
    { value: 'available', label: 'Disponible', color: 'bg-[#86EFAC] text-black' },
    { value: 'sold', label: 'Vendido', color: 'bg-[#F97316] text-white' },
    { value: 'reserved', label: 'Reservado', color: 'bg-yellow-500 text-black' },
    { value: 'warranty_claim', label: 'En Garantía', color: 'bg-red-500 text-white' },
];

export function SlotDetailsModal({ slot, account }: SlotDetailsModalProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [status, setStatus] = useState(slot.status);
    const [pinCode, setPinCode] = useState(slot.pin_code || '');
    const [slotName, setSlotName] = useState(slot.slot_identifier || '');

    const statusColor = statusOptions.find(s => s.value === slot.status)?.color || 'bg-gray-500';

    async function handleSave() {
        setLoading(true);
        const formData = new FormData();
        formData.set('slot_identifier', slotName);
        formData.set('pin_code', pinCode);
        formData.set('status', status);

        const result = await updateSlot(slot.id, formData);

        if (!result.error) {
            setOpen(false);
        }
        setLoading(false);
    }

    async function copyToClipboard(text: string, key: string) {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    className={`rounded px-2 py-1 text-xs font-medium transition-all hover:scale-105 hover:ring-2 hover:ring-white/30 ${statusColor}`}
                    title="Click para ver detalles"
                >
                    {slot.slot_identifier?.replace('Perfil ', 'P').replace('Miembro ', 'M') || 'S'}
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {slot.slot_identifier || 'Slot'}
                    </DialogTitle>
                    <DialogDescription>
                        Detalles y credenciales de este perfil
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Account Info (read-only) */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">
                            Cuenta Madre: {account.platform}
                        </h4>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Email</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono">{account.email}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => copyToClipboard(account.email, 'email')}
                                    >
                                        {copied === 'email' ? (
                                            <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Contraseña</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono">
                                        {showPassword ? account.password : '••••••••'}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-3 w-3" />
                                        ) : (
                                            <Eye className="h-3 w-3" />
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => copyToClipboard(account.password, 'password')}
                                    >
                                        {copied === 'password' ? (
                                            <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Slot Editable Fields */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="slot_name">Nombre del Perfil</Label>
                            <Input
                                id="slot_name"
                                value={slotName}
                                onChange={(e) => setSlotName(e.target.value)}
                                placeholder="Perfil 1"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pin_code" className="flex items-center gap-2">
                                <Key className="h-4 w-4" />
                                PIN del Perfil
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="pin_code"
                                    value={pinCode}
                                    onChange={(e) => setPinCode(e.target.value)}
                                    placeholder="1234"
                                    maxLength={6}
                                    className="font-mono text-lg tracking-widest"
                                />
                                {pinCode && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => copyToClipboard(pinCode, 'pin')}
                                    >
                                        {copied === 'pin' ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Estado</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {statusOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div className="flex items-center gap-2">
                                                <div className={`h-2 w-2 rounded-full ${opt.color.split(' ')[0]}`} />
                                                {opt.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                        disabled={loading}
                        onClick={handleSave}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar Cambios'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
