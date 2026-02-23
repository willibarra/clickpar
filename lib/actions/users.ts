'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// Tipos de roles disponibles
export type UserRole = 'super_admin' | 'staff' | 'customer' | 'affiliate' | 'vendedor' | 'proveedor';

export interface UserProfile {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    role: UserRole;
    avatar_url: string | null;
    created_at: string;
    email?: string;
    permissions?: Record<string, boolean>;
}

// Permisos disponibles en el sistema
export const AVAILABLE_PERMISSIONS = {
    'inventory.view': 'Ver Inventario',
    'inventory.edit': 'Editar Inventario',
    'inventory.create': 'Crear Cuentas',
    'inventory.delete': 'Eliminar Cuentas',
    'sales.view': 'Ver Ventas',
    'sales.create': 'Crear Ventas',
    'customers.view': 'Ver Clientes',
    'customers.edit': 'Editar Clientes',
    'finance.view': 'Ver Finanzas',
    'renewals.view': 'Ver Renovaciones',
    'renewals.manage': 'Gestionar Renovaciones',
    'emails.view': 'Ver Correos',
    'settings.view': 'Ver Ajustes',
    'settings.manage': 'Gestionar Ajustes',
} as const;

// Permisos por defecto según el rol
export const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
    super_admin: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, true])),
    staff: {
        'inventory.view': true, 'inventory.edit': true, 'inventory.create': true, 'inventory.delete': false,
        'sales.view': true, 'sales.create': true,
        'customers.view': true, 'customers.edit': true,
        'finance.view': false,
        'renewals.view': true, 'renewals.manage': true,
        'emails.view': true,
        'settings.view': false, 'settings.manage': false,
    },
    vendedor: {
        'inventory.view': true, 'inventory.edit': false, 'inventory.create': false, 'inventory.delete': false,
        'sales.view': true, 'sales.create': true,
        'customers.view': true, 'customers.edit': false,
        'finance.view': false,
        'renewals.view': true, 'renewals.manage': false,
        'emails.view': true,
        'settings.view': false, 'settings.manage': false,
    },
    customer: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    affiliate: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    proveedor: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
};

interface CreateUserData {
    email: string;
    password: string;
    fullName: string;
    phoneNumber?: string;
    role: UserRole;
}

interface UpdateUserData {
    userId: string;
    fullName?: string;
    phoneNumber?: string;
    role?: UserRole;
    permissions?: Record<string, boolean>;
}

// Obtener todos los usuarios
export async function getAllUsers(): Promise<{ users: UserProfile[]; error?: string }> {
    const supabase = await createAdminClient();

    try {
        // Obtener perfiles
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Obtener emails de auth.users (solo disponible con service_role)
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

        if (authError) {
            console.error('Error fetching auth users:', authError);
        }

        // Mapear emails a perfiles
        const usersWithEmail = (profiles || []).map((profile: any) => {
            const authUser = authUsers?.users?.find((u: any) => u.id === profile.id);
            return {
                ...profile,
                email: authUser?.email || 'N/A'
            };
        });

        return { users: usersWithEmail };
    } catch (error: any) {
        console.error('Error getting users:', error);
        return { users: [], error: error.message };
    }
}

// Crear nuevo usuario (bypass de verificación)
export async function createUser(data: CreateUserData) {
    const supabase = await createAdminClient();

    try {
        // 1. Crear usuario en auth.users usando admin API (bypass verification)
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true, // Auto-confirmar email (bypass)
            user_metadata: {
                full_name: data.fullName,
            }
        });

        if (authError) throw authError;

        if (!authData.user) {
            throw new Error('No se pudo crear el usuario');
        }

        // 2. Actualizar el perfil con los datos adicionales
        const { error: profileError } = await (supabase
            .from('profiles') as any)
            .update({
                full_name: data.fullName,
                phone_number: data.phoneNumber || null,
                role: data.role,
            })
            .eq('id', authData.user.id);

        if (profileError) {
            // Si falla el perfil, intentar eliminar el usuario de auth
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw profileError;
        }

        revalidatePath('/settings');
        return { success: true, userId: authData.user.id };
    } catch (error: any) {
        console.error('Error creating user:', error);
        return { error: error.message || 'Error al crear usuario' };
    }
}

// Actualizar usuario existente
export async function updateUser(data: UpdateUserData) {
    const supabase = await createAdminClient();

    try {
        const updateData: any = {};
        if (data.fullName !== undefined) updateData.full_name = data.fullName;
        if (data.phoneNumber !== undefined) updateData.phone_number = data.phoneNumber;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.permissions !== undefined) updateData.permissions = data.permissions;

        const { error } = await (supabase
            .from('profiles') as any)
            .update(updateData)
            .eq('id', data.userId);

        if (error) throw error;

        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error('Error updating user:', error);
        return { error: error.message || 'Error al actualizar usuario' };
    }
}

// Eliminar usuario
export async function deleteUser(userId: string) {
    const supabase = await createAdminClient();

    try {
        // Eliminar de auth.users (esto también eliminará el perfil por CASCADE)
        const { error } = await supabase.auth.admin.deleteUser(userId);

        if (error) throw error;

        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        return { error: error.message || 'Error al eliminar usuario' };
    }
}
