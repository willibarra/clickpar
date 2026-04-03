'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface Supplier {
    id: string;
    name: string;
    contact_info: string | null;
    payment_method_preferred: string | null;
    created_at: string;
    // computed
    total_accounts?: number;
    total_cost_gs?: number;
    platforms?: string[];
}

export interface SupplierDetail extends Supplier {
    accounts: SupplierAccount[];
}

export interface SupplierAccount {
    id: string;
    platform: string;
    email: string;
    renewal_date: string;
    purchase_cost_gs: number | null;
    purchase_cost_usdt: number | null;
    max_slots: number;
    status: string;
    available_slots: number;
    sold_slots: number;
}

/**
 * Get all suppliers with account stats
 */
export async function getSuppliers(): Promise<Supplier[]> {
    const supabase = await createAdminClient();

    const { data: suppliers, error } = await (supabase.from('suppliers') as any)
        .select('id, name, contact_info, payment_method_preferred, created_at')
        .order('name');

    if (error || !suppliers) return [];

    // For each supplier get account stats
    const { data: accounts } = await (supabase.from('mother_accounts') as any)
        .select('id, supplier_id, platform, purchase_cost_gs, sale_slots(status)')
        .is('deleted_at', null);

    return suppliers.map((s: any) => {
        const supplierAccounts = (accounts || []).filter((a: any) => a.supplier_id === s.id);
        const totalCostGs = supplierAccounts.reduce(
            (sum: number, a: any) => sum + Number(a.purchase_cost_gs || 0),
            0
        );
        const platforms = [...new Set<string>(supplierAccounts.map((a: any) => a.platform as string))];

        return {
            ...s,
            total_accounts: supplierAccounts.length,
            total_cost_gs: totalCostGs,
            platforms,
        };
    });
}

/**
 * Get a single supplier with full account list
 */
export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
    const supabase = await createAdminClient();

    const { data: supplier, error } = await (supabase.from('suppliers') as any)
        .select('id, name, contact_info, payment_method_preferred, created_at')
        .eq('id', id)
        .single();

    if (error || !supplier) return null;

    const { data: accounts } = await (supabase.from('mother_accounts') as any)
        .select(`
            id, platform, email, renewal_date,
            purchase_cost_gs, purchase_cost_usdt,
            max_slots, status,
            sale_slots(id, status)
        `)
        .eq('supplier_id', id)
        .is('deleted_at', null)
        .order('platform')
        .order('renewal_date');

    const mappedAccounts: SupplierAccount[] = (accounts || []).map((a: any) => {
        const slots: any[] = a.sale_slots || [];
        return {
            id: a.id,
            platform: a.platform,
            email: a.email,
            renewal_date: a.renewal_date,
            purchase_cost_gs: a.purchase_cost_gs,
            purchase_cost_usdt: a.purchase_cost_usdt,
            max_slots: a.max_slots,
            status: a.status,
            available_slots: slots.filter((s: any) => s.status === 'available').length,
            sold_slots: slots.filter((s: any) => s.status === 'sold').length,
        };
    });

    const totalCostGs = mappedAccounts.reduce(
        (sum, a) => sum + Number(a.purchase_cost_gs || 0),
        0
    );
    const platforms = [...new Set<string>(mappedAccounts.map(a => a.platform))];

    return {
        ...supplier,
        total_accounts: mappedAccounts.length,
        total_cost_gs: totalCostGs,
        platforms,
        accounts: mappedAccounts,
    };
}

/**
 * Create a new supplier
 */
export async function createSupplier(formData: FormData) {
    const supabase = await createAdminClient();

    const data = {
        name: (formData.get('name') as string)?.trim().toUpperCase(),
        contact_info: (formData.get('contact_info') as string)?.trim() || null,
        payment_method_preferred: (formData.get('payment_method_preferred') as string)?.trim() || null,
    };

    if (!data.name) return { error: 'El nombre es obligatorio' };

    const { data: created, error } = await (supabase.from('suppliers') as any)
        .insert(data)
        .select()
        .single();

    if (error) return { error: error.message };

    revalidatePath('/proveedores');
    return { success: true, supplier: created };
}

/**
 * Update a supplier
 */
export async function updateSupplier(id: string, formData: FormData) {
    const supabase = await createAdminClient();

    const data: Record<string, any> = {};
    const name = (formData.get('name') as string)?.trim().toUpperCase();
    const contactInfo = (formData.get('contact_info') as string)?.trim();
    const paymentMethod = (formData.get('payment_method_preferred') as string)?.trim();

    if (name) data.name = name;
    if (contactInfo !== undefined) data.contact_info = contactInfo || null;
    if (paymentMethod !== undefined) data.payment_method_preferred = paymentMethod || null;

    const { error } = await (supabase.from('suppliers') as any)
        .update(data)
        .eq('id', id);

    if (error) return { error: error.message };

    revalidatePath('/proveedores');
    revalidatePath(`/proveedores/${id}`);
    return { success: true };
}

/**
 * Assign all unassigned accounts to SIN PROVEEDOR
 */
export async function assignOrphanAccountsToSinProveedor() {
    const supabase = await createAdminClient();

    const SIN_PROVEEDOR_ID = '00000000-0000-0000-0000-000000000001';

    // First check if SIN PROVEEDOR exists
    const { data: sinProveedor } = await (supabase.from('suppliers') as any)
        .select('id')
        .eq('id', SIN_PROVEEDOR_ID)
        .single();

    if (!sinProveedor) {
        // Create it
        await (supabase.from('suppliers') as any).insert({
            id: SIN_PROVEEDOR_ID,
            name: 'SIN PROVEEDOR',
            contact_info: 'Cuentas sin proveedor asignado',
        });
    }

    // Assign orphans
    const { error, count } = await (supabase.from('mother_accounts') as any)
        .update({ supplier_id: SIN_PROVEEDOR_ID, supplier_name: 'SIN PROVEEDOR' })
        .is('supplier_id', null)
        .is('deleted_at', null);

    if (error) return { error: error.message };

    revalidatePath('/proveedores');
    revalidatePath('/inventory');
    return { success: true, updated: count };
}

/**
 * Delete a supplier and move its accounts to SIN PROVEEDOR
 */
export async function deleteSupplier(id: string) {
    const supabase = await createAdminClient();

    const SIN_PROVEEDOR_ID = '00000000-0000-0000-0000-000000000001';
    
    if (id === SIN_PROVEEDOR_ID) {
        return { error: 'No se puede eliminar el proveedor por defecto' };
    }

    // 1. Move all mother_accounts to SIN PROVEEDOR
    const { error: moveError } = await (supabase.from('mother_accounts') as any)
        .update({ supplier_id: SIN_PROVEEDOR_ID, supplier_name: 'SIN PROVEEDOR' })
        .eq('supplier_id', id);

    if (moveError) return { error: 'Error al reasignar cuentas: ' + moveError.message };

    // 2. Delete the supplier
    const { error: deleteError } = await (supabase.from('suppliers') as any)
        .delete()
        .eq('id', id);

    if (deleteError) return { error: 'Error al eliminar: ' + deleteError.message };

    revalidatePath('/proveedores');
    revalidatePath('/inventory');
    return { success: true };
}
