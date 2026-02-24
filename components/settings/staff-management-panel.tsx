'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Plus, Edit3, Trash2, Loader2, Eye, EyeOff,
    Shield, UserCheck, Mail, Phone, Lock, X, Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getStaffUsers, createStaffUser, updateStaffUser, deleteStaffUser } from '@/lib/actions/staff';

type StaffUser = {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: string;
    created_at: string;
};

export function StaffManagementPanel() {
    const [staff, setStaff] = useState<StaffUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const fetchStaff = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getStaffUsers();
            setStaff(data);
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchStaff(); }, [fetchStaff]);

    const resetForm = () => {
        setFormName('');
        setFormEmail('');
        setFormPhone('');
        setFormPassword('');
        setShowForm(false);
        setEditingUser(null);
        setError(null);
    };

    const handleCreate = async () => {
        if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
            setError('Nombre, email y contraseña son requeridos');
            return;
        }

        setSaving(true);
        setError(null);

        const result = await createStaffUser({
            email: formEmail.trim(),
            password: formPassword.trim(),
            fullName: formName.trim(),
            phone: formPhone.trim() || undefined,
        });

        if (result.error) {
            setError(result.error);
            setSaving(false);
            return;
        }

        resetForm();
        setSaving(false);
        fetchStaff();
    };

    const handleUpdate = async () => {
        if (!editingUser || !formName.trim()) {
            setError('Nombre es requerido');
            return;
        }

        setSaving(true);
        setError(null);

        const result = await updateStaffUser(editingUser.id, {
            fullName: formName.trim(),
            phone: formPhone.trim() || undefined,
            email: formEmail.trim() || undefined,
        });

        if (result.error) {
            setError(result.error);
            setSaving(false);
            return;
        }

        resetForm();
        setSaving(false);
        fetchStaff();
    };

    const handleDelete = async (userId: string) => {
        if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) return;

        setDeletingId(userId);
        const result = await deleteStaffUser(userId);

        if (result.error) {
            setError(result.error);
        }

        setDeletingId(null);
        fetchStaff();
    };

    const startEdit = (user: StaffUser) => {
        setEditingUser(user);
        setFormName(user.full_name || '');
        setFormEmail(user.email || '');
        setFormPhone(user.phone || '');
        setFormPassword('');
        setShowForm(true);
        setError(null);
    };

    return (
        <Card className="border-border bg-card">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-[#86EFAC]" />
                            Equipo
                        </CardTitle>
                        <CardDescription>Gestiona los miembros del equipo de trabajo</CardDescription>
                    </div>
                    {!showForm && (
                        <Button
                            onClick={() => { setShowForm(true); resetForm(); setShowForm(true); }}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            size="sm"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Nuevo Miembro
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Error display */}
                {error && (
                    <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                        {error}
                    </div>
                )}

                {/* Create/Edit Form */}
                {showForm && (
                    <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                                {editingUser ? 'Editar Miembro' : 'Nuevo Miembro'}
                            </h3>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetForm}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs flex items-center gap-1">
                                    <UserCheck className="h-3 w-3" /> Nombre
                                </Label>
                                <Input
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Nombre completo"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs flex items-center gap-1">
                                    <Mail className="h-3 w-3" /> Email
                                </Label>
                                <Input
                                    type="email"
                                    value={formEmail}
                                    onChange={(e) => setFormEmail(e.target.value)}
                                    placeholder="email@ejemplo.com"
                                    className="h-9"
                                    disabled={!!editingUser}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> Teléfono
                                </Label>
                                <Input
                                    value={formPhone}
                                    onChange={(e) => setFormPhone(e.target.value)}
                                    placeholder="0981..."
                                    className="h-9"
                                />
                            </div>
                            {!editingUser && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs flex items-center gap-1">
                                        <Lock className="h-3 w-3" /> Contraseña temporal
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            placeholder="Mínimo 6 caracteres"
                                            className="h-9 pr-8"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-1">
                            <Button
                                onClick={editingUser ? handleUpdate : handleCreate}
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                size="sm"
                                disabled={saving}
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                    <Check className="h-4 w-4 mr-1" />
                                )}
                                {editingUser ? 'Guardar' : 'Crear'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={resetForm}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Staff List */}
                {loading ? (
                    <div className="py-8 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </div>
                ) : staff.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No hay miembros del equipo</p>
                ) : (
                    <div className="space-y-2">
                        {staff.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/20 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`rounded-full p-2 ${user.role === 'super_admin' ? 'bg-yellow-400/10' : 'bg-blue-400/10'}`}>
                                        {user.role === 'super_admin' ? (
                                            <Shield className="h-4 w-4 text-yellow-400" />
                                        ) : (
                                            <UserCheck className="h-4 w-4 text-blue-400" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{user.full_name || 'Sin nombre'}</p>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${user.role === 'super_admin' ? 'border-yellow-400/30 text-yellow-400' : 'border-blue-400/30 text-blue-400'}`}
                                            >
                                                {user.role === 'super_admin' ? 'Super Admin' : 'Staff'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {user.email} {user.phone ? `· ${user.phone}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {user.role !== 'super_admin' && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                onClick={() => startEdit(user)}
                                            >
                                                <Edit3 className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                                                onClick={() => handleDelete(user.id)}
                                                disabled={deletingId === user.id}
                                            >
                                                {deletingId === user.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
