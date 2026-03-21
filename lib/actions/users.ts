'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { UserRole, UserProfile } from './users.types';
import { logAction } from './audit';

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
        // Obtener perfiles (excluir clientes y afiliados, que se gestionan aparte)
        const { data: profiles, error: profilesError } = await (supabase
            .from('profiles') as any)
            .select('*')
            .not('role', 'in', '(customer,affiliate)')
            .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Obtener emails individualmente por ID (evita problemas de paginación con listUsers)
        const usersWithEmail = await Promise.all(
            (profiles || []).map(async (profile: any) => {
                try {
                    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(profile.id);
                    return { ...profile, email: authUser?.email || 'N/A' };
                } catch {
                    return { ...profile, email: 'N/A' };
                }
            })
        );

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
            },
            app_metadata: { user_role: data.role },
        });

        if (authError) throw authError;

        if (!authData.user) {
            throw new Error('No se pudo crear el usuario');
        }

        // 2. Wait a moment for the handle_new_user trigger to create the profile row
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Upsert the profile with the correct role and data
        //    Using upsert instead of update to handle cases where the trigger
        //    hasn't fired yet or the profile row doesn't exist
        const { error: profileError } = await (supabase
            .from('profiles') as any)
            .upsert({
                id: authData.user.id,
                full_name: data.fullName,
                phone_number: data.phoneNumber || null,
                role: data.role,
            }, { onConflict: 'id' });

        if (profileError) {
            console.error('Profile upsert error:', profileError);
            // Si falla el perfil, intentar eliminar el usuario de auth
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw profileError;
        }

        await logAction('create_user', 'user', authData.user.id, {
            message: `creó al usuario ${data.fullName} (${data.role})`
        });

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

        // Sync role to app_metadata so JWT reflects the new role on next refresh
        if (data.role !== undefined) {
            await supabase.auth.admin.updateUserById(data.userId, {
                app_metadata: { user_role: data.role }
            });
        }

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
        // Verificar que no se está eliminando a sí mismo
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.id === userId) {
            return { error: 'No podés eliminarte a vos mismo' };
        }

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
