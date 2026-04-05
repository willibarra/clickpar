'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Toggles the show_in_store flag on a mother_account.
 * Called from the inventory view toggle switch.
 */
export async function toggleShowInStore(accountId: string, value: boolean): Promise<{ success: boolean; error?: string }> {
    if (!accountId) {
        return { success: false, error: 'ID de cuenta requerido' };
    }

    const admin = await createAdminClient();

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
