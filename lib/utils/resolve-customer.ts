import { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/utils/phone';

export interface ResolvedCustomer {
    id: string;
    full_name: string;
    phone: string | null;
    wallet_balance: number;
}

/**
 * Resolves a customer record from an authenticated user.
 *
 * Resolution order:
 *  1. `portal_user_id` (canonical, fast)
 *  2. Phone number from `profiles.phone_number`
 *  3. Phone extracted from `@clickpar.shop` email
 *
 * @param admin - Supabase admin client (service_role)
 * @param userId - auth.users UUID
 * @param userEmail - user's email (optional, used for phone extraction)
 * @returns The customer record or null
 */
export async function resolveCustomer(
    admin: SupabaseClient,
    userId: string,
    userEmail?: string | null,
): Promise<ResolvedCustomer | null> {
    // 1. Try portal_user_id (canonical link)
    const { data: byPortalId } = await (admin.from('customers') as any)
        .select('id, full_name, phone, wallet_balance')
        .eq('portal_user_id', userId)
        .maybeSingle();

    if (byPortalId) return byPortalId as ResolvedCustomer;

    // 2. Resolve phone from profile or email
    let resolvedPhone: string | null = null;

    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', userId)
        .single();
    resolvedPhone = profile?.phone_number || null;

    if (!resolvedPhone && userEmail?.endsWith('@clickpar.shop')) {
        const extracted = userEmail.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    if (!resolvedPhone) return null;

    // 3. Try phone variants
    const phonesToTry = [
        normalizePhone(resolvedPhone),
        resolvedPhone,
        resolvedPhone.replace(/^\+/, ''),
    ];

    for (const phone of phonesToTry) {
        const { data } = await (admin.from('customers') as any)
            .select('id, full_name, phone, wallet_balance')
            .eq('phone', phone)
            .maybeSingle();
        if (data) return data as ResolvedCustomer;
    }

    return null;
}
