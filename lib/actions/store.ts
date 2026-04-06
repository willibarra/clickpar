'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Toggles the show_in_store flag on a mother_account.
 * Called from the inventory view toggle switch.
 * Requires super_admin or staff role.
 */
export async function toggleShowInStore(accountId: string, value: boolean): Promise<{ success: boolean; error?: string }> {
    if (!accountId) {
        return { success: false, error: 'ID de cuenta requerido' };
    }

    // Verify the caller is an admin/staff
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'No autenticado' };
    }

    const admin = await createAdminClient();

    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['super_admin', 'staff'].includes(profile.role)) {
        return { success: false, error: 'No autorizado' };
    }

    const { error } = await (admin.from('mother_accounts') as any)
        .update({ show_in_store: value })
        .eq('id', accountId);

    if (error) {
        console.error('[toggleShowInStore] Error:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/inventory');
    return { success: true };
}
