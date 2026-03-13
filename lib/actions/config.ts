'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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
    const { error } = await (supabase.from('app_config') as any)
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return { error: error.message };
    revalidatePath('/settings');
    return { success: true };
}
