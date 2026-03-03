'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createKommoLead, addNoteToLead } from '@/lib/kommo';
import { sendSaleCredentials, getWhatsAppSettings } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/utils/phone';

interface QuickSaleData {
    platform: string;
    customerPhone: string;
    customerName?: string; // Nombre opcional
    customerId?: string; // Nuevo campo opcional
    specificSlotId?: string; // Para asignación manual
    price: number;
    platformPrice?: number;
    durationDays?: number; // Duración en días (default: 30)
    notes?: string;
    whatsappInstance?: string; // Nombre de la instancia de WhatsApp usada para esta venta
}

export async function createQuickSale(data: QuickSaleData) {
    const supabase = await createAdminClient();

    try {
        // 1. Buscar o crear cliente
        let customerId: string = data.customerId || '';

        if (!customerId) {
            const { data: existingCustomerData } = await (supabase
                .from('customers') as any) // Cast required due to missing types
                .select('id')
                .eq('phone', normalizePhone(data.customerPhone))
                .single();

            if (existingCustomerData) {
                customerId = existingCustomerData.id;
            } else {
                const { data: newCustomerData, error: createError } = await (supabase
                    .from('customers') as any)
                    .insert({
                        phone: data.customerPhone,
                        full_name: data.customerName || data.customerPhone, // Usar nombre provisto o el teléfono
                        notes: 'Creado desde Venta Rápida'
                    })
                    .select('id')
                    .single();

                if (createError) throw new Error(`Error creando cliente: ${createError.message}`);
                customerId = newCustomerData.id;
            }
        }

        // 2. Encontrar slot
        let slotToSell: any = null;

        if (data.specificSlotId) {
            // Caso: Asignación Manual
            // Assume sale_slots is typed, if not we might need cast too
            const { data: slotData, error } = await supabase
                .from('sale_slots')
                .select('id, mother_account_id, status')
                .eq('id', data.specificSlotId)
                .single();

            const slot = slotData as any;

            if (error || !slot) throw new Error('Slot especificado no encontrado');
            if (slot.status !== 'available') throw new Error('El slot seleccionado ya no está disponible');

            slotToSell = { slot_id: slot.id, slot_price_gs: data.price };
        } else {
            // Caso: Asignación Automática - buscar slot disponible directamente
            const { data: availableSlots, error: slotError } = await (supabase
                .from('sale_slots') as any)
                .select(`
                    id,
                    slot_identifier,
                    mother_accounts:mother_account_id (
                        id,
                        platform,
                        email,
                        renewal_date
                    )
                `)
                .eq('status', 'available');

            if (slotError) {
                return { error: `Error buscando slots: ${slotError.message}` };
            }

            // Filtrar por plataforma
            const platformSlots = (availableSlots || []).filter(
                (s: any) => s.mother_accounts?.platform === data.platform
            );

            if (platformSlots.length === 0) {
                return { error: `No hay slots disponibles para ${data.platform}` };
            }

            // Seleccionar el primero disponible (simplificación del algoritmo Tetris)
            const firstSlot = platformSlots[0];
            slotToSell = {
                slot_id: firstSlot.id,
                slot_price_gs: data.platformPrice || data.price
            };
        }

        // 3. Crear venta
        const startDate = new Date();
        const durationDays = data.durationDays || 30;
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        const { error: saleError } = await (supabase
            .from('sales') as any)
            .insert({
                customer_id: customerId,
                slot_id: slotToSell.slot_id || slotToSell.id,
                amount_gs: data.price,
                original_price_gs: slotToSell.slot_price_gs || data.price,
                override_price: data.price !== slotToSell.slot_price_gs,
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                is_active: true,
                payment_method: 'cash',
            });

        if (saleError) throw new Error(`Error creando venta: ${saleError.message}`);

        // 4. Actualizar estado del slot
        const { error: updateSlotError } = await (supabase
            .from('sale_slots') as any)
            .update({
                status: 'sold'
            })
            .eq('id', slotToSell.slot_id || slotToSell.id);

        if (updateSlotError) throw new Error(`Error actualizando slot: ${updateSlotError.message}`);

        // 5. Crear lead en Kommo CRM (sin bloquear la venta si falla)
        try {
            const kommoResult = await createKommoLead({
                platform: data.platform,
                customerPhone: data.customerPhone,
                customerName: data.customerName || data.customerPhone,
                price: data.price,
                slotInfo: slotToSell.slot_id || slotToSell.id,
            });
            if (kommoResult.leadId) {
                await addNoteToLead(kommoResult.leadId,
                    `Venta registrada desde ClickPar\nPlataforma: ${data.platform}\nPrecio: Gs. ${data.price.toLocaleString()}\nTeléfono: ${data.customerPhone}`
                );
            }
        } catch (kommoError) {
            console.error('[Kommo] Error (non-blocking):', kommoError);
        }

        // 6. Enviar credenciales por WhatsApp (sin bloquear la venta si falla)
        try {
            const waSettings = await getWhatsAppSettings();
            if (waSettings.auto_send_credentials) {
                // Wait 2 seconds before sending WhatsApp message
                await new Promise(r => setTimeout(r, 2000));

                // Obtener credenciales del slot/cuenta madre
                const { data: slotInfo } = await (supabase.from('sale_slots') as any)
                    .select(`
                        slot_identifier,
                        pin_code,
                        mother_accounts:mother_account_id (
                            email,
                            password,
                            platform
                        )
                    `)
                    .eq('id', slotToSell.slot_id || slotToSell.id)
                    .single();

                if (slotInfo?.mother_accounts) {
                    const acct = slotInfo.mother_accounts;
                    await sendSaleCredentials({
                        customerPhone: data.customerPhone,
                        customerName: data.customerName || data.customerPhone,
                        platform: acct.platform || data.platform,
                        email: acct.email || '',
                        password: acct.password || '',
                        profile: slotInfo.slot_identifier || 'Perfil asignado',
                        expirationDate: endDate.toLocaleDateString('es-PY'),
                        customerId,
                        instanceName: data.whatsappInstance,
                    });
                    console.log('[WhatsApp] Credenciales enviadas a', data.customerPhone);
                }
            }
        } catch (waError) {
            console.error('[WhatsApp] Error (non-blocking):', waError);
        }

        revalidatePath('/');
        return { success: true, message: 'Venta realizada exitosamente' };

    } catch (error: any) {
        console.error('Quick Sale Error:', error);
        return { error: error.message || 'Error desconocido al procesar la venta' };
    }
}

