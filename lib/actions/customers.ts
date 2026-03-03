'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

// ============================================
// CUSTOMERS (Profiles with customer role)
// ============================================

export async function createCustomer(formData: FormData) {
    const supabase = await createAdminClient();

    // Email is optional - generate placeholder if not provided
    const rawEmail = formData.get('email') as string;
    const email = rawEmail?.trim() || `customer_${Date.now()}@clickpar.local`;
    const password = formData.get('password') as string || 'TempPass123!';

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            full_name: formData.get('full_name') as string,
        },
    });

    if (authError) {
        return { error: authError.message };
    }

    // Update profile with customer role and phone
    if (authData.user) {
        await (supabase.from('profiles') as any)
            .update({
                full_name: formData.get('full_name') as string,
                phone_number: normalizePhone(formData.get('phone_number') as string || ''),
                role: 'customer',
            })
            .eq('id', authData.user.id);
    }

    revalidatePath('/customers');
    return { success: true };
}

export async function updateCustomer(id: string, formData: FormData) {
    const supabase = await createAdminClient();

    const data = {
        full_name: formData.get('full_name') as string,
        phone_number: normalizePhone(formData.get('phone_number') as string || ''),
    };

    const { error } = await (supabase.from('profiles') as any)
        .update(data)
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/customers');
    return { success: true };
}

export async function deleteCustomer(id: string) {
    const supabase = await createAdminClient();

    // Delete auth user (this will cascade to profile via trigger)
    const { error } = await supabase.auth.admin.deleteUser(id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/customers');
    return { success: true };
}
