'use client';

import { useState, useEffect } from 'react';
import { Loader2, X, User, Phone, Shield, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateUser } from '@/lib/actions/users';
import { UserProfile, UserRole, AVAILABLE_PERMISSIONS, DEFAULT_PERMISSIONS } from '@/lib/actions/users.types';
import { StaffScheduleEditor } from './staff-schedule-editor';

interface EditUserModalProps {
    isOpen: boolean;
    user: UserProfile;
    onClose: () => void;
    onSuccess: () => void;
}

const roles: { value: UserRole; label: string }[] = [
    { value: 'staff', label: 'Vendedor / Staff' },
    { value: 'super_admin', label: 'Super Admin' },
];

// Group permissions by module
const permissionGroups = [
    { label: 'Inventario', keys: ['inventory.view', 'inventory.edit', 'inventory.create', 'inventory.delete'] },
    { label: 'Ventas', keys: ['sales.view', 'sales.create'] },
    { label: 'Clientes', keys: ['customers.view', 'customers.edit'] },
    { label: 'Finanzas', keys: ['finance.view'] },
    { label: 'Renovaciones', keys: ['renewals.view', 'renewals.manage'] },
    { label: 'Correos', keys: ['emails.view'] },
    { label: 'Ajustes', keys: ['settings.view', 'settings.manage'] },
];

export function EditUserModal({ isOpen, user, onClose, onSuccess }: EditUserModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [fullName, setFullName] = useState(user.full_name || '');
    const [phoneNumber, setPhoneNumber] = useState(user.phone_number || '');
    const [role, setRole] = useState<UserRole>(user.role);
    const [permissions, setPermissions] = useState<Record<string, boolean>>(
        user.permissions && Object.keys(user.permissions).length > 0
            ? user.permissions
            : DEFAULT_PERMISSIONS[user.role] || {}
    );
    const [showPermissions, setShowPermissions] = useState(false);

    // When role changes, apply default permissions for that role
    useEffect(() => {
        if (role !== user.role || !user.permissions || Object.keys(user.permissions).length === 0) {
            setPermissions(DEFAULT_PERMISSIONS[role] || {});
        }
    }, [role]);

    function togglePermission(key: string) {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const result = await updateUser({
            userId: user.id,
            fullName,
            phoneNumber: phoneNumber || undefined,
            role,
            permissions,
        });

        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }

        setLoading(false);
        onSuccess();
    };

    if (!isOpen) return null;

    const isSuperAdmin = role === 'super_admin';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Editar Usuario</h2>
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

                    {/* Email (read-only) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                            Email (no editable)
                        </label>
                        <Input
                            value={user.email || 'N/A'}
                            disabled
                            className="bg-[#1a1a1a] text-muted-foreground"
                        />
                    </div>

                    {/* Full Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Nombre Completo
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Juan Pérez"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="pl-10"
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
                            Rol
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {roles.map((r) => (
                                <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => setRole(r.value)}
                                    className={`rounded-lg border p-2 text-center text-sm transition-all ${role === r.value
                                        ? 'border-[#86EFAC] bg-[#86EFAC]/10 text-[#86EFAC]'
                                        : 'border-border bg-[#1a1a1a] text-foreground hover:border-[#333]'
                                        }`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Permissions Toggle */}
                    <div className="border-t border-border pt-4">
                        <button
                            type="button"
                            onClick={() => setShowPermissions(!showPermissions)}
                            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-[#86EFAC] transition-colors"
                        >
                            <Shield className="h-4 w-4" />
                            Permisos Granulares
                            <span className="text-xs text-muted-foreground ml-1">
                                ({Object.values(permissions).filter(Boolean).length}/{Object.keys(AVAILABLE_PERMISSIONS).length} activados)
                            </span>
                        </button>

                        {showPermissions && (
                            <div className="mt-3 space-y-3">
                                {isSuperAdmin && (
                                    <p className="text-xs text-muted-foreground bg-[#86EFAC]/10 px-3 py-2 rounded-md">
                                        Super Admin tiene todos los permisos automáticamente
                                    </p>
                                )}
                                {permissionGroups.map(group => (
                                    <div key={group.label} className="rounded-lg border border-border/40 bg-[#0d0d0d] p-3">
                                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                            {group.label}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {group.keys.map(key => {
                                                const label = AVAILABLE_PERMISSIONS[key as keyof typeof AVAILABLE_PERMISSIONS];
                                                const active = isSuperAdmin || permissions[key];
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        disabled={isSuperAdmin}
                                                        onClick={() => togglePermission(key)}
                                                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${active
                                                            ? 'bg-[#86EFAC]/20 text-[#86EFAC] border border-[#86EFAC]/30'
                                                            : 'bg-muted/20 text-muted-foreground border border-border/30 hover:bg-muted/40'
                                                            } ${isSuperAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Schedule Manager (Only for staff or super_admin) */}
                    {(role === 'staff' || role === 'super_admin') && (
                        <div className="border-t border-border pt-4">
                            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-[#86EFAC]" />
                                Horario Laboral
                            </h3>
                            <div className="bg-[#0d0d0d] rounded-lg border border-border/40 p-3">
                                <StaffScheduleEditor userId={user.id} userName={fullName || user.email || ''} />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
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
                                    Guardando...
                                </>
                            ) : (
                                'Guardar Cambios'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
