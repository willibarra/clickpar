'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAction } from './audit';

// ============================================
// MOTHER ACCOUNTS
// ============================================

export async function createMotherAccount(formData: FormData) {
    const supabase = await createClient();

    const maxSlots = parseInt(formData.get('max_slots') as string) || 0;
    const renewalDate = formData.get('renewal_date') as string;
    const saleType = (formData.get('sale_type') as string) || 'profile';

    // Auto-derive billing day from purchase date
    const billingDay = renewalDate ? new Date(renewalDate + 'T12:00:00').getDate() : new Date().getDate();

    const data = {
        supplier_id: formData.get('supplier_id') as string || null,
        platform: formData.get('platform') as string,
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        purchase_cost_usdt: parseFloat(formData.get('purchase_cost_usdt') as string) || 0,
        purchase_cost_gs: parseFloat(formData.get('purchase_cost_gs') as string) || 0,
        renewal_date: renewalDate,
        target_billing_day: billingDay,
        max_slots: maxSlots,
        status: 'active',
        supplier_name: formData.get('supplier_name') as string || null,
        supplier_phone: formData.get('supplier_phone') as string || null,
        sale_price_gs: parseFloat(formData.get('sale_price_gs') as string) || null,
        sale_type: saleType,
        instructions: (formData.get('instructions') as string) || null,
        send_instructions: formData.get('send_instructions') === 'true',
    };

    // Upsert owned email if checkbox was checked
    const isOwnedEmail = formData.get('is_owned_email') === 'true';
    if (isOwnedEmail) {
        const emailPassword = formData.get('email_password') as string || null;
        const emailNorm = data.email.trim().toLowerCase();
        // Detect provider from domain
        let provider = 'otro';
        if (emailNorm.includes('@gmail')) provider = 'gmail';
        else if (emailNorm.includes('@hotmail')) provider = 'hotmail';
        else if (emailNorm.includes('@outlook')) provider = 'outlook';
        else if (emailNorm.includes('@yahoo')) provider = 'yahoo';

        await (supabase.from('owned_emails') as any).upsert(
            { email: emailNorm, password: emailPassword, provider },
            { onConflict: 'email' }
        );
    }

    // Crear la cuenta madre
    const { data: newAccount, error } = await (supabase.from('mother_accounts') as any)
        .insert(data)
        .select()
        .single();

    if (error) {
        return { error: error.message };
    }

    await logAction('create_account', 'mother_account', newAccount.id, {
        message: `agregó una nueva cuenta de ${data.platform} (${data.email})`
    });

    // Skip slot creation for complete accounts
    if (saleType === 'complete' || maxSlots === 0) {
        revalidatePath('/inventory');
        return { success: true };
    }

    // Parse custom slots if provided
    const customSlotsJson = formData.get('custom_slots') as string;
    let customSlots: { name: string; pin: string }[] = [];
    if (customSlotsJson) {
        try { customSlots = JSON.parse(customSlotsJson); } catch (_) { /* ignore */ }
    }

    // Auto-crear los slots basados en max_slots
    const slots = [];
    for (let i = 1; i <= maxSlots; i++) {
        const custom = customSlots[i - 1];
        slots.push({
            mother_account_id: newAccount.id,
            slot_identifier: custom?.name || `Perfil ${i}`,
            pin_code: custom?.pin || null,
            status: 'available',
        });
    }

    const { error: slotsError } = await (supabase.from('sale_slots') as any).insert(slots);

    if (slotsError) {
        console.error('Error creating slots:', slotsError);
    }

    revalidatePath('/inventory');
    return { success: true };
}

