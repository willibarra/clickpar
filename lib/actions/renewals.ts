// @ts-nocheck
'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkPasswordRotation } from './notifications';
import { sendPreExpiryReminder, sendExpiryNotification, sendExpiredNotification, getPlatformDisplayName } from '@/lib/whatsapp';

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
                    last_provider_payment_at: new Date().toISOString(),
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
            id, platform, email, renewal_date, purchase_cost_gs, purchase_cost_usdt, max_slots, status, is_autopay, supplier_name,
            sale_slots (id, status, slot_identifier)
        `)
        .in('status', ['active', 'expired'])
        .gte('renewal_date', windowStart.toISOString().split('T')[0])
        .lte('renewal_date', windowEnd.toISOString().split('T')[0])
        .eq('is_autopay', false)  // excluir las de autopay (includes possible_autopay)
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

    // Ventana: 90 días atrás (vencidas sin cancelar) hasta 15 días adelante
    // Se amplió de 7 → 90 días para que el admin cancele manualmente sin que desaparezcan
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 90);
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
    const notifMap = new Map<string, { sentAt: string; template: string; triggeredBy: string }>();
    for (const ids of chunk(saleIds, 200)) {
        const { data: logs } = await (supabase.from('whatsapp_send_log') as any)
            .select('sale_id, created_at, template_key, status, triggered_by')
            .in('sale_id', ids)
            .in('template_key', ['pre_vencimiento', 'vencimiento_hoy', 'vencimiento_vencido'])
            .eq('status', 'sent')
            .order('created_at', { ascending: false });
        // Guardar el log más reciente por sale_id
        (logs || []).forEach((log: any) => {
            if (!notifMap.has(log.sale_id)) {
                notifMap.set(log.sale_id, { 
                    sentAt: log.created_at, 
                    template: log.template_key,
                    triggeredBy: log.triggered_by || 'auto',
                });
            }
        });
    }

    // 5. Combinar — excluir ventas cuyo cliente ya no existe en la BD (ventas huérfanas)
    const enriched = sales
        .map((sale: any) => ({
            ...sale,
            customer: custMap.get(sale.customer_id) || null,
            slot: slotMap.get(sale.slot_id) || null,
            lastNotified: notifMap.get(sale.id) || null,
        }))
        .filter((sale: any) => sale.customer !== null); // Ignorar ventas sin cliente

    return { data: enriched };
}


/**
 * Bulk renew mother accounts (provider renewals)
 * - Updates renewal_date by adding specified days
 * - Updates purchase_cost_gs and purchase_cost_usdt per account
 * - Registers expense in expenses table
 */
export async function bulkRenewAccounts(
    accountIds: string[],
    totalCostGs: number,
    daysToExtend: number,
    totalCostUsdt?: number,
    baseStartDate?: string
) {
    const supabase = await createAdminClient();
    const errors: string[] = [];

    const count = accountIds.length;
    const costPerAccountGs   = Math.round(totalCostGs / count);
    const costPerAccountUsdt = totalCostUsdt != null ? totalCostUsdt / count : null;

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

        // Calculate new renewal date explicitly from user's chosen start date or fallback
        let baseDateStr = baseStartDate;
        if (!baseDateStr) {
            baseDateStr = (account as any).renewal_date || new Date().toISOString().split('T')[0];
        }
        
        const newDate = new Date(baseDateStr + 'T12:00:00');
        newDate.setDate(newDate.getDate() + daysToExtend);
        const newRenewalDate = newDate.toISOString().split('T')[0];
        const newBillingDay = newDate.getDate();

        // Build update payload — update renewal_date, target_billing_day, and cost
        const updatePayload: Record<string, any> = {
            renewal_date: newRenewalDate,
            target_billing_day: newBillingDay,
            purchase_cost_gs: costPerAccountGs,
            last_provider_payment_at: new Date().toISOString(),
        };
        if (costPerAccountUsdt != null) {
            updatePayload.purchase_cost_usdt = costPerAccountUsdt;
        }

        // Update the account
        const { error: updateError } = await supabase
            .from('mother_accounts')
            .update(updatePayload)
            .eq('id', accountId);

        if (updateError) {
            errors.push(`Error en ${(account as any).platform}: ${updateError.message} `);
            continue;
        }

        // Register the expense
        const usdtNote = costPerAccountUsdt != null ? ` (${costPerAccountUsdt.toFixed(2)} USDT)` : '';
        await (supabase.from('expenses') as any).insert({
            mother_account_id: accountId,
            expense_date: new Date().toISOString().split('T')[0],
            amount_gs: costPerAccountGs,
            expense_type: 'renewal',
            description: `Renovación ${(account as any).platform} (${(account as any).email}) - +${daysToExtend} días${usdtNote}`,
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
            .select('id, start_date, end_date, customer_id, amount_gs')
            .eq('id', saleId)
            .single();

        if (!sale) {
            errors.push(`Venta ${saleId} no encontrada`);
            continue;
        }

        // Calcular nuevo end_date desde el end_date existente + días
        // Si venció el 1/abril y renovás por 30 días → nuevo end = 1/mayo (no hoy + 30)
        const baseDate = sale.end_date ? new Date(sale.end_date + 'T12:00:00') : new Date();
        const newEndDate = new Date(baseDate);
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
        // 1. Get the sale to find the slot_id
        const { data: sale, error: saleError } = await (supabase.from('sales') as any)
            .select('id, slot_id')
            .eq('id', saleId)
            .single();

        if (saleError || !sale) {
            errors.push(`Venta ${saleId} no encontrada`);
            continue;
        }

        // 2. Deactivate the sale
        const { error: cancelError } = await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', saleId);

        if (cancelError) {
            errors.push(`Error desactivando venta ${saleId}: ${cancelError.message}`);
            continue;
        }

        // 3. Free the slot
        if (sale.slot_id) {
            // Get the mother_account_id before updating
            const { data: slot } = await (supabase.from('sale_slots') as any)
                .select('mother_account_id')
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

    // Find the active sale for this slot
    const { data: activeSale } = await (supabase.from('sales') as any)
        .select('id')
        .eq('slot_id', slotId)
        .eq('is_active', true)
        .single();

    if (activeSale) {
        // Deactivate the sale
        await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', activeSale.id);
    }

    // Free the slot
    await (supabase.from('sale_slots') as any)
        .update({ status: 'available' })
        .eq('id', slotId);

    // Trigger password rotation security check
    await checkPasswordRotation(motherAccountId);

    revalidatePath('/renewals');
    revalidatePath('/inventory');
    revalidatePath('/');

    return { success: true };
}

/**
 * Send a WhatsApp renewal notice for a specific sale
 * Uses pre_vencimiento or vencimiento_hoy template based on days remaining
 */
export async function sendRenewalNotice(saleId: string) {
    const supabase = await createAdminClient();

    // 1. Get sale data
    const { data: sale, error } = await (supabase.from('sales') as any)
        .select('id, amount_gs, end_date, customer_id, slot_id, is_canje')
        .eq('id', saleId)
        .single();

    if (error || !sale) return { success: false, error: 'Venta no encontrada' };

    // 2. Get customer (including preferred WhatsApp instance)
    const { data: customer } = await (supabase.from('customers') as any)
        .select('id, full_name, phone, whatsapp_instance')
        .eq('id', sale.customer_id)
        .single();

    if (!customer?.phone) return { success: false, error: 'Cliente sin número de teléfono' };

    // 3. Get slot + mother account platform
    const { data: slot } = await (supabase.from('sale_slots') as any)
        .select('id, slot_identifier, mother_account:mother_accounts(id, platform, email)')
        .eq('id', sale.slot_id)
        .single();

    const platform = slot?.mother_account?.platform || 'Plataforma';

    // 4. Determine days until expiry
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = sale.end_date ? new Date(sale.end_date + 'T00:00:00') : null;
    const daysUntil = expiryDate
        ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : -1;

    const formattedExpiry = expiryDate
        ? expiryDate.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })
        : '';

    const priceStr = sale.amount_gs
        ? `Gs. ${Number(sale.amount_gs).toLocaleString('es-PY')}`
        : '';

    // 5. Send appropriate template
    let result;
    if (daysUntil < 0) {
        // Already expired → vencimiento_vencido "venció el {fecha}"
        result = await sendExpiredNotification({
            customerPhone: customer.phone,
            customerName: customer.full_name || customer.phone,
            platform,
            expirationDate: formattedExpiry,
            price: priceStr,
            customerId: customer.id,
            saleId: sale.id,
            instanceName: customer.whatsapp_instance || undefined,
            triggeredBy: 'manual',
        });
    } else if (daysUntil === 0) {
        // Expires today → vencimiento_hoy "vence hoy"
        result = await sendExpiryNotification({
            customerPhone: customer.phone,
            customerName: customer.full_name || customer.phone,
            platform,
            price: priceStr,
            customerId: customer.id,
            saleId: sale.id,
            instanceName: customer.whatsapp_instance || undefined,
            triggeredBy: 'manual',
        });
    } else {
        // Future → pre_vencimiento
        result = await sendPreExpiryReminder({
            customerPhone: customer.phone,
            customerName: customer.full_name || customer.phone,
            platform,
            expirationDate: formattedExpiry,
            daysRemaining: daysUntil,
            price: priceStr,
            customerId: customer.id,
            saleId: sale.id,
            instanceName: customer.whatsapp_instance || undefined,
            triggeredBy: 'manual',
        });
    }

    revalidatePath('/renewals');

    if (result.success) {
        // Auto-assign WhatsApp instance to the CUSTOMER if they didn't have one
        if (!customer.whatsapp_instance && result.instanceUsed) {
            await (supabase.from('customers') as any)
                .update({ whatsapp_instance: result.instanceUsed })
                .eq('id', customer.id);
        }
        return { success: true };
    }
    return { success: false, error: result.error || 'Error al enviar' };
}

/**
 * Mark accounts as Possible Autopay:
 * - status = 'possible_autopay', is_autopay = true
 * - They will be excluded from the renewal list automatically
 */
export async function markAccountsAsPossibleAutopay(accountIds: string[]) {
    const supabase = await createAdminClient();

    const { error } = await supabase
        .from('mother_accounts')
        .update({ status: 'possible_autopay', is_autopay: true })
        .in('id', accountIds);

    if (error) return { success: false, error: error.message };

    revalidatePath('/renewals');
    revalidatePath('/inventory');
    revalidatePath('/');

    return { success: true, updated: accountIds.length };
}

/**
 * Mark accounts as No Renovar:
 * - status = 'no_renovar'
 * - Returns active clients inside those accounts so the UI can offer to move them
 */
export async function markAccountsAsNoRenovar(accountIds: string[]) {
    const supabase = await createAdminClient();

    // Find active slots in these accounts that have active sales
    const { data: slots } = await (supabase.from('sale_slots') as any)
        .select(`
            id, slot_identifier, mother_account_id,
            mother_account:mother_accounts(id, platform, email),
            sales(id, is_active, end_date, amount_gs,
                customer:customers(id, full_name, phone)
            )
        `)
        .in('mother_account_id', accountIds)
        .eq('status', 'sold');

    const activeClients: any[] = [];

    for (const slot of slots || []) {
        const activeSale = (slot.sales || []).find((s: any) => s.is_active);
        if (activeSale) {
            activeClients.push({
                slotId: slot.id,
                slotIdentifier: slot.slot_identifier,
                motherAccountId: slot.mother_account_id,
                platform: slot.mother_account?.platform,
                accountEmail: slot.mother_account?.email,
                saleId: activeSale.id,
                endDate: activeSale.end_date,
                amountGs: activeSale.amount_gs,
                customer: activeSale.customer,
            });
        }
    }

    // If there are active clients, find available destination slots in same platform
    const availableDestinations: any[] = [];
    if (activeClients.length > 0) {
        // Get unique platforms from accounts to be marked
        const { data: accountsData } = await supabase
            .from('mother_accounts')
            .select('id, platform')
            .in('id', accountIds);

        const platforms = [...new Set((accountsData || []).map((a: any) => a.platform))];

        // Find available slots in OTHER accounts with same platform
        for (const platform of platforms) {
            const { data: availSlots } = await (supabase.from('sale_slots') as any)
                .select(`
                    id, slot_identifier, mother_account_id,
                    mother_account:mother_accounts(id, platform, email, status)
                `)
                .eq('status', 'available')
                .not('mother_account_id', 'in', `(${accountIds.join(',')})`)
                .eq('mother_account.platform', platform);

            // Filter: only slots whose mother account is active
            const validSlots = (availSlots || []).filter(
                (s: any) => s.mother_account?.status === 'active'
            );
            availableDestinations.push(...validSlots.map((s: any) => ({
                slotId: s.id,
                slotIdentifier: s.slot_identifier,
                motherAccountId: s.mother_account_id,
                platform: s.mother_account?.platform,
                accountEmail: s.mother_account?.email,
            })));
        }
    }

    return {
        success: true,
        activeClients,
        availableDestinations,
        canAutoMove: availableDestinations.length >= activeClients.length,
    };
}

/**
 * Confirm No Renovar:
 * - Optionally moves active sales to new slots
 * - Then marks the accounts as no_renovar
 */
export async function confirmNoRenovar(
    accountIds: string[],
    moves: Array<{ saleId: string; oldSlotId: string; newSlotId: string }>
) {
    const supabase = await createAdminClient();
    const errors: string[] = [];

    // 1. Execute moves if any
    for (const move of moves) {
        // Update the sale to point to the new slot
        const { error: saleErr } = await (supabase.from('sales') as any)
            .update({ slot_id: move.newSlotId })
            .eq('id', move.saleId);

        if (saleErr) {
            errors.push(`Error moviendo venta ${move.saleId}: ${saleErr.message}`);
            continue;
        }

        // Free old slot
        await (supabase.from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', move.oldSlotId);

        // Mark new slot as sold
        await (supabase.from('sale_slots') as any)
            .update({ status: 'sold' })
            .eq('id', move.newSlotId);
    }

    // 2. Mark accounts as no_renovar
    const { error: updateErr } = await supabase
        .from('mother_accounts')
        .update({ status: 'no_renovar' })
        .in('id', accountIds);

    if (updateErr) errors.push(updateErr.message);

    revalidatePath('/renewals');
    revalidatePath('/inventory');
    revalidatePath('/');

    if (errors.length > 0) return { success: false, error: errors.join('; ') };
    return { success: true };
}

/**
 * Queue bulk renewal notices to run asynchronously via background CRON
 * Eliminates browser-side slow loops.
 */
export async function queueBulkRenewalNotices(clients: Array<{
    sale_id: string;
    customer_id?: string;
    phone: string;
    customer_name: string;
    platform: string;
    days: number;
    amount?: number;
    end_date?: string;
}>) {
    const supabase = await createAdminClient();
    const errors: string[] = [];
    let queued = 0;

    // ── STEP 1: Load WhatsApp settings to get instance names ──
    const { data: waSettings } = await (supabase.from('whatsapp_settings') as any)
        .select('instance_1_name, instance_2_name')
        .limit(1)
        .single();
    const inst1 = waSettings?.instance_1_name || 'clickpar-1';
    const inst2 = waSettings?.instance_2_name || 'clickpar-2';

    // ── STEP 2: Look up current whatsapp_instance for each client ──
    const customerIds = clients.map(c => c.customer_id).filter(Boolean) as string[];
    const instanceMap = new Map<string, string | null>();

    if (customerIds.length > 0) {
        for (let i = 0; i < customerIds.length; i += 200) {
            const chunk = customerIds.slice(i, i + 200);
            const { data: rows } = await (supabase.from('customers') as any)
                .select('id, whatsapp_instance')
                .in('id', chunk);
            (rows || []).forEach((r: any) => instanceMap.set(r.id, r.whatsapp_instance || null));
        }
    }

    // ── STEP 3: Count assigned instances and balance unassigned ──
    let count1 = 0;
    let count2 = 0;
    const unassigned: string[] = [];

    for (const client of clients) {
        if (!client.customer_id) continue;
        const inst = instanceMap.get(client.customer_id);
        if (inst === inst1) count1++;
        else if (inst === inst2) count2++;
        else unassigned.push(client.customer_id);
    }

    // Assign unassigned clients to balance: give to whichever has fewer
    for (const custId of unassigned) {
        const assignTo = count1 <= count2 ? inst1 : inst2;
        instanceMap.set(custId, assignTo);
        if (assignTo === inst1) count1++;
        else count2++;

        // Save instance permanently to the customer record
        await (supabase.from('customers') as any)
            .update({ whatsapp_instance: assignTo })
            .eq('id', custId);
    }

    console.log(`[BulkQueue] Instance balance: ${inst1}=${count1}, ${inst2}=${count2} (${unassigned.length} newly assigned)`);

    // ── STEP 4: Insert into message_queue with instance pre-assigned ──
    for (const client of clients) {
        if (!client.phone) continue;

        let messageType = 'pre_expiry';
        if (client.days < 0) messageType = 'expired_yesterday';
        else if (client.days === 0) messageType = 'expiry_today';

        let templateKey = 'pre_vencimiento';
        if (messageType === 'expired_yesterday') templateKey = 'vencimiento_vencido';
        else if (messageType === 'expiry_today') templateKey = 'vencimiento_hoy';

        const idempotencyDate = new Date().toISOString().split('T')[0];
        const idempotencyKey = `manual:${client.sale_id}:${messageType}:${idempotencyDate}`;

        const instanceName = client.customer_id
            ? (instanceMap.get(client.customer_id) || null)
            : null;

        const { error } = await supabase.from('message_queue').upsert({
            customer_id: client.customer_id || null,
            sale_id: client.sale_id,
            message_type: messageType,
            channel: 'whatsapp',
            phone: client.phone,
            customer_name: client.customer_name,
            platform: await getPlatformDisplayName(client.platform),
            template_key: templateKey,
            status: 'pending',
            instance_name: instanceName,
            scheduled_at: new Date().toISOString(),
            retry_count: 0,
            max_retries: 3,
            idempotency_key: idempotencyKey,
        } as any, { onConflict: 'idempotency_key', ignoreDuplicates: true });

        if (error) {
            errors.push(`Error al encolar ${client.customer_name}: ${error.message}`);
        } else {
            queued++;
        }
    }

    if (queued > 0) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        fetch(`${baseUrl}/api/cron/trigger-pipeline?secret=clickpar-cron-2024`, { method: 'GET' })
            .catch(err => console.error('[BulkQueue] Fallo disparador fantasma:', err));
    }

    if (errors.length > 0 && queued === 0) {
        return { success: false, error: `${errors.length} error(es) al encolar`, details: errors };
    }

    return { success: true, queued, instanceBalance: { [inst1]: count1, [inst2]: count2 }, errors: errors.length > 0 ? errors : undefined };
}


