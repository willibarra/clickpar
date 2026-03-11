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
 * Get mother accounts needing renewal:
 * - status = 'active' con renewal_date en los próximos 15 días
 * - status = 'expired' con renewal_date en los últimos 30 días
 * Sorted by renewal_date ASC
 */
export async function getAccountsForRenewal() {
    const supabase = await createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Ventana: 30 días atrás hasta 15 días adelante
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 30);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 15);

    const { data, error } = await (supabase.from('mother_accounts') as any)
        .select(`
            id, platform, email, renewal_date, purchase_cost_gs, purchase_cost_usdt, max_slots, status, is_autopay,
            sale_slots (id, status, slot_identifier)
        `)
        .in('status', ['active', 'expired'])
        .gte('renewal_date', windowStart.toISOString().split('T')[0])
        .lte('renewal_date', windowEnd.toISOString().split('T')[0])
        .eq('is_autopay', false)  // excluir las de autopay
        .order('renewal_date', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data || [] };
}

/**
 * Get client subscriptions needing renewal:
 * - Ventas activas con end_date en los próximos 15 días
 * - Ventas activas cuyo end_date ya venció (últimos 7 días)
 * Sorted by end_date ASC
 */
export async function getClientSubscriptions() {
    const supabase = await createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 7);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 15);

    const startStr = windowStart.toISOString().split('T')[0];
    const endStr = windowEnd.toISOString().split('T')[0];

    // 1. Obtener ventas activas en la ventana de fechas
    const { data: salesData, error } = await (supabase.from('sales') as any)
        .select('id, amount_gs, start_date, end_date, is_active, slot_id, customer_id')
        .eq('is_active', true)
        .gte('end_date', startStr)
        .lte('end_date', endStr)
        .order('end_date', { ascending: true });

    if (error) return { data: [], error: error.message };
    const sales = salesData || [];
    if (sales.length === 0) return { data: [] };

    // Helper para dividir en lotes
    function chunk<T>(arr: T[], size: number): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    // 2. Obtener customers por id (en lotes de 200)
    const custIds = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, any>();
    for (const ids of chunk(custIds, 200)) {
        const { data: rows } = await (supabase.from('customers') as any)
            .select('id, full_name, phone').in('id', ids);
        (rows || []).forEach((r: any) => custMap.set(r.id, r));
    }

    // 3. Obtener slots por id (en lotes de 200) — sale_slots SÍ tiene FK hacia mother_accounts
    const slotIds = [...new Set(sales.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotMap = new Map<string, any>();
    for (const ids of chunk(slotIds, 200)) {
        const { data: rows } = await (supabase.from('sale_slots') as any)
            .select(`
                id, slot_identifier, status,
                mother_account:mother_accounts(id, platform, email, renewal_date)
            `)
            .in('id', ids);
        (rows || []).forEach((r: any) => slotMap.set(r.id, r));
    }

    // 4. Obtener último aviso enviado por venta (whatsapp_send_log)
    const saleIds = sales.map((s: any) => s.id) as string[];
    const notifMap = new Map<string, { sentAt: string; template: string }>();
    for (const ids of chunk(saleIds, 200)) {
        const { data: logs } = await (supabase.from('whatsapp_send_log') as any)
            .select('sale_id, created_at, template_key, status')
            .in('sale_id', ids)
            .in('template_key', ['pre_vencimiento', 'vencimiento_hoy'])
            .eq('status', 'sent')
            .order('created_at', { ascending: false });
        // Guardar el log más reciente por sale_id
        (logs || []).forEach((log: any) => {
            if (!notifMap.has(log.sale_id)) {
                notifMap.set(log.sale_id, { sentAt: log.created_at, template: log.template_key });
            }
        });
    }

    // 5. Combinar
    const enriched = sales.map((sale: any) => ({
        ...sale,
        customer: custMap.get(sale.customer_id) || null,
        slot: slotMap.get(sale.slot_id) || null,
        lastNotified: notifMap.get(sale.id) || null,
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
            errors.push(`Error en ${(account as any).platform}: ${updateError.message} `);
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

        // Calcular nuevo end_date desde hoy + días
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + daysToExtend);
        const newEndStr = newEndDate.toISOString().split('T')[0];

        const { error: updateError } = await (supabase.from('sales') as any)
            .update({ end_date: newEndStr, amount_gs: amountGs || sale.amount_gs, is_active: true })
            .eq('id', saleId);

        if (updateError) {
            errors.push(`Error renovando venta ${saleId}: ${updateError.message} `);
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
            errors.push(`Error desactivando venta ${saleId}: ${saleError.message} `);
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
