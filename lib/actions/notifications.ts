// @ts-nocheck
'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface Notification {
    id: string;
    type: string;
    message: string;
    is_read: boolean;
    is_resolved: boolean;
    related_resource_id: string | null;
    related_resource_type: string | null;
    created_at: string;
}

/**
 * Get all notifications, ordered by newest first
 */
export async function getNotifications(onlyUnread = false): Promise<Notification[]> {
    const supabase = await createAdminClient();

    let query = (supabase.from('notifications') as any)
        .select('*')
        .order('created_at', { ascending: false });

    if (onlyUnread) {
        query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as Notification[];
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<number> {
    const supabase = await createAdminClient();
    const { count, error } = await (supabase.from('notifications') as any)
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
    if (error) return 0;
    return count || 0;
}

/**
 * Mark notification as read
 */
export async function markAsRead(id: string) {
    const supabase = await createAdminClient();
    await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id);
    revalidatePath('/');
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead() {
    const supabase = await createAdminClient();
    await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('is_read', false);
    revalidatePath('/');
}

/**
 * Resolve a security alert (password change notification)
 * Updates the mother_account password and marks the notification as resolved.
 */
export async function resolvePasswordAlert(notificationId: string, accountId: string, newPassword: string) {
    const supabase = await createAdminClient();

    // Update the mother account password
    const { error: updateError } = await supabase
        .from('mother_accounts')
        .update({ password: newPassword })
        .eq('id', accountId);

    if (updateError) return { error: updateError.message };

    // Mark notification as resolved + read
    await (supabase.from('notifications') as any)
        .update({ is_resolved: true, is_read: true })
        .eq('id', notificationId);

    revalidatePath('/');
    revalidatePath('/inventory');
    return { success: true };
}

/**
 * Create a notification (internal helper)
 */
export async function createNotification(data: {
    type: string;
    message: string;
    related_resource_id?: string;
    related_resource_type?: string;
}) {
    const supabase = await createAdminClient();
    await (supabase.from('notifications') as any).insert({
        type: data.type,
        message: data.message,
        related_resource_id: data.related_resource_id || null,
        related_resource_type: data.related_resource_type || null,
    });
}

/**
 * Check for mixed-status security vulnerability on a mother account.
 * Called when a slot status changes to expired/cancelled.
 * If active slots remain alongside the expired one, generates a password rotation alert.
 */
export async function checkPasswordRotation(motherAccountId: string) {
    const supabase = await createAdminClient();

    // Get the mother account info
    const { data: account } = await supabase
        .from('mother_accounts')
        .select('id, platform, email')
        .eq('id', motherAccountId)
        .single();

    if (!account) return;

    // Get all slots for this account
    const { data: slots } = await (supabase.from('sale_slots') as any)
        .select('id, status')
        .eq('mother_account_id', motherAccountId);

    if (!slots || slots.length === 0) return;

    const statuses = slots.map((s: any) => s.status);
    const hasActive = statuses.includes('sold');
    const hasExpiredOrFree = statuses.includes('available') || statuses.includes('expired') || statuses.includes('cancelled');

    // Mixed status: some paid, some not — security risk
    if (hasActive && hasExpiredOrFree) {
        // Check if there's already an unresolved alert for this account
        const { data: existing } = await (supabase.from('notifications') as any)
            .select('id')
            .eq('type', 'security_password_rotation')
            .eq('related_resource_id', motherAccountId)
            .eq('is_resolved', false);

        if (existing && existing.length > 0) return; // Already alerted

        await createNotification({
            type: 'security_password_rotation',
            message: `⚠️ Cambio de contraseña requerido en ${(account as any).platform} (${(account as any).email}) — Un usuario dejó de pagar mientras otros siguen activos.`,
            related_resource_id: motherAccountId,
            related_resource_type: 'mother_account',
        });
    }
}
