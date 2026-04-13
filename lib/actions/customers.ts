'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
import { ensurePortalAccount } from '@/lib/utils/portal-account';
import { logAction } from './audit';

// ============================================
// CUSTOMERS (tabla `customers`, no profiles)
// ============================================

export async function createCustomer(formData: FormData) {
    const supabase = await createAdminClient();

    const fullName = (formData.get('full_name') as string)?.trim();
    const rawPhone = (formData.get('phone_number') as string)?.trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : '';

    // Validar duplicado por teléfono
    if (phone) {
        const { data: existing } = await (supabase.from('customers') as any)
            .select('id')
            .eq('phone', phone)
            .limit(1)
            .single();

        if (existing) {
            return { error: `Ya existe un cliente con el teléfono ${phone}` };
        }
    }

    const customerType = (formData.get('customer_type') as string) || 'cliente';

    const { data, error } = await (supabase.from('customers') as any)
        .insert({
            full_name: fullName,
            phone,
            customer_type: customerType,
        })
        .select('id')
        .single();

    if (error) {
        return { error: error.message };
    }

    // Auto-generate portal credentials using shared helper
    if (phone && data?.id) {
        try {
            await ensurePortalAccount(data.id, phone, fullName);
        } catch (err) {
            console.warn('[createCustomer] Portal credential generation failed (non-blocking):', err);
        }
    }

    await logAction('create_customer', 'customer', data?.id || '', {
        message: `agregó al cliente ${fullName}`
    });

    revalidatePath('/customers');
    return { success: true };
}

export async function updateCustomer(id: string, formData: FormData) {
    const supabase = await createAdminClient();

    const fullName = (formData.get('full_name') as string)?.trim();
    const rawPhone = (formData.get('phone_number') as string)?.trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : '';

    // Validar duplicado: que no exista OTRO cliente con el mismo teléfono
    if (phone) {
        const { data: existing } = await (supabase.from('customers') as any)
            .select('id')
            .eq('phone', phone)
            .neq('id', id)
            .limit(1)
            .single();

        if (existing) {
            return { error: `Ya existe otro cliente con el teléfono ${phone}` };
        }
    }

    const customerType = (formData.get('customer_type') as string) || 'cliente';
    const waInstance = formData.get('whatsapp_instance') as string | null;
    const whatsappInstance = waInstance && waInstance !== 'auto' ? waInstance : null;

    // Creator slug: only applies when creador; clean to safe chars
    const rawSlug = (formData.get('creator_slug') as string)?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || null;
    const creatorSlug = customerType === 'creador' && rawSlug ? rawSlug : null;

    // Creator WhatsApp redirect: only digits, only stored for creador type
    const rawCreatorWa = (formData.get('creator_whatsapp') as string)?.trim().replace(/[^\d]/g, '') || null;
    const creatorWhatsapp = customerType === 'creador' && rawCreatorWa ? rawCreatorWa : null;

    // Validate slug uniqueness
    if (creatorSlug) {
        const { data: existingSlug } = await (supabase.from('customers') as any)
            .select('id')
            .eq('creator_slug', creatorSlug)
            .neq('id', id)
            .limit(1)
            .single();
        if (existingSlug) {
            return { error: `El slug "${creatorSlug}" ya está en uso por otro creador.` };
        }
    }

    // panel_disabled: read from form ('true'/'on' = disabled)
    const panelDisabledRaw = formData.get('panel_disabled');
    const panelDisabled = panelDisabledRaw === 'true' || panelDisabledRaw === 'on';

    // Obtener tipo actual y si ya tiene portal_password para detectar cambios
    const { data: currentCustomer } = await (supabase.from('customers') as any)
        .select('customer_type, portal_password')
        .eq('id', id)
        .single();

    const previousType = currentCustomer?.customer_type || 'cliente';

    const { error } = await (supabase.from('customers') as any)
        .update({
            full_name: fullName,
            phone,
            customer_type: customerType,
            whatsapp_instance: whatsappInstance,
            creator_slug: creatorSlug,
            creator_whatsapp: creatorWhatsapp,
            panel_disabled: panelDisabled,
        })
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    // Fix 2: Auto-generate portal account if phone was just added and no password exists yet
    if (phone && !currentCustomer?.portal_password) {
        try {
            await ensurePortalAccount(id, phone, fullName);
        } catch (err) {
            console.warn('[updateCustomer] Auto portal account generation failed (non-blocking):', err);
        }
    }

    // Si cambia a CREADOR: marcar todas sus ventas activas como canje (precio = 0)
    if (customerType === 'creador' && previousType !== 'creador') {
        await (supabase.from('sales') as any)
            .update({ is_canje: true, amount_gs: 0 })
            .eq('customer_id', id)
            .eq('is_active', true);

        await logAction('update_customer', 'customer', id, {
            message: `convirtió a ${fullName} en CREADOR — beneficios aplicados a sus servicios activos`
        });
    } else if (customerType === 'cliente' && previousType === 'creador') {
        // Revertir flag is_canje si vuelve a ser cliente (sin restaurar precio)
        await (supabase.from('sales') as any)
            .update({ is_canje: false })
            .eq('customer_id', id)
            .eq('is_active', true);

        await logAction('update_customer', 'customer', id, {
            message: `actualizó los datos del cliente ${fullName} (de Creador a Cliente)`
        });
    } else {
        await logAction('update_customer', 'customer', id, {
            message: `actualizó los datos del cliente ${fullName}`
        });
    }

    revalidatePath('/customers');
    revalidatePath('/renewals');
    return { success: true };
}