export async function updateMotherAccount(id: string, formData: FormData) {
    const supabase = await createClient();

    const renewalDate = formData.get('renewal_date') as string;
    const billingDay = renewalDate ? new Date(renewalDate + 'T12:00:00').getDate() : undefined;

    const data: Record<string, any> = {
        platform: formData.get('platform') as string,
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        purchase_cost_usdt: parseFloat(formData.get('purchase_cost_usdt') as string) || 0,
        purchase_cost_gs: parseFloat(formData.get('purchase_cost_gs') as string) || 0,
        renewal_date: renewalDate,
        max_slots: parseInt(formData.get('max_slots') as string) || 5,
        status: formData.get('status') as string || 'active',
        supplier_name: formData.get('supplier_name') as string || null,
        supplier_phone: formData.get('supplier_phone') as string || null,
        sale_price_gs: parseFloat(formData.get('sale_price_gs') as string) || null,
    };

    if (billingDay !== undefined) {
        data.target_billing_day = billingDay;
    }

    const { error } = await (supabase.from('mother_accounts') as any)
        .update(data)
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    await logAction('update_account', 'mother_account', id, {
        message: `editó la cuenta de ${data.platform} (${data.email})`
    });

    revalidatePath('/inventory');
    return { success: true };
}

export async function deleteMotherAccount(id: string) {
    const supabase = await createClient();

    // First delete all slots
    await (supabase.from('sale_slots') as any).delete().eq('mother_account_id', id);

    // Then delete the account
    const { error } = await (supabase.from('mother_accounts') as any).delete().eq('id', id);

    if (error) {
        return { error: error.message };
    }

    await logAction('delete_account', 'mother_account', id, {
        message: `eliminó una cuenta del inventario`
    });

    revalidatePath('/inventory');
    return { success: true };
}

// ============================================
// SALE SLOTS
// ============================================

export async function createSlot(formData: FormData) {
    const supabase = await createClient();

    const motherAccountId = formData.get('mother_account_id') as string;
    const data = {
        mother_account_id: motherAccountId,
        slot_identifier: formData.get('slot_identifier') as string,
        pin_code: formData.get('pin_code') as string || null,
        status: 'available',
    };

    const { error } = await (supabase.from('sale_slots') as any).insert(data);

    if (error) {
        return { error: error.message };
    }

    // Incrementar max_slots en la cuenta madre
    const { data: account } = await (supabase.from('mother_accounts') as any)
        .select('max_slots')
        .eq('id', motherAccountId)
        .single();

    if (account) {
        await (supabase.from('mother_accounts') as any)
            .update({ max_slots: (account.max_slots || 0) + 1 })
            .eq('id', motherAccountId);
    }

    await logAction('create_slot', 'slot', motherAccountId, {
        message: `agregó un slot (${data.slot_identifier}) a una cuenta madre`
    });

    revalidatePath('/inventory');
    return { success: true };
}

export async function updateSlot(id: string, formData: FormData) {
    const supabase = await createClient();

    const data: Record<string, any> = {};

    const slotIdentifier = formData.get('slot_identifier');
    if (slotIdentifier) data.slot_identifier = slotIdentifier;

    const pinCode = formData.get('pin_code');
    if (pinCode !== null) data.pin_code = pinCode || null;

    const status = formData.get('status');
    if (status) data.status = status;

    const { error } = await (supabase.from('sale_slots') as any)
        .update(data)
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/inventory');
    return { success: true };
}

export async function updateSlotStatus(id: string, status: string) {
    const supabase = await createClient();

    const { error } = await (supabase.from('sale_slots') as any)
        .update({ status })
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/inventory');
    return { success: true };
}

export async function deleteSlot(id: string) {
    const supabase = await createClient();

    // Verificar que el slot no esté vendido
    const { data: slot } = await (supabase.from('sale_slots') as any)
        .select('status, mother_account_id')
        .eq('id', id)
        .single();

    if (!slot) {
        return { error: 'Slot no encontrado' };
    }

    if (slot.status === 'sold') {
        return { error: 'No se puede eliminar un slot vendido. Primero cancele la venta.' };
    }

    const { error } = await (supabase.from('sale_slots') as any).delete().eq('id', id);

    if (error) {
        return { error: error.message };
    }

    // Decrementar max_slots en la cuenta madre
    const { data: account } = await (supabase.from('mother_accounts') as any)
        .select('max_slots')
        .eq('id', slot.mother_account_id)
        .single();

    if (account && (account.max_slots || 0) > 0) {
        await (supabase.from('mother_accounts') as any)
            .update({ max_slots: account.max_slots - 1 })
            .eq('id', slot.mother_account_id);
    }

    await logAction('delete_slot', 'slot', id, {
        message: `eliminó un slot de una cuenta madre`
    });

    revalidatePath('/inventory');
    return { success: true };
}

