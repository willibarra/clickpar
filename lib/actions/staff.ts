'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ==========================================
// Get all staff users
// ==========================================
export async function getStaffUsers() {
    const supabase = await createAdminClient();

    // Get profiles with staff/admin role
    const { data: profiles, error } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone_number, role, created_at')
        .in('role', ['staff', 'super_admin'])
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Get emails from auth.users for each profile
    const staffWithEmails = await Promise.all(
        (profiles || []).map(async (profile: any) => {
            const { data: authData } = await supabase.auth.admin.getUserById(profile.id);
            return {
                ...profile,
                email: authData?.user?.email || '',
            };
        })
    );

    return staffWithEmails;
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

    // 2. The handle_new_user trigger already created a profile row.
    //    Now update it with the staff role and phone_number.
    const { error: profileError } = await (supabase.from('profiles') as any)
        .update({
            full_name: formData.fullName,
            phone_number: formData.phone || null,
            role: 'staff',
        })
        .eq('id', authUser.user.id);

    if (profileError) {
        return { error: `Error creando perfil: ${profileError.message}` };
    }

    // Sync role to app_metadata so JWT reflects the staff role
    await supabase.auth.admin.updateUserById(authUser.user.id, {
        app_metadata: { user_role: 'staff' }
    });

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
    if (data.phone !== undefined) updateData.phone_number = data.phone;

    if (Object.keys(updateData).length > 0) {
        const { error } = await (supabase.from('profiles') as any)
            .update(updateData)
            .eq('id', userId);

        if (error) {
            return { error: `Error actualizando: ${error.message}` };
        }
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
