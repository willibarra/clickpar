'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createKommoLead, addNoteToLead } from '@/lib/kommo';
import { sendSaleCredentials, sendFamilyCredentials, sendFamilyInvite, getWhatsAppSettings } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/utils/phone';
import { logAction } from './audit';

interface QuickSaleData {
    platform: string;
    customerPhone: string;
    customerName?: string;
    customerId?: string;
    specificSlotId?: string;
    price: number;
    platformPrice?: number;
    durationDays?: number;
    deliveryDate?: string;  // fecha de entrega personalizada (YYYY-MM-DD)
    notes?: string;
    // Family account fields
    familyAccessType?: 'credentials' | 'invite';
    clientEmail?: string;
    clientPassword?: string;
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

        // 1b. Leer whatsapp_instance del cliente
        let customerWaInstance: string | null = null;
        {
            const { data: custWa } = await (supabase.from('customers') as any)
                .select('whatsapp_instance')
                .eq('id', customerId)
                .single();
            customerWaInstance = custWa?.whatsapp_instance || null;
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

        // 3. Crear venta + marcar slot como vendido
        let startDate: Date;
        let endDate: Date;
        if (data.deliveryDate) {
            startDate = new Date(data.deliveryDate + 'T12:00:00');
            const durationDays = data.durationDays || 30;
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + durationDays);
        } else {
            startDate = new Date();
            const durationDays = data.durationDays || 30;
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + durationDays);
        }

        const slotId = slotToSell.slot_id || slotToSell.id;

        // Insertar la venta
        const { data: newSaleData, error: saleError } = await (supabase.from('sales') as any)
            .insert({
                customer_id: customerId,
                slot_id: slotId,
                amount_gs: data.price,
                original_price_gs: slotToSell.slot_price_gs || data.price,
                override_price: data.price !== slotToSell.slot_price_gs,
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                is_active: true,
                payment_method: 'cash',
            })
            .select('id')
            .single();

        if (saleError) throw new Error(`Error creando venta: ${saleError.message}`);

        // Marcar slot como vendido
        const { error: slotUpdateError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'sold' })
            .eq('id', slotId);

        if (slotUpdateError) throw new Error(`Error actualizando slot: ${slotUpdateError.message}`);

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
                await new Promise(r => setTimeout(r, 2000));

                const slotId = slotToSell.slot_id || slotToSell.id;
                const expDateStr = endDate.toLocaleDateString('es-PY');

                // == FAMILY ACCOUNT FLOW ==
                if (data.familyAccessType && data.clientEmail) {
                    // Save client email as slot_identifier and password as pin_code
                    await (supabase.from('sale_slots') as any)
                        .update({
                            slot_identifier: data.clientEmail,
                            pin_code: data.clientPassword || null,
                        })
                        .eq('id', slotId);

                    if (data.familyAccessType === 'credentials' && data.clientPassword) {
                        // We created the account — send email + password
                        const familyCredResult = await sendFamilyCredentials({
                            customerPhone: data.customerPhone,
                            customerName: data.customerName || data.customerPhone,
                            platform: data.platform,
                            clientEmail: data.clientEmail,
                            clientPassword: data.clientPassword,
                            expirationDate: expDateStr,
                            customerId,
                            instanceName: customerWaInstance || undefined,
                        });
                        // Auto-assign WA instance if customer didn't have one
                        if (!customerWaInstance && familyCredResult?.instanceUsed) {
                            customerWaInstance = familyCredResult.instanceUsed;
                            await (supabase.from('customers') as any)
                                .update({ whatsapp_instance: familyCredResult.instanceUsed })
                                .eq('id', customerId);
                        }
                    } else if (data.familyAccessType === 'invite') {
                        // Client uses own account — send invitation notice
                        const familyInvResult = await sendFamilyInvite({
                            customerPhone: data.customerPhone,
                            customerName: data.customerName || data.customerPhone,
                            platform: data.platform,
                            clientEmail: data.clientEmail,
                            expirationDate: expDateStr,
                            customerId,
                            instanceName: customerWaInstance || undefined,
                        });
                        // Auto-assign WA instance if customer didn't have one
                        if (!customerWaInstance && familyInvResult?.instanceUsed) {
                            customerWaInstance = familyInvResult.instanceUsed;
                            await (supabase.from('customers') as any)
                                .update({ whatsapp_instance: familyInvResult.instanceUsed })
                                .eq('id', customerId);
                        }
                    }
                    console.log('[WhatsApp] Mensaje familiar enviado a', data.customerPhone);

                } else {
                    // == REGULAR SLOT FLOW ==
                    const { data: slotInfo } = await (supabase.from('sale_slots') as any)
                        .select(`
                            slot_identifier,
                            pin_code,
                            mother_accounts:mother_account_id (
                                email,
                                password,
                                platform,
                                instructions,
                                send_instructions
                            )
                        `)
                        .eq('id', slotId)
                        .single();

                    if (slotInfo?.mother_accounts) {
                        const acct = slotInfo.mother_accounts;
                        const credResult = await sendSaleCredentials({
                            customerPhone: data.customerPhone,
                            customerName: data.customerName || data.customerPhone,
                            platform: acct.platform || data.platform,
                            email: acct.email || '',
                            password: acct.password || '',
                            profile: slotInfo.slot_identifier || 'Perfil asignado',
                            pin: slotInfo.pin_code || undefined,
                            expirationDate: expDateStr,
                            customerId,
                            instanceName: customerWaInstance || undefined,
                        });
                        // Auto-assign WA instance if customer didn't have one
                        if (!customerWaInstance && credResult?.instanceUsed) {
                            customerWaInstance = credResult.instanceUsed;
                            await (supabase.from('customers') as any)
                                .update({ whatsapp_instance: credResult.instanceUsed })
                                .eq('id', customerId);
                        }
                        console.log('[WhatsApp] Credenciales enviadas a', data.customerPhone);

                        // Send instructions as a second message if enabled
                        if (acct.send_instructions && acct.instructions) {
                            await new Promise(r => setTimeout(r, 1500));
                            const { sendText } = await import('@/lib/whatsapp');
                            await sendText(
                                data.customerPhone,
                                `📋 *Instrucciones de acceso:*\n\n${acct.instructions}`,
                                { instanceName: customerWaInstance || undefined, customerId }
                            );
                            console.log('[WhatsApp] Instrucciones enviadas a', data.customerPhone);
                        }
                    }
                }
            }
        } catch (waError) {
            console.error('[WhatsApp] Error (non-blocking):', waError);
        }

        await logAction('create_sale', 'sale', slotToSell.slot_id || slotToSell.id, {
            message: `realizó una venta de ${data.platform} a ${data.customerName || data.customerPhone}`
        });

        // Fetch instructions to return to the UI (for the copy button)
        let saleInstructions: string | null = null;
        try {
            const { data: slotForInst } = await (supabase.from('sale_slots') as any)
                .select('mother_accounts:mother_account_id (instructions, send_instructions)')
                .eq('id', slotToSell.slot_id || slotToSell.id)
                .single();
            const acct = slotForInst?.mother_accounts;
            if (acct?.send_instructions && acct?.instructions) saleInstructions = acct.instructions;
        } catch { /* non-blocking */ }

        revalidatePath('/');
        return { success: true, message: 'Venta realizada exitosamente', instructions: saleInstructions };

    } catch (error: any) {
        console.error('Quick Sale Error:', error);
        return { error: error.message || 'Error desconocido al procesar la venta' };
    }
}

