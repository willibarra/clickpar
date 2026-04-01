'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendText } from '@/lib/whatsapp';
import { logAction } from './audit';

export async function getAllSuppliers() {
    const supabase = await createAdminClient();
    const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');
    return suppliers || [];
}

export async function getCrisisSuppliersByPlatform(platform: string) {
    if (!platform) return [];
    const supabase = await createAdminClient();
    
    // Query mother_accounts directly to support legacy supplier_name-only records
    const { data } = await supabase
        .from('mother_accounts')
        .select('supplier_id, supplier_name')
        .ilike('platform', `%${platform}%`);
        
    if (!data) return [];

    // Fetch the canonical names from the suppliers table to avoid case inconsistency
    const { data: canonicalSuppliers } = await supabase
        .from('suppliers')
        .select('id, name');
    const canonicalMap = new Map((canonicalSuppliers || []).map((s: any) => [s.id, s.name]));
    
    // Deduplicate by LOWERCASE name to merge "Global Store" + "GLOBAL STORE"
    const supplierMap = new Map<string, {id: string, name: string}>();
    data.forEach((row: any) => {
        if (row.supplier_id && row.supplier_name) {
            // Prefer canonical name from suppliers table if available
            const canonicalName = canonicalMap.get(row.supplier_id) || row.supplier_name;
            const key = canonicalName.toLowerCase();
            if (!supplierMap.has(key)) {
                supplierMap.set(key, { id: row.supplier_id, name: canonicalName });
            }
        } else if (row.supplier_name) {
            // Legacy record with no supplier_id — deduplicate by lowercased name
            const key = row.supplier_name.toLowerCase();
            if (!supplierMap.has(key)) {
                supplierMap.set(key, { id: row.supplier_name, name: row.supplier_name });
            }
        }
    });
    
    return Array.from(supplierMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCrisisFilteredAccounts(platform: string, supplierId: string | 'ALL') {
    if (!platform) return [];
    
    const supabase = await createAdminClient();
    let query = supabase
        .from('mother_accounts')
        .select('id, email, supplier_name, status, max_slots')
        .ilike('platform', `%${platform}%`)
        .order('email');
        
    if (supplierId && supplierId !== 'ALL') {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId);
        
        let targetName = null;
        if (isUuid) {
            const { data: supData } = await (supabase.from('suppliers') as any).select('name').eq('id', supplierId).single();
            targetName = supData?.name;
        }

        if (targetName) {
            query = query.or(`supplier_id.eq.${supplierId},supplier_name.ilike.%${targetName}%`);
        } else if (isUuid) {
            query = query.eq('supplier_id', supplierId);
        } else {
            // It's a legacy virtual supplier name used as ID (non-uuid)
            query = query.ilike('supplier_name', `%${supplierId}%`);
        }
    }
    
    // Limit increased but still safe for the backend
    const { data: accounts } = await query.limit(1000);
    return accounts || [];
}

export async function getAffectedSalesByAccounts(accountIds: string[], platform: string = 'Spotify') {
    if (!accountIds || accountIds.length === 0) return [];
    const supabase = await createAdminClient();

    // Helper for chunking to avoid 414 URI Too Long limits on Supabase GETs
    const chunkArray = (arr: any[], size: number) => 
        Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
        );

    // 1. Get accounts (chunked)
    const accounts: any[] = [];
    for (const chunk of chunkArray(accountIds, 50)) {
        const { data } = await supabase
            .from('mother_accounts')
            .select('id, email, supplier_name')
            .in('id', chunk);
        if (data) accounts.push(...data);
    }
    const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]));

    // 2. Get slots (chunked)
    const slots: any[] = [];
    for (const chunk of chunkArray(accountIds, 50)) {
        const { data } = await supabase
            .from('sale_slots')
            .select('id, mother_account_id, slot_identifier')
            .in('mother_account_id', chunk);
        if (data) slots.push(...data);
    }

    if (!slots || slots.length === 0) return [];

    const slotIds = slots.map((s: any) => s.id);
    const slotMap = new Map(slots.map((s: any) => [s.id, s]));

    // 3. Get active sales (chunked)
    const sales: any[] = [];
    for (const chunk of chunkArray(slotIds, 50)) {
        const { data, error } = await supabase
            .from('sales')
            .select('id, customer_id, slot_id, end_date, amount_gs')
            .in('slot_id', chunk)
            .eq('is_active', true)
            .or(`end_date.gte.${new Date().toISOString().split('T')[0]},end_date.is.null`);

        if (error) {
            console.error('Crisis sales query error:', error);
            throw new Error(error.message || 'Error consultando ventas activas');
        }
        if (data) sales.push(...data);
    }

    if (!sales || sales.length === 0) return [];

    // 4. Fetch customer data separately (chunked)
    const customerIds = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean))];
    const customers: any[] = [];
    for (const chunk of chunkArray(customerIds, 50)) {
        const { data } = await supabase
            .from('customers')
            .select('id, full_name, phone, whatsapp_instance')
            .in('id', chunk);
        if (data) customers.push(...data);
    }
    const customerMap = new Map((customers || []).map((c: any) => [c.id, c]));

    // 5. Build and sort result
    const result = (sales || []).map((sale: any) => {
        const slot = slotMap.get(sale.slot_id);
        const account = slot ? accountMap.get(slot.mother_account_id) : null;
        const customer = customerMap.get(sale.customer_id);
        return {
            id: sale.id,
            customerId: sale.customer_id,
            customerName: customer?.full_name,
            customerPhone: customer?.phone,
            whatsappInstance: customer?.whatsapp_instance,
            endDate: sale.end_date,
            slotId: sale.slot_id,
            slotIdentifier: slot?.slot_identifier,
            accountEmail: account?.email,
            supplierName: account?.supplier_name,
            platform
        };
    });

    return result.sort((a: any, b: any) => {
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    });
}