/**
 * Sincronizar/regenerar slots faltantes para una cuenta madre
 * Si la cuenta tiene menos slots que max_slots, crea los faltantes
 */
export async function syncSlots(accountId: string) {
    const supabase = await createClient();

    // Obtener la cuenta madre con sus slots actuales
    const { data: account, error: accountError } = await (supabase.from('mother_accounts') as any)
        .select(`
            id, max_slots, platform,
            sale_slots (id, slot_identifier)
        `)
        .eq('id', accountId)
        .single();

    if (accountError || !account) {
        return { error: accountError?.message || 'Cuenta no encontrada' };
    }

    const currentSlots = account.sale_slots?.length || 0;
    const maxSlots = account.max_slots || 5;

    if (currentSlots >= maxSlots) {
        return { success: true, message: 'Slots ya sincronizados' };
    }

    // Crear slots faltantes
    const slotsToCreate = [];
    for (let i = currentSlots + 1; i <= maxSlots; i++) {
        slotsToCreate.push({
            mother_account_id: accountId,
            slot_identifier: `Perfil ${i}`,
            status: 'available',
        });
    }

    const { error: insertError } = await (supabase.from('sale_slots') as any).insert(slotsToCreate);

    if (insertError) {
        return { error: insertError.message };
    }

    revalidatePath('/inventory');
    return { success: true, created: slotsToCreate.length };
}

/**
 * Renumerar todos los slots de una cuenta madre secuencialmente.
 * Strip any existing number prefix and reassign 1. Name, 2. Name, etc.
 */
export async function renumberSlots(accountId: string) {
    const supabase = await createClient();

    const { data: slots, error: fetchError } = await (supabase.from('sale_slots') as any)
        .select('id, slot_identifier')
        .eq('mother_account_id', accountId)
        .order('id', { ascending: true });

    if (fetchError || !slots) {
        return { error: fetchError?.message || 'No se encontraron slots' };
    }

    // Strip existing number prefix (e.g. "3. Perfil 3" → "Perfil 3")
    const stripNumber = (name: string) => name.replace(/^\d+\.\s*/, '');

    for (let i = 0; i < slots.length; i++) {
        const baseName = stripNumber(slots[i].slot_identifier || `Perfil ${i + 1}`);
        const newName = `${i + 1}. ${baseName}`;
        if (newName !== slots[i].slot_identifier) {
            await (supabase.from('sale_slots') as any)
                .update({ slot_identifier: newName })
                .eq('id', slots[i].id);
        }
    }

    revalidatePath('/inventory');
    return { success: true };
}

/**
 * Mark a mother account as quarantined (problematic, not usable for sales).
 */
export async function quarantineAccount(accountId: string) {
    const supabase = await createClient();

    const { error } = await (supabase.from('mother_accounts') as any)
        .update({ status: 'quarantine', quarantined_at: new Date().toISOString() })
        .eq('id', accountId);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/');
    revalidatePath('/inventory');
    return { success: true };
}

/**
 * Reactivate a quarantined account.
 */
export async function reactivateAccount(accountId: string) {
    const supabase = await createClient();

    const { error } = await (supabase.from('mother_accounts') as any)
        .update({ status: 'active', quarantined_at: null })
        .eq('id', accountId);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/');
    revalidatePath('/inventory');
    return { success: true };
}

/**
 * Returns mother accounts where ALL slots are currently available.
 * These are the "Cuentas Completas" that can be sold as a whole.
 */
export async function getAvailableFullAccounts() {
    const supabase = await createClient();

    const { data, error } = await (supabase.from('mother_accounts') as any)
        .select(`
            id, platform, email, max_slots, renewal_date, sale_price_gs,
            sale_slots (id, status)
        `)
        .eq('status', 'active')
        .order('platform');

    if (error) return { data: [], error: error.message };

    // Only return accounts where ALL slots are 'available'
    const fullAccounts = (data || []).filter((account: any) => {
        const slots = account.sale_slots || [];
        return slots.length > 0 && slots.every((s: any) => s.status === 'available');
    });

    return { data: fullAccounts };
}