export async function cancelSubscription(saleId: string, slotId: string) {
    const supabase = await createAdminClient();
    try {
        // Desactivar la venta
        const { error: saleError } = await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', saleId);

        if (saleError) throw new Error(`Error cancelando venta: ${saleError.message}`);

        // Liberar el slot
        const { error: slotError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', slotId);

        if (slotError) throw new Error(`Error liberando slot: ${slotError.message}`);

        await logAction('cancel_sale', 'sale', saleId, {
            message: `canceló una suscripción`
        });

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
        // 1. Find new slot (need to resolve before calling atomic RPC)
        let newSlotId: string;
        let newPlatform: string = '';

        // Get old slot info for platform/mother_account context
        const { data: oldSlotInfo } = await (supabase.from('sale_slots') as any)
            .select('mother_account_id, mother_accounts:mother_account_id(platform)')
            .eq('id', data.oldSlotId)
            .single();

        const motherAccountId = oldSlotInfo?.mother_account_id || '';
        const platform = oldSlotInfo?.mother_accounts?.platform || '';

        // Get old sale dates for WhatsApp message
        const { data: oldSale } = await (supabase.from('sales') as any)
            .select('start_date, end_date')
            .eq('id', data.oldSaleId)
            .single();
        const originalEndDate = oldSale?.end_date || null;

        if (data.newSlotId) {
            newSlotId = data.newSlotId;
            const { data: newSlot } = await supabase
                .from('sale_slots')
                .select('id, mother_accounts:mother_account_id(platform)')
                .eq('id', data.newSlotId)
                .single();
            newPlatform = (newSlot as any)?.mother_accounts?.platform || '';
        } else if (data.targetPlatform) {
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

        // 2. Swap: desactivar old sale, liberar old slot, crear nueva venta, marcar nuevo slot
        // Obtener datos de la venta anterior
        const { data: oldSaleData } = await (supabase.from('sales') as any)
            .select('amount_gs, start_date, end_date')
            .eq('id', data.oldSaleId)
            .single();

        // Desactivar venta anterior
        const { error: deactivateError } = await (supabase.from('sales') as any)
            .update({ is_active: false })
            .eq('id', data.oldSaleId);

        if (deactivateError) throw new Error(`Error desactivando venta anterior: ${deactivateError.message}`);

        // Liberar slot anterior
        const { error: freeSlotError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'available' })
            .eq('id', data.oldSlotId);

        if (freeSlotError) throw new Error(`Error liberando slot anterior: ${freeSlotError.message}`);

        // Crear nueva venta preservando fechas
        const { data: newSaleData, error: newSaleError } = await (supabase.from('sales') as any)
            .insert({
                customer_id: data.customerId,
                slot_id: newSlotId,
                amount_gs: oldSaleData?.amount_gs || 0,
                original_price_gs: oldSaleData?.amount_gs || 0,
                override_price: false,
                start_date: oldSaleData?.start_date || new Date().toISOString().split('T')[0],
                end_date: oldSaleData?.end_date || null,
                is_active: true,
                payment_method: 'cash',
            })
            .select('id')
            .single();

        if (newSaleError) throw new Error(`Error creando nueva venta: ${newSaleError.message}`);

        // Marcar nuevo slot como vendido
        const { error: markSoldError } = await (supabase.from('sale_slots') as any)
            .update({ status: 'sold' })
            .eq('id', newSlotId);

        if (markSoldError) throw new Error(`Error marcando nuevo slot: ${markSoldError.message}`);

        await logAction('swap_service', 'sale', data.oldSaleId, {
            message: `realizó un cambio de perfil/cuenta a ${newPlatform || 'nuevo slot'}`
        });

        // 7. Enviar credenciales por WhatsApp (sin bloquear si falla)
        try {
            const waSettings = await getWhatsAppSettings();
            if (waSettings.auto_send_credentials) {
                // Obtener datos del cliente (including preferred WA instance)
                const { data: customer } = await (supabase.from('customers') as any)
                    .select('full_name, phone, whatsapp_instance')
                    .eq('id', data.customerId)
                    .single();

                // Obtener credenciales del nuevo slot
                const { data: newSlotInfo } = await (supabase.from('sale_slots') as any)
                    .select(`
                        slot_identifier,
                        pin_code,
                        mother_accounts:mother_account_id (
                            email, password, platform, instructions, send_instructions
                        )
                    `)
                    .eq('id', newSlotId)
                    .single();

                if (customer && newSlotInfo?.mother_accounts) {
                    const acct = newSlotInfo.mother_accounts;
                    // Usar fecha de vencimiento original del cliente, no recalcular
                    const expDateStr = originalEndDate
                        ? new Date(originalEndDate + 'T12:00:00').toLocaleDateString('es-PY')
                        : new Date(Date.now() + 30 * 86400000).toLocaleDateString('es-PY');

                    await sendSaleCredentials({
                        customerPhone: customer.phone || data.customerId,
                        customerName: customer.full_name || customer.phone,
                        platform: acct.platform || newPlatform,
                        email: acct.email || '',
                        password: acct.password || '',
                        profile: newSlotInfo.slot_identifier || 'Perfil asignado',
                        pin: newSlotInfo.pin_code || undefined,
                        expirationDate: expDateStr,
                        customerId: data.customerId,
                        instanceName: customer.whatsapp_instance || undefined,
                    });

                    if (acct.send_instructions && acct.instructions) {
                        await new Promise(r => setTimeout(r, 1500));
                        const { sendText } = await import('@/lib/whatsapp');
                        await sendText(
                            customer.phone,
                            `📋 *Instrucciones de acceso:*\n\n${acct.instructions}`,
                            { instanceName: customer.whatsapp_instance || undefined, customerId: data.customerId }
                        );
                    }
                }
            }
        } catch (waError) {
            console.error('[WhatsApp/Swap] Error (non-blocking):', waError);
        }

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

        await logAction('create_bundle_sale', 'bundle', data.bundleId, {
            message: `realizó una venta de combo a ${data.customerName || data.customerPhone}`
        });

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
    deliveryDate?: string; // fecha de entrega personalizada (YYYY-MM-DD)
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

        // 2b. Leer whatsapp_instance del cliente
        let customerWaInstance: string | null = null;
        {
            const { data: custWa } = await (supabase.from('customers') as any)
                .select('whatsapp_instance')
                .eq('id', customerId)
                .single();
            customerWaInstance = custWa?.whatsapp_instance || null;
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
                const comboStartDate = data.deliveryDate
                    ? data.deliveryDate
                    : today;
                const comboEndDateObj = new Date(comboStartDate + 'T12:00:00');
                comboEndDateObj.setDate(comboEndDateObj.getDate() + 30);
                const comboEndDate = comboEndDateObj.toISOString().split('T')[0];
                const { error: saleError } = await (supabase
                    .from('sales') as any)
                    .insert({
                        customer_id: customerId,
                        slot_id: slot.id,
                        amount_gs: isLast
                            ? data.totalPrice - (pricePerSlot * (totalItems - 1))
                            : pricePerSlot,
                        original_price_gs: pricePerSlot,
                        start_date: comboStartDate,
                        end_date: comboEndDate,
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
                            const comboCredResult = await sendSaleCredentials({
                                customerPhone: data.customerPhone,
                                customerName: data.customerName || data.customerPhone,
                                platform: acct.platform || assigned.platform,
                                email: acct.email || '',
                                password: acct.password || '',
                                profile: slotDetail.slot_identifier || 'Perfil asignado',
                                expirationDate: expDateStr,
                                customerId,
                                instanceName: customerWaInstance || undefined,
                            });
                            // Auto-assign WA instance if customer didn't have one
                            if (!customerWaInstance && comboCredResult?.instanceUsed) {
                                customerWaInstance = comboCredResult.instanceUsed;
                                await (supabase.from('customers') as any)
                                    .update({ whatsapp_instance: comboCredResult.instanceUsed })
                                    .eq('id', customerId);
                            }
                        }
                    } catch (slotWaErr) {
                        console.error(`[WhatsApp] Error sending combo slot ${assigned.slotId}:`, slotWaErr);
                    }
                }
            }
        } catch (waError) {
            console.error('[WhatsApp] Combo error (non-blocking):', waError);
        }

        await logAction('create_combo_sale', 'combo', comboId, {
            message: `realizó una venta múltiple a ${data.customerName || data.customerPhone}`
        });

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

/**
 * Sell a complete mother account (all available slots) to a single customer.
 * - Marks ALL slots as 'sold'
 * - Creates one sales record per slot (same customer, same start_date)
 * - Sends WhatsApp credentials using customer's preferred instance
 */
export async function createFullAccountSale({
    motherAccountId,
    customerId,
    price,
    durationDays = 30,
}: {
    motherAccountId: string;
    customerId: string;
    price: number;
    durationDays?: number;
}) {
    const supabase = await createAdminClient();

    try {
        // 1. Get the mother account with all available slots
        const { data: account, error: accountError } = await (supabase
            .from('mother_accounts') as any)
            .select('id, platform, email, password, renewal_date, sale_slots (id, slot_identifier, status)')
            .eq('id', motherAccountId)
            .single();

        if (accountError || !account) throw new Error('Cuenta madre no encontrada');

        const availableSlots = (account.sale_slots || []).filter((s: any) => s.status === 'available');

        if (availableSlots.length === 0) throw new Error('No hay slots disponibles en esta cuenta');

        // 2. Get customer info (including preferred WhatsApp instance)
        const { data: customer } = await (supabase.from('customers') as any)
            .select('id, full_name, phone, whatsapp_instance')
            .eq('id', customerId)
            .single();

        if (!customer) throw new Error('Cliente no encontrado');

        // 3. Calculate start date
        const startDate = new Date().toISOString().split('T')[0];

        // 4. Create one sale per slot
        const salesInsert = availableSlots.map((slot: any) => ({
            customer_id: customerId,
            slot_id: slot.id,
            amount_gs: Math.round(price / availableSlots.length),
            start_date: startDate,
            is_active: true,
        }));

        const { error: salesError } = await (supabase.from('sales') as any).insert(salesInsert);
        if (salesError) throw new Error(`Error creando ventas: ${salesError.message}`);

        // 5. Mark all slots as sold
        const slotIds = availableSlots.map((s: any) => s.id);
        await (supabase.from('sale_slots') as any)
            .update({ status: 'sold' })
            .in('id', slotIds);

        // 6. Send WhatsApp credentials using customer's preferred instance
        if (customer.phone) {
            try {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + durationDays);
                const credResult = await sendSaleCredentials({
                    customerPhone: normalizePhone(customer.phone),
                    customerName: customer.full_name || customer.phone,
                    platform: account.platform,
                    email: account.email,
                    password: account.password,
                    profile: `Cuenta Completa (${availableSlots.length} perfiles)`,
                    expirationDate: endDate.toLocaleDateString('es-PY'),
                    customerId,
                    instanceName: customer.whatsapp_instance || undefined,
                });
                // Auto-assign WA instance if customer didn't have one
                if (!customer.whatsapp_instance && credResult?.instanceUsed) {
                    await (supabase.from('customers') as any)
                        .update({ whatsapp_instance: credResult.instanceUsed })
                        .eq('id', customerId);
                }
            } catch (waErr) {
                console.warn('WhatsApp send failed (non-critical):', waErr);
            }
        }

        // 7. Audit log
        await logAction('create_full_account_sale', 'mother_account', motherAccountId, {
            message: `vendió cuenta completa de ${account.platform} a ${customer.full_name || customer.phone} (${availableSlots.length} perfiles)`,
        });

        revalidatePath('/');
        revalidatePath('/sales');
        revalidatePath('/inventory');
        revalidatePath('/renewals');

        return {
            success: true,
            platform: account.platform,
            slotsCount: availableSlots.length,
        };

    } catch (error: any) {
        console.error('Error en createFullAccountSale:', error);
        return { error: error.message || 'Error desconocido' };
    }
}

