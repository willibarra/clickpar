'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ==========================================
// Get all staff users
// ==========================================
export async function getStaffUsers() {
    const supabase = await createAdminClient();

    const { data, error } = await (supabase.from('profiles') as any)
        .select('id, full_name, email, phone, role, created_at')
        .in('role', ['staff', 'super_admin'])
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

// ==========================================
// Create a new staff user
// ==========================================
export async function createStaffUser(formData: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
}) {
    const supabase = await createAdminClient();

    // 1. Create auth user via admin API
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            full_name: formData.fullName,
        },
    });

    if (authError) {
        return { error: `Error creando usuario: ${authError.message}` };
    }

    if (!authUser.user) {
        return { error: 'No se pudo crear el usuario' };
    }

    // 2. Create/update profile with staff role
    const { error: profileError } = await (supabase.from('profiles') as any)
        .upsert({
            id: authUser.user.id,
            full_name: formData.fullName,
            email: formData.email,
            phone: formData.phone || null,
            role: 'staff',
        });

    if (profileError) {
        return { error: `Error creando perfil: ${profileError.message}` };
    }

    revalidatePath('/settings');
    return { success: true, userId: authUser.user.id };
}

// ==========================================
// Update a staff user
// ==========================================
export async function updateStaffUser(userId: string, data: {
    fullName?: string;
    phone?: string;
    email?: string;
}) {
    const supabase = await createAdminClient();

    // Update profile
    const updateData: Record<string, any> = {};
    if (data.fullName) updateData.full_name = data.fullName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email) updateData.email = data.email;

    const { error } = await (supabase.from('profiles') as any)
        .update(updateData)
        .eq('id', userId);

    if (error) {
        return { error: `Error actualizando: ${error.message}` };
    }

    // Update auth email if changed
    if (data.email) {
        await supabase.auth.admin.updateUserById(userId, {
            email: data.email,
        });
    }

    revalidatePath('/settings');
    return { success: true };
}

// ==========================================
// Delete (deactivate) a staff user
// ==========================================
export async function deleteStaffUser(userId: string) {
    const supabase = await createAdminClient();

    // Delete auth user (which cascades profile in most setups)
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
        return { error: `Error eliminando usuario: ${error.message}` };
    }

    // Also remove profile if cascade didn't handle it
    await (supabase.from('profiles') as any)
        .delete()
        .eq('id', userId);

    revalidatePath('/settings');
    return { success: true };
}
