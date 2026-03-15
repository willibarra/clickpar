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

    // Auto-generate portal credentials
    if (phone) {
        try {
            const password = 'CP-' + Math.random().toString(36).slice(2, 8);
            const email = `${phone.replace('+', '')}@clickpar.shop`;

            // Create Supabase Auth user
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email,
                phone: phone.startsWith('+') ? phone : `+${phone}`,
                password,
                email_confirm: true,
                phone_confirm: true,
                user_metadata: { full_name: fullName, customer_id: data?.id },
            });

            if (authUser?.user) {
                // Create profile with customer role
                await (supabase.from('profiles') as any)
                    .upsert({
                        id: authUser.user.id,
                        full_name: fullName,
                        phone_number: phone,
                        role: 'customer',
                    });

                // Store generated password in customers table for reference
                await (supabase.from('customers') as any)
                    .update({ portal_password: password })
                    .eq('id', data?.id);
            } else if (authError) {
                console.warn('[createCustomer] Auth user creation failed (non-blocking):', authError.message);
            }
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

    // Obtener tipo actual para detectar cambios
    const { data: currentCustomer } = await (supabase.from('customers') as any)
        .select('customer_type')
        .eq('id', id)
        .single();

    const previousType = currentCustomer?.customer_type || 'cliente';

    const { error } = await (supabase.from('customers') as any)
        .update({ full_name: fullName, phone, customer_type: customerType, whatsapp_instance: whatsappInstance })
        .eq('id', id);

    if (error) {
        return { error: error.message };
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
