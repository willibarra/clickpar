'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, Loader2, Search, Shield, Trash2, Edit2, Phone, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddUserModal } from './add-user-modal';
import { EditUserModal } from './edit-user-modal';
import { getAllUsers, deleteUser } from '@/lib/actions/users';
import { UserProfile, UserRole } from '@/lib/actions/users.types';

const roleLabels: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    staff: 'Staff',
    customer: 'Cliente',
    affiliate: 'Afiliado',
    vendedor: 'Vendedor',
    proveedor: 'Proveedor',
};

const roleColors: Record<UserRole, string> = {
    super_admin: 'bg-red-500/20 text-red-500',
    staff: 'bg-[#86EFAC]/20 text-[#86EFAC]',
    customer: 'bg-blue-500/20 text-blue-500',
    affiliate: 'bg-purple-500/20 text-purple-500',
    vendedor: 'bg-[#F97316]/20 text-[#F97316]',
    proveedor: 'bg-yellow-500/20 text-yellow-500',
};

export function UserManagementPanel() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const loadUsers = async () => {
        setLoading(true);
        const { users: fetchedUsers, error } = await getAllUsers();
        if (!error) {
            setUsers(fetchedUsers);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadUsers();
        // Obtener el usuario actual
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id || null);
        });
    }, []);

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) {
            return;
        }
        setDeletingUserId(userId);
        const result = await deleteUser(userId);
        if (result.success) {
            setUsers(users.filter(u => u.id !== userId));
        } else {
            alert(result.error || 'Error al eliminar usuario');
        }
        setDeletingUserId(null);
    };

    const filteredUsers = users.filter(user => {
        const query = searchQuery.toLowerCase();
        return (
            (user.full_name?.toLowerCase().includes(query) || false) ||
            (user.email?.toLowerCase().includes(query) || false) ||
            (user.phone_number?.toLowerCase().includes(query) || false)
        );
    });

    const getInitials = (name: string | null) => {
        if (!name) return 'XX';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <Card className="border-border bg-card">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-[#86EFAC]" />
                        <CardTitle>Gestión de Usuarios</CardTitle>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Usuario
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre, email o teléfono..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{users.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                        <p className="text-2xl font-bold text-red-500">
                            {users.filter(u => u.role === 'super_admin').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Admins</p>
                    </div>
                    <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                        <p className="text-2xl font-bold text-[#F97316]">
                            {users.filter(u => u.role === 'vendedor' || u.role === 'staff').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Staff/Vendedores</p>
                    </div>
                    <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                        <p className="text-2xl font-bold text-blue-500">
                            {users.filter(u => u.role === 'customer').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Clientes</p>
                    </div>
                </div>

                {/* Users List */}
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                            {searchQuery ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredUsers.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center justify-between rounded-lg border border-border bg-[#1a1a1a] p-4 transition-colors hover:bg-[#222]"
                            >
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10 border border-border">
                                        <AvatarFallback className="bg-[#86EFAC]/20 text-[#86EFAC]">
                                            {getInitials(user.full_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium text-foreground">
                                            {user.full_name || 'Sin nombre'}
                                        </p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            {user.email && (
                                                <span className="flex items-center gap-1">
                                                    <Mail className="h-3 w-3" />
                                                    {user.email}
                                                </span>
                                            )}
                                            {user.phone_number && (
                                                <span className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3" />
                                                    {user.phone_number}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${roleColors[user.role]}`}>
                                        {roleLabels[user.role]}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingUser(user)}
                                            className="h-8 w-8 p-0 hover:bg-[#333]"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        {user.id !== currentUserId && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteUser(user.id)}
                                                disabled={deletingUserId === user.id}
                                                className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-500"
                                            >
                                                {deletingUserId === user.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Modals */}
            <AddUserModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={() => {
                    setIsAddModalOpen(false);
                    loadUsers();
                }}
            />

            {editingUser && (
                <EditUserModal
                    isOpen={!!editingUser}
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSuccess={() => {
                        setEditingUser(null);
                        loadUsers();
                    }}
                />
            )}
        </Card>
    );
}
