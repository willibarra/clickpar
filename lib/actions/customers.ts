'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
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

    const { data, error } = await (supabase.from('customers') as any)
        .insert({
            full_name: fullName,
            phone,
        })
        .select('id')
        .single();

    if (error) {
        return { error: error.message };
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

    const { error } = await (supabase.from('customers') as any)
        .update({ full_name: fullName, phone })
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    await logAction('update_customer', 'customer', id, {
        message: `actualizó los datos del cliente ${fullName}`
    });

    revalidatePath('/customers');
    return { success: true };
}

export async function deleteCustomer(id: string) {
    const supabase = await createAdminClient();

    // Verificar que no tenga ventas activas antes de eliminar
    const { data: activeSales } = await (supabase.from('sales') as any)
        .select('id')
        .eq('customer_id', id)
        .eq('is_active', true)
        .limit(1);

    if (activeSales && activeSales.length > 0) {
        return { error: 'No se puede eliminar: el cliente tiene servicios activos. Cancelá los servicios primero.' };
    }

    const { error } = await (supabase.from('customers') as any)
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    await logAction('delete_customer', 'customer', id, {
        message: `eliminó un cliente del sistema`
    });

    revalidatePath('/customers');
    return { success: true };
}
