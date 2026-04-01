'use server';

import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/utils/phone';
import { revalidatePath } from 'next/cache';

// Create an untyped Supabase client for bulk operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ImportResult {
    success: number;
    duplicates: number;
    errors: string[];
}

interface ImportOptions {
    updateDuplicates: boolean;
}

// Importar Clientes
export async function bulkImportCustomers(
    data: { name?: string; phone?: string; notes?: string }[],
    options: ImportOptions
): Promise<ImportResult> {
    const result: ImportResult = { success: 0, duplicates: 0, errors: [] };

    for (const row of data) {
        try {
            if (!row.phone) {
                result.errors.push(`Fila sin teléfono: ${row.name || 'Sin nombre'}`);
                continue;
            }

            // Normalizar teléfono
            const phone = normalizePhone(String(row.phone));

            // Verificar duplicado
            const { data: existing } = await supabase
                .from('customers')
                .select('id')
                .eq('phone', phone)
                .maybeSingle();

            if (existing) {
                result.duplicates++;
                if (options.updateDuplicates) {
                    const updateData: Record<string, string> = {};
                    if (row.name) updateData.name = row.name;
                    if (row.notes) updateData.notes = row.notes;

                    const { error } = await supabase
                        .from('customers')
                        .update(updateData)
                        .eq('id', existing.id);

                    if (error) {
                        result.errors.push(`Error actualizando ${phone}: ${error.message}`);
                    } else {
                        result.success++;
                    }
                }
                continue;
            }

            // Insertar nuevo
            const { error } = await supabase.from('customers').insert({
                name: row.name || 'Sin nombre',
                phone,
                notes: row.notes || null,
            });

            if (error) {
                result.errors.push(`Error insertando ${phone}: ${error.message}`);
            } else {
                result.success++;
            }
        } catch (error: any) {
            result.errors.push(`Error procesando fila: ${error.message}`);
        }
    }

    revalidatePath('/customers');
    return result;
}

// Importar Cuentas Madre
export async function bulkImportMotherAccounts(
    data: {
        platform?: string;
        email?: string;
        password?: string;
        renewal_date?: string;
        supplier_name?: string;
        purchase_cost_gs?: number;
        max_slots?: number;
    }[],
    options: ImportOptions
): Promise<ImportResult> {
    const result: ImportResult = { success: 0, duplicates: 0, errors: [] };

    for (const row of data) {
        try {
            if (!row.platform || !row.email) {
                result.errors.push(`Fila sin plataforma o email: ${JSON.stringify(row)}`);
                continue;
            }

            // Verificar duplicado por email
            const { data: existing } = await supabase
                .from('mother_accounts')
                .select('id')
                .eq('email', row.email)
                .maybeSingle();

            if (existing) {
                result.duplicates++;
                if (options.updateDuplicates) {
                    const { error } = await supabase
                        .from('mother_accounts')
                        .update({
                            platform: row.platform,
                            password: row.password || undefined,
                            renewal_date: row.renewal_date || undefined,
                            supplier_name: row.supplier_name || undefined,
                            purchase_cost_gs: row.purchase_cost_gs || undefined,
                        })
                        .eq('id', existing.id);

                    if (error) {
                        result.errors.push(`Error actualizando ${row.email}: ${error.message}`);
                    } else {
                        result.success++;
                    }
                }
                continue;
            }

            // Insertar nueva cuenta madre
            const maxSlots = row.max_slots || 5;
            const { data: newAccount, error } = await supabase
                .from('mother_accounts')
                .insert({
                    platform: row.platform,
                    email: row.email,
                    password: row.password || '',
                    renewal_date: row.renewal_date || null,
                    supplier_name: row.supplier_name || null,
                    purchase_cost_gs: row.purchase_cost_gs || 0,
                    max_slots: maxSlots,
                    status: 'active',
                })
                .select()
                .single();

            if (error) {
                result.errors.push(`Error insertando ${row.email}: ${error.message}`);
                continue;
            }

            // Crear slots automáticamente
            const slots = Array.from({ length: maxSlots }, (_, i) => ({
                mother_account_id: newAccount.id,
                slot_identifier: `Perfil ${i + 1}`,
                status: 'available',
            }));

            const { error: slotsError } = await supabase.from('sale_slots').insert(slots);

            if (slotsError) {
                result.errors.push(`Cuenta creada pero error en slots ${row.email}: ${slotsError.message}`);
            }

            result.success++;
        } catch (error: any) {
            result.errors.push(`Error procesando fila: ${error.message}`);
        }
    }

    revalidatePath('/inventory');
    return result;
}
