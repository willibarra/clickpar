'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface OwnedEmail {
    id: string;
    email: string;
    password: string | null;
    provider: string;
    notes: string | null;
    created_at: string;
}

export interface LinkedAccount {
    id: string;
    platform: string;
    email: string;
    renewal_date: string | null;
}

export interface OwnedEmailWithStatus extends OwnedEmail {
    status: 'libre' | 'en_uso' | 'multi_uso';
    linked_accounts: LinkedAccount[];
}

/**
 * Fetch all owned emails and scan against mother_accounts to determine usage status.
 */
export async function getOwnedEmails(): Promise<OwnedEmailWithStatus[]> {
    const supabase = await createAdminClient();

    // 1. Fetch owned emails
    const { data: emails, error } = await (supabase.from('owned_emails') as any)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (!emails || emails.length === 0) return [];

    // 2. Fetch all mother account emails for cross-reference
    const { data: accounts } = await supabase
        .from('mother_accounts')
        .select('id, platform, email, renewal_date');

    const accountsList = (accounts || []) as any[];

    // 3. Cross-reference: determine status for each owned email
    return emails.map((oe: OwnedEmail) => {
        const normalizedEmail = oe.email.trim().toLowerCase();
        const matches = accountsList.filter(
            (a: any) => a.email && a.email.trim().toLowerCase() === normalizedEmail
        );

        let status: 'libre' | 'en_uso' | 'multi_uso' = 'libre';
        if (matches.length === 1) status = 'en_uso';
        else if (matches.length > 1) status = 'multi_uso';

        return {
            ...oe,
            status,
            linked_accounts: matches.map((m: any) => ({
                id: m.id,
                platform: m.platform,
                email: m.email,
                renewal_date: m.renewal_date,
            })),
        };
    });
}

/**
 * Add a new owned email.
 */
export async function addOwnedEmail(data: {
    email: string;
    password?: string;
    provider?: string;
    notes?: string;
}) {
    const supabase = await createAdminClient();

    const { error } = await (supabase.from('owned_emails') as any).insert({
        email: data.email.trim().toLowerCase(),
        password: data.password || null,
        provider: data.provider || 'gmail',
        notes: data.notes || null,
    });

    if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
            throw new Error('Este correo ya está registrado');
        }
        throw new Error(error.message);
    }

    revalidatePath('/emails');
    return { success: true };
}

/**
 * Update an owned email.
 */
export async function updateOwnedEmail(id: string, fields: Record<string, any>) {
    const supabase = await createAdminClient();

    // Normalize email if provided
    if (fields.email) {
        fields.email = fields.email.trim().toLowerCase();
    }

    const { error } = await (supabase.from('owned_emails') as any)
        .update(fields)
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/emails');
    return { success: true };
}

/**
 * Delete an owned email.
 */
export async function deleteOwnedEmail(id: string) {
    const supabase = await createAdminClient();

    const { error } = await (supabase.from('owned_emails') as any)
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/emails');
    return { success: true };
}
