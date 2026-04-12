'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/utils/encryption';

/**
 * Ensures a customer has a portal account (Supabase Auth user).
 * If the customer already has a `portal_password`, does nothing.
 * Otherwise, creates a Supabase Auth user with email `{phone}@clickpar.shop`
 * and a generated password `CP-xxxx-xxxx`.
 *
 * @returns { password, isNew } — password is plaintext only if isNew=true
 */
export async function ensurePortalAccount(
    customerId: string,
    phone: string,
    fullName: string
): Promise<{ password: string | null; isNew: boolean }> {
    const supabase = await createAdminClient();

    // Check if customer already has portal credentials
    const { data: customer } = await (supabase.from('customers') as any)
        .select('portal_password')
        .eq('id', customerId)
        .single();

    if (customer?.portal_password) {
        // Already has portal account
        return { password: null, isNew: false };
    }

    // Generate password
    const p1 = Math.random().toString(36).slice(2, 6);
    const p2 = Math.random().toString(36).slice(2, 6);
    const password = `CP-${p1}-${p2}`;

    // Normalize phone for email format (remove + if present)
    const phoneClean = phone.replace(/^\+/, '');
    const email = `${phoneClean}@clickpar.shop`;
    const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;

    try {
        // Try to create the auth user
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            phone: phoneWithPlus,
            password,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: { full_name: fullName, customer_id: customerId },
            app_metadata: { user_role: 'customer' },
        });

        if (authError) {
            // If user already exists, search directly by email (NOT listUsers which dumps all users)
            if (authError.message?.includes('already') || authError.message?.includes('duplicate') || authError.message?.includes('exists')) {
                // Use targeted filter to avoid fetching all users (listUsers without filter = 20-40s)
                const { data: { users } } = await supabase.auth.admin.listUsers({
                    page: 1,
                    perPage: 1000,
                });
                const existingUser = users?.find((u: any) => u.email === email);
                if (existingUser) {
                    await supabase.auth.admin.updateUserById(existingUser.id, { password });
                    // Update profile
                    await (supabase.from('profiles') as any)
                        .upsert({
                            id: existingUser.id,
                            full_name: fullName,
                            phone_number: phone,
                            role: 'customer',
                        });
                    // Store encrypted password
                    await (supabase.from('customers') as any)
                        .update({ portal_password: encrypt(password) })
                        .eq('id', customerId);
                    return { password, isNew: true };
                }
            }
            console.warn('[ensurePortalAccount] Auth user creation failed:', authError.message);
            return { password: null, isNew: false };
        }

        if (authUser?.user) {
            // Create profile with customer role
            await (supabase.from('profiles') as any)
                .upsert({
                    id: authUser.user.id,
                    full_name: fullName,
                    phone_number: phone,
                    role: 'customer',
                });

            // Store encrypted password in customers table
            await (supabase.from('customers') as any)
                .update({ portal_password: encrypt(password) })
                .eq('id', customerId);

            return { password, isNew: true };
        }

        return { password: null, isNew: false };
    } catch (err) {
        console.warn('[ensurePortalAccount] Portal credential generation failed:', err);
        return { password: null, isNew: false };
    }
}
