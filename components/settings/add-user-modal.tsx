'use client';

import { useState } from 'react';
import { Loader2, X, User, Mail, Lock, Phone, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createUser, UserRole } from '@/lib/actions/users';

interface AddUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const roles: { value: UserRole; label: string; description: string }[] = [
    { value: 'super_admin', label: 'Super Admin', description: 'Acceso total al sistema' },
    { value: 'staff', label: 'Staff', description: 'Gestión de inventario y ventas' },
    { value: 'vendedor', label: 'Vendedor', description: 'Solo puede vender' },
    { value: 'customer', label: 'Cliente', description: 'Usuario final' },
    { value: 'affiliate', label: 'Afiliado', description: 'Puede referir clientes' },
    { value: 'proveedor', label: 'Proveedor', description: 'Proveedor de cuentas' },
];

export function AddUserModal({ isOpen, onClose, onSuccess }: AddUserModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [role, setRole] = useState<UserRole>('customer');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const result = await createUser({
            email,
            password,
            fullName,
            phoneNumber: phoneNumber || undefined,
            role,
        });

        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }

        // Reset form
        setEmail('');
        setPassword('');
        setFullName('');
        setPhoneNumber('');
        setRole('customer');
        setLoading(false);
        onSuccess();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Nuevo Usuario</h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-[#333]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Email *
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="email"
                                placeholder="usuario@ejemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10"
                                required
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Contraseña *
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-10"
                                required
                                minLength={6}
                            />
                        </div>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Nombre Completo *
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Juan Pérez"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="pl-10"
                                required
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Teléfono (WhatsApp)
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="tel"
                                placeholder="+595 9XX XXX XXX"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Role */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Rol *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {roles.map((r) => (
                                <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => setRole(r.value)}
                                    className={`rounded-lg border p-3 text-left transition-all ${role === r.value
                                            ? 'border-[#86EFAC] bg-[#86EFAC]/10'
                                            : 'border-border bg-[#1a1a1a] hover:border-[#333]'
                                        }`}
                                >
                                    <p className="font-medium text-foreground text-sm">{r.label}</p>
                                    <p className="text-xs text-muted-foreground">{r.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="rounded-lg bg-blue-500/10 p-3 text-xs text-blue-400">
                        <Shield className="inline h-3 w-3 mr-1" />
                        El usuario será creado sin requerir verificación de email/teléfono (bypass administrativo).
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creando...
                                </>
                            ) : (
                                'Crear Usuario'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
