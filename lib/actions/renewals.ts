// @ts-nocheck
'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkPasswordRotation } from './notifications';

/**
 * Legacy createRenewal for backward compatibility with finance/renewal-modal.tsx
 */
export async function createRenewal(formData: FormData) {
    const supabase = await createAdminClient();

    const accountIds = formData.getAll('account_ids') as string[];
    const purchaseCostGs = parseFloat(formData.get('purchase_cost_gs') as string);
    const expectedSlotPriceGs = parseFloat(formData.get('expected_slot_price_gs') as string);
    const notes = formData.get('notes') as string | null;

    if (accountIds.length === 0 || isNaN(purchaseCostGs) || isNaN(expectedSlotPriceGs)) {
        return { error: 'Datos incompletos' };
    }

    const results = [];

    for (const accountId of accountIds) {
        const { data: rawAccount } = await supabase
            .from('mother_accounts')
            .select('max_slots, renewal_date')
            .eq('id', accountId)
            .single();

        const account = rawAccount as { max_slots: number; renewal_date: string } | null;
        if (!account) {
            results.push({ accountId, error: 'Cuenta no encontrada' });
            continue;
        }

        const projectedProfitGs = (expectedSlotPriceGs * account.max_slots) - purchaseCostGs;

        const { error } = await (supabase.from('expenses') as any).insert({
            mother_account_id: accountId,
            expense_date: new Date().toISOString().split('T')[0],
            amount_gs: purchaseCostGs,
            expense_type: 'renewal',
            description: `Renovación Automática - ${purchaseCostGs.toLocaleString('es-PY')} Gs`,
            notes: notes ? `${notes} (Precio esperado slot: ${expectedSlotPriceGs}, Ganancia proy: ${projectedProfitGs})` : `Precio esperado slot: ${expectedSlotPriceGs}, Ganancia proy: ${projectedProfitGs}`,
        });

        if (error) {
            results.push({ accountId, error: error.message });
        } else {
            const newRenewalDate = new Date(account.renewal_date);
            newRenewalDate.setDate(newRenewalDate.getDate() + 30);

            await supabase
                .from('mother_accounts')
                .update({
                    renewal_date: newRenewalDate.toISOString().split('T')[0],
                    purchase_cost_gs: purchaseCostGs,
                })
                .eq('id', accountId);

            results.push({ accountId, success: true });
        }
    }

    revalidatePath('/finance');
    revalidatePath('/inventory');
    revalidatePath('/renewals');

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
        return { error: `${errors.length} error(es) al renovar`, details: errors };
    }

    return { success: true, renewed: accountIds.length };
}

/**
 * Get all mother accounts for renewal center, sorted by renewal_date ASC
 */
export async function getAccountsForRenewal() {
    const supabase = await createAdminClient();

    const { data, error } = await (supabase.from('mother_accounts') as any)
        .select(`
            id, platform, email, renewal_date, purchase_cost_gs, max_slots, status,
            sale_slots (id, status, slot_identifier)
        `)
        .eq('status', 'active')
        .order('renewal_date', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data || [] };
}

/**
 * Get client sales/subscriptions for renewal center, sorted by start_date ASC
 */
export async function getClientSubscriptions() {
    const supabase = await createAdminClient();

    // 1. Get all active sales (flat, no joins)
    const { data: salesData, error } = await (supabase.from('sales') as any)
        .select('id, amount_gs, start_date, is_active, slot_id, customer_id')
        .eq('is_active', true)
        .order('start_date', { ascending: true });

    if (error) return { data: [], error: error.message };
    const sales = salesData || [];
    if (sales.length === 0) return { data: [] };

    // 2. Fetch all referenced customers
    const customerIds = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean))];
    let customerMap = new Map<string, any>();
    if (customerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone')
            .in('id', customerIds);
        (customers || []).forEach((c: any) => customerMap.set(c.id, c));
    }

    // 3. Fetch all referenced slots → mother accounts
    const slotIds = [...new Set(sales.map((s: any) => s.slot_id).filter(Boolean))];
    let slotMap = new Map<string, any>();
    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, status, mother_account_id');
        const slotsFiltered = (slots || []).filter((s: any) => slotIds.includes(s.id));

        // Fetch mother accounts for these slots
        const maIds = [...new Set(slotsFiltered.map((s: any) => s.mother_account_id).filter(Boolean))];
        let maMap = new Map<string, any>();
        if (maIds.length > 0) {
            const { data: mas } = await (supabase.from('mother_accounts') as any)
                .select('id, platform, email, renewal_date')
                .in('id', maIds);
            (mas || []).forEach((m: any) => maMap.set(m.id, m));
        }

        slotsFiltered.forEach((s: any) => {
            slotMap.set(s.id, {
                ...s,
                mother_account: maMap.get(s.mother_account_id) || null,
            });
        });
    }

    // 4. Combine into the expected shape
    const enriched = sales.map((sale: any) => ({
        ...sale,
        customer: customerMap.get(sale.customer_id) || null,
        slot: slotMap.get(sale.slot_id) || null,
    }));

    return { data: enriched };
}

/**
 * Bulk renew mother accounts (provider renewals)
 * - Updates renewal_date by adding specified days
 * - Registers expense in expenses table
 */