export async function cancelSubscription(saleId: string, slotId: string) {
    const supabase = await createAdminClient();
    try {
        // 1. Marcar venta como inactiva
        const { error: saleError } = await (supabase
            .from('sales') as any)
            .update({ is_active: false })
            .eq('id', saleId);

        if (saleError) throw new Error(`Error cancelando venta: ${saleError.message}`);

        // 2. Liberar slot
        const { error: slotError } = await (supabase
            .from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', slotId);

        if (slotError) throw new Error(`Error liberando slot: ${slotError.message}`);

        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

interface SwapServiceData {
    oldSaleId: string;
    oldSlotId: string;
    customerId: string;
    newSlotId?: string; // If specified, use this exact slot; otherwise auto-assign
    targetPlatform?: string; // For auto-assignment: which platform to find a new slot in
    keepPrice?: boolean; // Whether to keep the same price from old sale
}

export async function swapService(data: SwapServiceData) {
    const supabase = await createAdminClient();

    try {
        // 1. Get current sale info (to preserve price)
        const { data: oldSale } = await (supabase.from('sales') as any)
            .select('amount_gs, customer_id, slot_id')
            .eq('id', data.oldSaleId)
            .single();

        if (!oldSale) throw new Error('Venta original no encontrada');

        const price = oldSale.amount_gs;

        // Get mother account info from old slot
        const { data: oldSlotInfo } = await (supabase.from('sale_slots') as any)
            .select('mother_account_id, mother_accounts:mother_account_id(platform)')
            .eq('id', data.oldSlotId)
            .single();

        const motherAccountId = oldSlotInfo?.mother_account_id || '';
        const platform = oldSlotInfo?.mother_accounts?.platform || '';

        // 2. Deactivate old sale
        const { error: deactivateError } = await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', data.oldSaleId);
        if (deactivateError) throw new Error(`Error desactivando venta: ${deactivateError.message}`);

        // 3. Free old slot
        const { error: freeError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', data.oldSlotId);
        if (freeError) throw new Error(`Error liberando slot: ${freeError.message}`);

        // 4. Find new slot
        let newSlotId: string;
        let newPlatform: string = '';

        if (data.newSlotId) {
            // Specific slot selected
            const { data: newSlot, error: slotError } = await supabase
                .from('sale_slots')
                .select('id, status, mother_accounts:mother_account_id(platform)')
                .eq('id', data.newSlotId)
                .single();

            if (slotError || !newSlot) throw new Error('Nuevo slot no encontrado');
            const slot = newSlot as any;
            if (slot.status !== 'available') throw new Error('El nuevo slot ya no está disponible');

            newSlotId = slot.id;
            newPlatform = slot.mother_accounts?.platform || '';
        } else if (data.targetPlatform) {
            // Auto-assign: find available slot in target platform
            const { data: availableSlots } = await (supabase.from('sale_slots') as any)
                .select('id, mother_accounts:mother_account_id(platform, status)')
                .eq('status', 'available');

            const matching = (availableSlots || []).filter(
                (s: any) => s.mother_accounts?.platform === data.targetPlatform && s.mother_accounts?.status === 'active'
            );

            if (matching.length === 0) {
                throw new Error(`No hay slots disponibles para ${data.targetPlatform}`);
            }

            newSlotId = matching[0].id;
            newPlatform = data.targetPlatform;
        } else {
            throw new Error('Debe especificar un slot o plataforma de destino');
        }

        // 5. Create new sale
        const { error: saleError } = await (supabase.from('sales') as any)
            .insert({
                customer_id: data.customerId,
                slot_id: newSlotId,
                amount_gs: price,
                original_price_gs: price,
                override_price: false,
                start_date: new Date().toISOString().split('T')[0],
                is_active: true,
                payment_method: 'cash',
            });
        if (saleError) throw new Error(`Error creando nueva venta: ${saleError.message}`);

        // 6. Mark new slot as sold
        const { error: updateError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'sold' })
            .eq('id', newSlotId);
        if (updateError) throw new Error(`Error actualizando nuevo slot: ${updateError.message}`);

        revalidatePath('/');
        return {
            success: true,
            message: `Servicio intercambiado a ${newPlatform || 'nuevo slot'} exitosamente`,
            motherAccountId,
            platform,
        };
    } catch (error: any) {
        console.error('[SwapService] Error:', error);
        return { error: error.message || 'Error al intercambiar servicio' };
    }
}

/**
 * Get other active clients in the same mother account (siblings of the swapped slot).
 */
export async function getAccountSiblings(motherAccountId: string, excludeSlotId?: string) {
    const supabase = await createAdminClient();

    try {
        // Get all sold slots for this account
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, pin_code, status')
            .eq('mother_account_id', motherAccountId)
            .eq('status', 'sold');

        if (!slots || slots.length === 0) return { siblings: [] };

        // Filter out the excluded slot
        const siblingSlots = excludeSlotId
            ? slots.filter((s: any) => s.id !== excludeSlotId)
            : slots;

        if (siblingSlots.length === 0) return { siblings: [] };

        // Get active sales for these slots
        const slotIds = siblingSlots.map((s: any) => s.id);
        const { data: sales } = await (supabase.from('sales') as any)
            .select('id, customer_id, slot_id, amount_gs')
            .in('slot_id', slotIds)
            .eq('is_active', true);

        if (!sales || sales.length === 0) return { siblings: [] };

        // Get customer info
        const custIds = [...new Set(sales.map((s: any) => s.customer_id))];
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone')
            .in('id', custIds);

        const custMap = new Map((customers || []).map((c: any) => [c.id, c]));

        const siblings = sales.map((sale: any) => {
            const slot = siblingSlots.find((s: any) => s.id === sale.slot_id);
            const cust = custMap.get(sale.customer_id) as any;
            return {
                sale_id: sale.id,
                slot_id: sale.slot_id,
                slot_identifier: slot?.slot_identifier || '',
                customer_id: sale.customer_id,
                customer_name: cust?.full_name || 'Sin nombre',
                customer_phone: cust?.phone || '',
                amount: sale.amount_gs,
            };
        });

        return { siblings };
    } catch (error: any) {
        console.error('[GetAccountSiblings] Error:', error);
        return { siblings: [], error: error.message };
    }
}

/**
 * Bulk-swap all active clients from a mother account to available slots of the same platform.
 */
export async function bulkSwapAccountClients(motherAccountId: string) {
    const supabase = await createAdminClient();

    try {
        // Get account platform
        const { data: account } = await (supabase.from('mother_accounts') as any)
            .select('platform')
            .eq('id', motherAccountId)
            .single();

        if (!account) throw new Error('Cuenta no encontrada');

        // Get all active sales for this account's slots
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id')
            .eq('mother_account_id', motherAccountId)
            .eq('status', 'sold');

        if (!slots || slots.length === 0) return { success: true, moved: 0 };

        const slotIds = slots.map((s: any) => s.id);
        const { data: sales } = await (supabase.from('sales') as any)
            .select('id, customer_id, slot_id, amount_gs')
            .in('slot_id', slotIds)
            .eq('is_active', true);

        if (!sales || sales.length === 0) return { success: true, moved: 0 };

        // Get available slots from OTHER accounts of same platform
        const { data: availableSlots } = await (supabase.from('sale_slots') as any)
            .select('id, mother_accounts:mother_account_id(platform, status)')
            .eq('status', 'available')
            .neq('mother_account_id', motherAccountId);

        const validSlots = (availableSlots || []).filter(
            (s: any) => s.mother_accounts?.platform === account.platform && s.mother_accounts?.status === 'active'
        );

        if (validSlots.length < sales.length) {
            return { error: `No hay suficientes slots disponibles. Necesarios: ${sales.length}, disponibles: ${validSlots.length}` };
        }

        // Move each client
        let moved = 0;
        for (let i = 0; i < sales.length; i++) {
            const sale = sales[i];
            const targetSlot = validSlots[i];

            // Deactivate old sale
            await (supabase.from('sales') as any)
                .update({ is_active: false })
                .eq('id', sale.id);

            // Free old slot
            await (supabase.from('sale_slots') as any)
                .update({ status: 'available' })
                .eq('id', sale.slot_id);

            // Create new sale
            await (supabase.from('sales') as any)
                .insert({
                    customer_id: sale.customer_id,
                    slot_id: targetSlot.id,
                    amount_gs: sale.amount_gs,
                    original_price_gs: sale.amount_gs,
                    override_price: false,
                    start_date: new Date().toISOString().split('T')[0],
                    is_active: true,
                    payment_method: 'cash',
                });

            // Mark new slot as sold
            await (supabase.from('sale_slots') as any)
                .update({ status: 'sold' })
                .eq('id', targetSlot.id);

            moved++;
        }

        revalidatePath('/');
        return { success: true, moved };
    } catch (error: any) {
        console.error('[BulkSwap] Error:', error);
        return { error: error.message || 'Error al migrar clientes' };
    }
}

interface BundleSaleData {
    bundleId: string;
    customerPhone: string;
    customerName?: string;
    customerId?: string;
    price: number;
    notes?: string;
}

export async function createBundleSale(data: BundleSaleData) {
    const supabase = await createAdminClient();

    try {
        // 1. Obtener información del bundle y sus items
        const { data: bundle, error: bundleError } = await supabase
            .from('bundles')
            .select('*, bundle_items(*)')
            .eq('id', data.bundleId)
            .single();

        if (bundleError || !bundle) {
            return { error: 'Bundle no encontrado' };
        }

        // Cast bundle to any to access properties
        const bundleData = bundle as any;

        // 2. Buscar o crear cliente
        let customerId: string = data.customerId || '';

        if (!customerId) {
            const { data: existingCustomer } = await (supabase
                .from('customers') as any)
                .select('id')
                .eq('phone', normalizePhone(data.customerPhone))
                .single();

            if (existingCustomer) {
                customerId = existingCustomer.id;
            } else {
                const { data: newCustomer, error: createError } = await (supabase
                    .from('customers') as any)
                    .insert({
                        phone: data.customerPhone,
                        full_name: data.customerName || data.customerPhone,
                        notes: 'Creado desde Venta de Bundle'
                    })
                    .select('id')
                    .single();

                if (createError) throw new Error(`Error creando cliente: ${createError.message}`);
                customerId = newCustomer.id;
            }
        }

        // 3. Para cada item del bundle, asignar un slot
        const bundleItems = bundleData.bundle_items || [];
        const assignedSlots: { slotId: string; platform: string }[] = [];

        for (const item of bundleItems) {
            for (let i = 0; i < item.slot_count; i++) {
                // Buscar slot disponible para esta plataforma
                const { data: bestSlot, error: slotError } = await supabase
                    .rpc('get_best_slot_for_sale', {
                        target_platform: item.platform
                    } as any);

                const slotArray = (bestSlot as unknown as any[]) || [];
                const slot = slotArray.length > 0 ? slotArray[0] : bestSlot;

                if (slotError || !slot) {
                    // Rollback: liberar slots ya asignados
                    for (const assigned of assignedSlots) {
                        await (supabase.from('sale_slots') as any)
                            .update({ status: 'available' })
                            .eq('id', assigned.slotId);
                    }
                    return { error: `No hay slots disponibles para ${item.platform}` };
                }

                // Marcar slot como vendido
                const slotId = slot.slot_id || slot.id;
                await (supabase.from('sale_slots') as any)
                    .update({ status: 'sold', customer_id: customerId })
                    .eq('id', slotId);

                assignedSlots.push({ slotId, platform: item.platform });
            }
        }

        // 4. Crear una venta por cada slot asignado (o una venta principal con bundle_id)
        // Usamos una venta principal que representa el bundle
        const pricePerSlot = data.price / assignedSlots.length;

        for (let i = 0; i < assignedSlots.length; i++) {
            const assigned = assignedSlots[i];
            const { error: saleError } = await (supabase.from('sales') as any)
                .insert({
                    customer_id: customerId,
                    slot_id: assigned.slotId,
                    amount_gs: i === 0 ? data.price : 0, // Solo la primera venta tiene el monto total
                    original_price_gs: bundleData.original_price_gs || data.price,
                    bundle_id: data.bundleId,
                    start_date: new Date().toISOString().split('T')[0],
                    is_active: true,
                    payment_method: 'cash'
                });

            if (saleError) throw new Error(`Error creando venta: ${saleError.message}`);
        }

        revalidatePath('/');
        return {
            success: true,
            message: `Bundle "${bundleData.name}" vendido exitosamente (${assignedSlots.length} servicios)`
        };

    } catch (error: any) {
        console.error('Bundle Sale Error:', error);
        return { error: error.message || 'Error desconocido al procesar la venta de bundle' };
    }
}

export interface AvailableSlot {
    id: string;
    slot_identifier: string | null;
    pin_code: string | null;
    status: string;
    mother_account: {
        id: string;
        email: string;
        platform: string;
        renewal_date: string | null;
    };
}

export async function getAvailableSlots(platform: string): Promise<{ data: AvailableSlot[] | null; error: string | null }> {
    const supabase = await createAdminClient();

    try {
        const { data, error } = await supabase
            .from('sale_slots')
            .select(`
                id,
                slot_identifier,
                pin_code,
                status,
                mother_account:mother_accounts!inner(
                    id,
                    email,
                    platform,
                    renewal_date
                )
            `)
            .eq('status', 'available')
            .eq('mother_accounts.platform', platform)
            .eq('mother_accounts.status', 'active');

        if (error) throw error;

        // Transform the data to match our interface
        const transformedSlots = (data || []).map((slot: any) => ({
            ...slot,
            mother_account: Array.isArray(slot.mother_account)
                ? slot.mother_account[0]
                : slot.mother_account
        }));

        return { data: transformedSlots, error: null };
    } catch (error: any) {
        console.error('Error getting available slots:', error);
        return { data: null, error: error.message };
    }
}

// ==========================================
// Combo Sale (multiple platforms in one go)
// ==========================================

export interface ComboSaleItem {
    platform: string;
    quantity: number;
}

export interface ComboSaleData {
    items: ComboSaleItem[];
    customerPhone: string;
    customerName?: string;
    customerId?: string;
    totalPrice: number;
}

export async function processComboSale(data: ComboSaleData) {
    const supabase = await createAdminClient();

    try {
        // 0. Validate input
        if (!data.items || data.items.length === 0) {
            return { error: 'El combo debe tener al menos una plataforma' };
        }
        if (!data.customerPhone || data.customerPhone.length < 10) {
            return { error: 'Se requiere un número de teléfono válido' };
        }
        if (!data.totalPrice || data.totalPrice <= 0) {
            return { error: 'El precio del combo debe ser mayor a 0' };
        }

        // 1. Check stock for ALL platforms before proceeding
        const { data: allAvailableSlots, error: slotError } = await (supabase
            .from('sale_slots') as any)
            .select(`
                id,
                slot_identifier,
                mother_accounts:mother_account_id (
                    id,
                    platform,
                    email,
                    renewal_date
                )
            `)
            .eq('status', 'available');

        if (slotError) {
            return { error: `Error verificando stock: ${slotError.message}` };
        }

        // Group available slots by platform
        const slotsByPlatform: Record<string, any[]> = {};
        for (const slot of (allAvailableSlots || [])) {
            const platform = slot.mother_accounts?.platform;
            if (platform) {
                if (!slotsByPlatform[platform]) slotsByPlatform[platform] = [];
                slotsByPlatform[platform].push(slot);
            }
        }

        // Verify stock for each item in the combo
        for (const item of data.items) {
            const available = slotsByPlatform[item.platform]?.length || 0;
            if (available < item.quantity) {
                return {
                    error: `Falta stock de ${item.platform} para completar el combo (disponible: ${available}, necesario: ${item.quantity})`
                };
            }
        }

        // 2. Find or create customer
        let customerId = data.customerId || '';

        if (!customerId) {
            const { data: existingCustomer } = await (supabase
                .from('customers') as any)
                .select('id')
                .eq('phone', normalizePhone(data.customerPhone))
                .single();

            if (existingCustomer) {
                customerId = existingCustomer.id;
            } else {
                const { data: newCustomer, error: createError } = await (supabase
                    .from('customers') as any)
                    .insert({
                        phone: data.customerPhone,
                        full_name: data.customerName || data.customerPhone,
                        notes: 'Creado desde Venta Rápida (Combo)'
                    })
                    .select('id')
                    .single();

                if (createError) return { error: `Error creando cliente: ${createError.message}` };
                customerId = newCustomer.id;
            }
        }

        // 3. Generate a shared combo_id for grouping
        const comboId = crypto.randomUUID();
        const today = new Date().toISOString().split('T')[0];
        const comboLabel = data.items.map(it => `${it.quantity}x ${it.platform}`).join(' + ');

        // 4. Assign slots and create sales records
        const assignedSlots: { slotId: string; platform: string; email: string }[] = [];
        const totalItems = data.items.reduce((sum, it) => sum + it.quantity, 0);
        const pricePerSlot = Math.round(data.totalPrice / totalItems);

        for (const item of data.items) {
            const platformSlots = slotsByPlatform[item.platform];

            for (let i = 0; i < item.quantity; i++) {
                const slot = platformSlots[i];

                // Mark slot as sold
                const { error: updateError } = await (supabase
                    .from('sale_slots') as any)
                    .update({ status: 'sold' })
                    .eq('id', slot.id)
                    .eq('status', 'available');

                if (updateError) {
                    for (const assigned of assignedSlots) {
                        await (supabase.from('sale_slots') as any)
                            .update({ status: 'available' })
                            .eq('id', assigned.slotId);
                    }
                    return { error: `Error asignando slot de ${item.platform}: ${updateError.message}` };
                }

                // Create sale record
                const isLast = assignedSlots.length === totalItems - 1;
                const { error: saleError } = await (supabase
                    .from('sales') as any)
                    .insert({
                        customer_id: customerId,
                        slot_id: slot.id,
                        amount_gs: isLast
                            ? data.totalPrice - (pricePerSlot * (totalItems - 1))
                            : pricePerSlot,
                        original_price_gs: pricePerSlot,
                        start_date: today,
                        is_active: true,
                        payment_method: 'cash'
                    });

                if (saleError) {
                    for (const assigned of assignedSlots) {
                        await (supabase.from('sale_slots') as any)
                            .update({ status: 'available' })
                            .eq('id', assigned.slotId);
                    }
                    await (supabase.from('sale_slots') as any)
                        .update({ status: 'available' })
                        .eq('id', slot.id);
                    return { error: `Error registrando venta: ${saleError.message}` };
                }

                assignedSlots.push({
                    slotId: slot.id,
                    platform: item.platform,
                    email: slot.mother_accounts?.email || ''
                });
            }
        }

        // 5. Kommo CRM lead (non-blocking)
        try {
            await createKommoLead({
                platform: `Combo: ${comboLabel}`,
                customerPhone: data.customerPhone,
                customerName: data.customerName || data.customerPhone,
                price: data.totalPrice,
                slotInfo: comboId.slice(0, 8),
            });
        } catch { /* CRM errors don't block the sale */ }

        // 6. Enviar credenciales por WhatsApp para cada slot del combo (sin bloquear)
        try {
            const waSettings = await getWhatsAppSettings();
            if (waSettings.auto_send_credentials) {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 30);
                const expDateStr = endDate.toLocaleDateString('es-PY');

                for (const assigned of assignedSlots) {
                    try {
                        // Fetch slot credentials
                        const { data: slotDetail } = await (supabase.from('sale_slots') as any)
                            .select(`
                                slot_identifier, pin_code,
                                mother_accounts:mother_account_id (email, password, platform)
                            `)
                            .eq('id', assigned.slotId)
                            .single();

                        if (slotDetail?.mother_accounts) {
                            const acct = slotDetail.mother_accounts;
                            await sendSaleCredentials({
                                customerPhone: data.customerPhone,
                                customerName: data.customerName || data.customerPhone,
                                platform: acct.platform || assigned.platform,
                                email: acct.email || '',
                                password: acct.password || '',
                                profile: slotDetail.slot_identifier || 'Perfil asignado',
                                expirationDate: expDateStr,
                                customerId,
                            });
                        }
                    } catch (slotWaErr) {
                        console.error(`[WhatsApp] Error sending combo slot ${assigned.slotId}:`, slotWaErr);
                    }
                }
            }
        } catch (waError) {
            console.error('[WhatsApp] Combo error (non-blocking):', waError);
        }

        revalidatePath('/');
        revalidatePath('/sales');
        revalidatePath('/inventory');

        return {
            success: true,
            comboId: comboId.slice(0, 8),
            assignedSlots,
            totalItems,
        };

    } catch (error: any) {
        console.error('Error procesando combo:', error);
        return { error: error.message || 'Error desconocido procesando combo' };
    }
}
