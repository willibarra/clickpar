'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAction } from './audit';

export async function getAppConfig(key: string): Promise<string | null> {
    const supabase = await createAdminClient();
    const { data } = await (supabase.from('app_config') as any)
        .select('value')
        .eq('key', key)
        .single();
    return data?.value ?? null;
}

export async function setAppConfig(key: string, value: string): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createAdminClient();

    // Get old value for audit
    const { data: oldData } = await (supabase.from('app_config') as any)
        .select('value')
        .eq('key', key)
        .single();

    const { error } = await (supabase.from('app_config') as any)
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return { error: error.message };

    // Audit log
    logAction('update_app_config', 'app_config', key, {
        message: `cambió configuración "${key}"`,
        old_value: oldData?.value,
        new_value: value,
    }).catch(() => {});

    revalidatePath('/settings');
    return { success: true };
}