export async function bulkRenewAccounts(accountIds: string[], totalCostGs: number, daysToExtend: number) {
    const supabase = await createAdminClient();
    const errors: string[] = [];
    const costPerAccount = totalCostGs / accountIds.length;

    for (const accountId of accountIds) {
        // Get current renewal date
        const { data: account } = await supabase
            .from('mother_accounts')
            .select('renewal_date, platform, email')
            .eq('id', accountId)
            .single();

        if (!account) {
            errors.push(`Cuenta ${accountId} no encontrada`);
            continue;
        }

        // Calculate new renewal date
        const currentDate = (account as any).renewal_date ? new Date((account as any).renewal_date + 'T12:00:00') : new Date();
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + daysToExtend);
        const newRenewalDate = newDate.toISOString().split('T')[0];

        // Update the account
        const { error: updateError } = await supabase
            .from('mother_accounts')
            .update({ renewal_date: newRenewalDate })
            .eq('id', accountId);

        if (updateError) {
            errors.push(`Error en ${(account as any).platform}: ${updateError.message}`);
            continue;
        }

        // Register the expense
        await (supabase.from('expenses') as any).insert({
            mother_account_id: accountId,
            expense_date: new Date().toISOString().split('T')[0],
            amount_gs: Math.round(costPerAccount),
            expense_type: 'renewal',
            description: `Renovación ${(account as any).platform} (${(account as any).email}) - +${daysToExtend} días`,
        });
    }

    revalidatePath('/renewals');
    revalidatePath('/finance');
    revalidatePath('/inventory');
    revalidatePath('/');

    if (errors.length > 0) {
        return { error: `${errors.length} error(es)`, details: errors };
    }
    return { success: true, renewed: accountIds.length };
}

/**
 * Bulk renew client subscriptions
 * - Extends the sale's active period
 * - Can optionally register income
 */
export async function bulkRenewSubscriptions(saleIds: string[], amountGs: number, daysToExtend: number) {
    const supabase = await createAdminClient();
    const errors: string[] = [];

    for (const saleId of saleIds) {
        // Get current sale info
        const { data: sale } = await (supabase.from('sales') as any)
            .select('id, start_date, customer_id, amount_gs')
            .eq('id', saleId)
            .single();

        if (!sale) {
            errors.push(`Venta ${saleId} no encontrada`);
            continue;
        }

        // Update the start_date forward (renew the subscription period)
        const newStartDate = new Date();
        const newStartStr = newStartDate.toISOString().split('T')[0];

        const { error: updateError } = await (supabase.from('sales') as any)
            .update({ start_date: newStartStr, amount_gs: amountGs || sale.amount_gs })
            .eq('id', saleId);

        if (updateError) {
            errors.push(`Error renovando venta ${saleId}: ${updateError.message}`);
        }
    }

    revalidatePath('/renewals');
    revalidatePath('/sales');
    revalidatePath('/');

    if (errors.length > 0) {
        return { error: `${errors.length} error(es)`, details: errors };
    }
    return { success: true, renewed: saleIds.length };
}

/**
 * Bulk release unpaid client subscriptions:
 * - Deactivates sales (is_active = false)
 * - Frees the associated slot (status = 'available')
 * - Triggers password rotation check on each affected mother account
 */
export async function bulkReleaseSubscriptions(saleIds: string[]) {
    const supabase = await createAdminClient();
    const errors: string[] = [];
    const motherAccountIds = new Set<string>();

    for (const saleId of saleIds) {
        // Get the sale with its slot_id
        const { data: sale } = await (supabase.from('sales') as any)
            .select('id, slot_id, customer_id')
            .eq('id', saleId)
            .single();

        if (!sale) {
            errors.push(`Venta ${saleId} no encontrada`);
            continue;
        }

        // Deactivate the sale
        const { error: saleError } = await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', saleId);

        if (saleError) {
            errors.push(`Error desactivando venta ${saleId}: ${saleError.message}`);
            continue;
        }

        // Free the slot
        if (sale.slot_id) {
            // Get mother_account_id from the slot
            const { data: slot } = await (supabase.from('sale_slots') as any)
                .select('id, mother_account_id')
                .eq('id', sale.slot_id)
                .single();

            await (supabase.from('sale_slots') as any)
                .update({ status: 'available' })
                .eq('id', sale.slot_id);

            if (slot?.mother_account_id) {
                motherAccountIds.add(slot.mother_account_id);
            }
        }
    }

    // Trigger password rotation checks for all affected mother accounts
    for (const maId of motherAccountIds) {
        await checkPasswordRotation(maId);
    }

    revalidatePath('/renewals');
    revalidatePath('/inventory');
    revalidatePath('/customers');
    revalidatePath('/notifications');
    revalidatePath('/');

    if (errors.length > 0) {
        return { error: `${errors.length} error(es)`, details: errors };
    }
    return { success: true, released: saleIds.length };
}

/**
 * Mark a sale_slot as expired and trigger password rotation check
 */
export async function expireSlot(slotId: string, motherAccountId: string) {
    const supabase = await createAdminClient();

    // Update slot status
    await (supabase.from('sale_slots') as any)
        .update({ status: 'available' })
        .eq('id', slotId);

    // Deactivate associated sale
    await (supabase.from('sales') as any)
        .update({ is_active: false })
        .eq('slot_id', slotId)
        .eq('is_active', true);

    // Trigger password rotation security check
    await checkPasswordRotation(motherAccountId);

    revalidatePath('/renewals');
    revalidatePath('/inventory');
    revalidatePath('/');

    return { success: true };
}