export async function deleteCustomer(id: string) {
    const supabase = await createAdminClient();

    // 1. Obtener ventas activas del cliente
    const { data: activeSales } = await (supabase.from('sales') as any)
        .select('id, slot_id')
        .eq('customer_id', id)
        .eq('is_active', true);

    // 2. Cancelar ventas activas y liberar slots
    for (const sale of activeSales || []) {
        await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', sale.id);

        if (sale.slot_id) {
            await (supabase.from('sale_slots') as any)
                .update({ status: 'available' })
                .eq('id', sale.slot_id);
        }
    }

    // 3. Eliminar el cliente
    const { error } = await (supabase.from('customers') as any)
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    await logAction('delete_customer', 'customer', id, {
        message: `eliminó un cliente del sistema${activeSales && activeSales.length > 0 ? ` (${activeSales.length} venta(s) activa(s) cancelada(s) automáticamente)` : ''}`
    });

    revalidatePath('/customers');
    revalidatePath('/renewals');
    revalidatePath('/inventory');
    return { success: true, cancelledSales: activeSales?.length || 0 };
}

/**
 * Fusiona clientes duplicados en uno.
 * Reasigna TODAS las ventas de `duplicateIds` al `primaryId` y elimina los duplicados.
 */
export async function mergeCustomers(primaryId: string, duplicateIds: string[]) {
    if (!primaryId || !duplicateIds.length) {
        return { error: 'Datos incompletos para la fusión.' };
    }

    const supabase = await createAdminClient();

    // 1. Obtener info del cliente principal y de los duplicados (para audit)
    const allIds = [primaryId, ...duplicateIds];
    const { data: customers } = await (supabase.from('customers') as any)
        .select('id, full_name, phone')
        .in('id', allIds);

    const primary = (customers || []).find((c: any) => c.id === primaryId);
    const duplicates = (customers || []).filter((c: any) => duplicateIds.includes(c.id));

    if (!primary) {
        return { error: 'No se encontró el cliente principal.' };
    }

    // 2. Reasignar todas las sales de los duplicados al cliente principal
    let totalTransferred = 0;
    for (const dupId of duplicateIds) {
        const { data: dupSales } = await (supabase.from('sales') as any)
            .select('id')
            .eq('customer_id', dupId);

        if (dupSales && dupSales.length > 0) {
            await (supabase.from('sales') as any)
                .update({ customer_id: primaryId })
                .eq('customer_id', dupId);
            totalTransferred += dupSales.length;
        }
    }

    // 3. Eliminar los clientes duplicados (ventas ya fueron reasignadas)
    const { error: deleteError } = await (supabase.from('customers') as any)
        .delete()
        .in('id', duplicateIds);

    if (deleteError) {
        return { error: `Error al eliminar duplicados: ${deleteError.message}` };
    }

    // 4. Audit log
    const dupNames = duplicates.map((d: any) => d.full_name || d.phone || d.id).join(', ');
    await logAction('merge_customers', 'customer', primaryId, {
        message: `fusionó duplicados [${dupNames}] en ${primary.full_name || primary.phone} — ${totalTransferred} servicio(s) transferido(s)`
    });

    revalidatePath('/customers');
    revalidatePath('/renewals');
    revalidatePath('/inventory');

    return { success: true, transferred: totalTransferred };
}