export async function getAffectedSales(supplierIds: string[], platform: string = 'Spotify') {
    return []; // Deprecated, unused but kept for fallback
}

export async function bulkSendCrisisMessage(
    sales: any[],
    messageTemplate: string
) {
    // FIRE AND FORGET: Start processing in the background
    // (This works correctly on persistent Node/PM2 environments like ClickPar)
    processCrisisQueue(sales, messageTemplate).catch(err => {
        console.error("Fallo general procesando cola de crisis:", err);
    });

    await logAction('crisis_bulk_message', 'sale', undefined, {
        message: `envió a la cola de procesamiento masivo en 2do plano a ${sales.length} clientes`,
        supplier_names: [...new Set(sales.map(s => s.supplierName))]
    });

    // Return immediately to the UI
    return { queued: true, total: sales.length };
}

// Background Processor 
async function processCrisisQueue(sales: any[], messageTemplate: string) {
    let successCount = 0;
    
    // Create an anonymous log entry factory for immediate fails
    const logFailure = async (phone: string, reason: string, sale: any) => {
        const supabase = await createAdminClient();
        // @ts-ignore
        await (supabase as any).from('whatsapp_send_log').insert({
            phone: phone || 'Sin número',
            message: 'PREVENIDO',
            instance_used: sale?.whatsappInstance || 'Evolution_API',
            status: reason,
            customer_id: sale?.customerId,
            sale_id: sale?.id,
            template_key: 'crisis_batch'
        });
    };

    for (const sale of sales) {
        if (!sale.customerPhone) {
            await logFailure('N/A', '❌ Cliente no tiene número de teléfono registrado', sale);
            continue;
        }

        const formattedVencimiento = sale.endDate ? new Date(sale.endDate).toLocaleDateString() : 'Sin fecha';
        
        const renderedMessage = messageTemplate
            .replace(/{nombre}/g, sale.customerName || 'Cliente')
            .replace(/{plataforma}/g, sale.platform || 'Spotify')
            .replace(/{email_cliente}/g, sale.slotIdentifier || 'tu cuenta asignada')
            .replace(/{vencimiento}/g, formattedVencimiento);

        // This internally generates its own whatsapp_send_log on success/fail
        const result = await sendText(sale.customerPhone, renderedMessage, {
            customerId: sale.customerId,
            saleId: sale.id,
            instanceName: sale.whatsappInstance || undefined
        });

        if (result.success) {
            successCount++;
        }

        // Delay to avoid ban (every send has 2s delay, every 5 sends extra 2s)
        await new Promise(r => setTimeout(r, 2000));
        if (successCount % 5 === 0) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

export async function getCrisisSendLogs() {
    const supabase = await createAdminClient();
    
    // Limit to the last 150 items so the frontend doesn't overload
    const { data: logs, error } = await supabase
        .from('whatsapp_send_log')
        .select(`
            id,
            phone,
            message,
            status,
            created_at,
            customer_id,
            customers(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error("Error fetching logs:", error);
        return [];
    }

    return logs.map((log: any) => ({
        id: log.id,
        phone: log.phone,
        status: log.status,
        date: log.created_at,
        customerName: log.customers?.full_name || 'Desconocido'
    }));
}

export async function markSalesAsWarrantyClaim(saleIds: string[]) {
    if (!saleIds || saleIds.length === 0) return { success: true };
    const supabase = await createAdminClient();
    
    const chunkArray = (arr: any[], size: number) => 
        Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
        );

    // Update sales notes in chunks to avoid 414 URI Too Long errors
    for (const chunk of chunkArray(saleIds, 50)) {
        const { error } = await (supabase.from('sales') as any)
            .update({ notes: 'AFECTADO POR CAIDA MASIVA - EN RECLAMO' })
            .in('id', chunk);

        if (error) {
            console.error("Error marking sales as warranty:", error);
            throw error;
        }
    }

    revalidatePath('/crisis');
    return { success: true };
}
