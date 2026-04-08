"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
// Kommo CRM desactivado temporalmente
import {
  sendSaleCredentials,
  sendCredentialUpdate,
  sendFamilyCredentials,
  sendFamilyInvite,
  getWhatsAppSettings,
} from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/utils/phone";
import { ensurePortalAccount } from "@/lib/utils/portal-account";
import { logAction } from "./audit";

interface QuickSaleData {
  platform: string;
  customerPhone: string;
  customerName?: string;
  customerId?: string;
  specificSlotId?: string;
  price: number;
  platformPrice?: number;
  durationDays?: number;
  deliveryDate?: string; // fecha de entrega personalizada (YYYY-MM-DD)
  notes?: string;
  isCanje?: boolean; // si true: precio 0, sin fecha de vencimiento
  // Family account fields
  familyAccessType?: "credentials" | "invite";
  clientEmail?: string;
  clientPassword?: string;
}

export async function createQuickSale(data: QuickSaleData) {
  const supabase = await createAdminClient();

  try {
    // 1. Buscar o crear cliente
    let customerId: string = data.customerId || "";

    if (!customerId) {
      const { data: existingCustomerData } = await (
        supabase.from("customers") as any
      ) // Cast required due to missing types
        .select("id")
        .eq("phone", normalizePhone(data.customerPhone))
        .single();

      if (existingCustomerData) {
        customerId = existingCustomerData.id;
      } else {
        const { data: newCustomerData, error: createError } = await (
          supabase.from("customers") as any
        )
          .insert({
            phone: normalizePhone(data.customerPhone),
            full_name: data.customerName || data.customerPhone, // Usar nombre provisto o el teléfono
            notes: "Creado desde Venta Rápida",
          })
          .select("id")
          .single();

        if (createError)
          throw new Error(`Error creando cliente: ${createError.message}`);
        customerId = newCustomerData.id;
      }
    }

    // Auto-create portal account if customer doesn't have one
    let portalCredentials: { password: string | null; isNew: boolean } = {
      password: null,
      isNew: false,
    };
    try {
      portalCredentials = await ensurePortalAccount(
        customerId,
        normalizePhone(data.customerPhone),
        data.customerName || data.customerPhone,
      );
    } catch (e) {
      console.warn(
        "[QuickSale] Portal account creation failed (non-blocking):",
        e,
      );
    }

    // 1b. Leer whatsapp_instance del cliente
    let customerWaInstance: string | null = null;
    {
      const { data: custWa } = await (supabase.from("customers") as any)
        .select("whatsapp_instance")
        .eq("id", customerId)
        .single();
      customerWaInstance = custWa?.whatsapp_instance || null;
    }

    // 2. Encontrar slot
    let slotToSell: any = null;

    if (data.specificSlotId) {
      // Caso: Asignación Manual
      // Assume sale_slots is typed, if not we might need cast too
      const { data: slotData, error } = await supabase
        .from("sale_slots")
        .select("id, mother_account_id, status")
        .eq("id", data.specificSlotId)
        .single();

      const slot = slotData as any;

      if (error || !slot) throw new Error("Slot especificado no encontrado");
      if (slot.status !== "available")
        throw new Error("El slot seleccionado ya no está disponible");

      slotToSell = { slot_id: slot.id, slot_price_gs: data.price };
    } else {
      // Caso: Asignación Automática - buscar slot de la cuenta madre más nueva
      const { data: availableSlots, error: slotError } = await (
        supabase.from("sale_slots") as any
      )
        .select(
          `
                    id,
                    slot_identifier,
                    mother_accounts:mother_account_id (
                        id,
                        platform,
                        email,
                        renewal_date,
                        created_at
                    )
                `,
        )
        .eq("status", "available");

      if (slotError) {
        return { error: `Error buscando slots: ${slotError.message}` };
      }

      // Filtrar por plataforma
      const platformSlots = (availableSlots || []).filter(
        (s: any) => s.mother_accounts?.platform === data.platform,
      );

      if (platformSlots.length === 0) {
        return { error: `No hay slots disponibles para ${data.platform}` };
      }

      // Priorizar: cuenta madre más nueva primero, desempate por renewal_date más lejana
      platformSlots.sort((a: any, b: any) => {
        const createdA = a.mother_accounts?.created_at || "";
        const createdB = b.mother_accounts?.created_at || "";
        if (createdB !== createdA) return createdB.localeCompare(createdA);
        const renewA = a.mother_accounts?.renewal_date || "";
        const renewB = b.mother_accounts?.renewal_date || "";
        return renewB.localeCompare(renewA);
      });
      const firstSlot = platformSlots[0];
      slotToSell = {
        slot_id: firstSlot.id,
        slot_price_gs: data.platformPrice || data.price,
      };
    }

    // 3a. Calcular fechas: si es canje, end_date = null
    let startDate: Date;
    let endDateStr: string | null;
    if (data.isCanje) {
      startDate = new Date();
      endDateStr = null; // sin vencimiento
    } else if (data.deliveryDate) {
      startDate = new Date(data.deliveryDate + "T12:00:00");
      const durationDays = data.durationDays || 30;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);
      endDateStr = endDate.toISOString().split("T")[0];
    } else {
      startDate = new Date();
      const durationDays = data.durationDays || 30;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);
      endDateStr = endDate.toISOString().split("T")[0];
    }

    const slotId = slotToSell.slot_id || slotToSell.id;
    const startDateStr = startDate.toISOString().split("T")[0];
    const originalPrice = slotToSell.slot_price_gs || data.price;
    const finalPrice = data.isCanje ? 0 : data.price;

    // 3. Crear venta + marcar slot ATÓMICAMENTE (usa FOR UPDATE para evitar race conditions)
    let newSaleId: string;

    const { data: atomicResult, error: atomicError } = await (
      supabase as any
    ).rpc("create_sale_atomic", {
      p_customer_id: customerId,
      p_slot_id: slotId,
      p_amount_gs: finalPrice,
      p_start_date: startDateStr,
      p_end_date: endDateStr,
      p_payment_method: "cash",
      p_original_price_gs: originalPrice,
      p_override_price: finalPrice !== originalPrice,
    });

    if (atomicError) {
      if (atomicError.code === "PGRST202") {
        // Función atómica no disponible aún — usar método legacy como fallback
        const { data: newSaleData, error: saleError } = await (
          supabase.from("sales") as any
        )
          .insert({
            customer_id: customerId,
            slot_id: slotId,
            amount_gs: finalPrice,
            original_price_gs: originalPrice,
            override_price: finalPrice !== originalPrice,
            start_date: startDateStr,
            end_date: endDateStr,
            is_active: true,
            payment_method: "cash",
            is_canje: data.isCanje || false,
          })
          .select("id")
          .single();
        if (saleError)
          throw new Error(`Error creando venta: ${saleError.message}`);
        const { error: slotUpdateError } = await (
          supabase.from("sale_slots") as any
        )
          .update({ status: "sold" })
          .eq("id", slotId);
        if (slotUpdateError)
          throw new Error(
            `Error actualizando slot: ${slotUpdateError.message}`,
          );
        newSaleId = newSaleData.id;
        console.warn(
          "[QuickSale] Usando método legacy (create_sale_atomic no disponible)",
        );
      } else if (atomicError.code === "P0001") {
        // Error de la función (slot no disponible, etc.) — propagar al usuario
        throw new Error(atomicError.message);
      } else {
        throw new Error(`Error en venta atómica: ${atomicError.message}`);
      }
    } else {
      newSaleId = atomicResult as string;
      // El RPC atómico no soporta is_canje — actualizarlo si es canje
      if (data.isCanje) {
        await (supabase.from("sales") as any)
          .update({ is_canje: true })
          .eq("id", newSaleId);
      }
    }

    // Kommo CRM desactivado temporalmente

    // 6. Enviar credenciales por WhatsApp (sin bloquear la venta si falla)
    (async () => {
      const waSettings = await getWhatsAppSettings();
      if (waSettings.auto_send_credentials) {
        await new Promise((r) => setTimeout(r, 2000));

        const slotId = slotToSell.slot_id || slotToSell.id;
        const expDateStr = endDateStr
          ? new Date(endDateStr + "T12:00:00").toLocaleDateString("es-PY")
          : "Sin vencimiento";

        // == FAMILY ACCOUNT FLOW ==
        if (data.familyAccessType && data.clientEmail) {
          // Save client email as slot_identifier and password as pin_code
          await (supabase.from("sale_slots") as any)
            .update({
              slot_identifier: data.clientEmail,
              pin_code: data.clientPassword || null,
            })
            .eq("id", slotId);

          if (data.familyAccessType === "credentials" && data.clientPassword) {
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
              await (supabase.from("customers") as any)
                .update({ whatsapp_instance: familyCredResult.instanceUsed })
                .eq("id", customerId);
            }
          } else if (data.familyAccessType === "invite") {
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
              await (supabase.from("customers") as any)
                .update({ whatsapp_instance: familyInvResult.instanceUsed })
                .eq("id", customerId);
            }
          }
          console.log(
            "[WhatsApp] Mensaje familiar enviado a",
            data.customerPhone,
          );
        } else {
          // == REGULAR SLOT FLOW ==
          const { data: slotInfo } = await (supabase.from("sale_slots") as any)
            .select(
              `
                            slot_identifier,
                            pin_code,
                            mother_accounts:mother_account_id (
                                email,
                                password,
                                platform,
                                instructions,
                                send_instructions
                            )
                        `,
            )
            .eq("id", slotId)
            .single();

          if (slotInfo?.mother_accounts) {
            const acct = slotInfo.mother_accounts;
            const credResult = await sendSaleCredentials({
              customerPhone: data.customerPhone,
              customerName: data.customerName || data.customerPhone,
              platform: acct.platform || data.platform,
              email: acct.email || "",
              password: acct.password || "",
              profile: slotInfo.slot_identifier || "Perfil asignado",
              pin: slotInfo.pin_code || undefined,
              expirationDate: expDateStr,
              customerId,
              instanceName: customerWaInstance || undefined,
            });
            // Auto-assign WA instance if customer didn't have one
            if (!customerWaInstance && credResult?.instanceUsed) {
              customerWaInstance = credResult.instanceUsed;
              await (supabase.from("customers") as any)
                .update({ whatsapp_instance: credResult.instanceUsed })
                .eq("id", customerId);
            }
            console.log(
              "[WhatsApp] Credenciales enviadas a",
              data.customerPhone,
            );

            // Send instructions as a second message if enabled
            if (acct.send_instructions && acct.instructions) {
              await new Promise((r) => setTimeout(r, 1500));
              const { sendText } = await import("@/lib/whatsapp");
              await sendText(
                data.customerPhone,
                `📋 *Instrucciones de acceso:*\n\n${acct.instructions}`,
                { instanceName: customerWaInstance || undefined, customerId },
              );
              console.log(
                "[WhatsApp] Instrucciones enviadas a",
                data.customerPhone,
              );
            }
          }
        }

        // Send portal credentials if newly created
        // SUSPENDED: Temporalmente desactivado el envío del mensaje del panel
        // if (portalCredentials.isNew && portalCredentials.password) {
        //     await new Promise(r => setTimeout(r, 1500));
        //     const { sendText } = await import('@/lib/whatsapp');
        //     await sendText(
        //         data.customerPhone,
        //         `🔐 *Tu Panel ClickPar*\n\nYa podés consultar tus servicios, credenciales y ayuda desde tu panel:\n\n🌐 *clickpar.shop/cliente*\n📱 *Usuario:* ${data.customerPhone}\n🔑 *Contraseña:* ${portalCredentials.password}\n\n_Guardá estos datos, los vas a necesitar para acceder._`,
        //         { instanceName: customerWaInstance || undefined, customerId }
        //     );
        //     console.log('[WhatsApp] Credenciales de portal enviadas a', data.customerPhone);
        // }
      }
    })().catch((waError) => {
      console.error("[WhatsApp] Error (non-blocking):", waError);
    });

    await logAction(
      "create_sale",
      "sale",
      slotToSell.slot_id || slotToSell.id,
      {
        message: `realizó una venta de ${data.platform} a ${data.customerName || data.customerPhone}`,
      },
    );

    // Fetch credentials + instructions to return to the UI (for the copy button)
    let saleInstructions: string | null = null;
    let saleCredentials: {
      email?: string;
      password?: string;
      profile?: string;
      pin?: string;
      expirationDate?: string;
      clientEmail?: string;
      clientPassword?: string;
      familyAccessType?: string;
    } | null = null;

    try {
      const slotKey = slotToSell.slot_id || slotToSell.id;
      const { data: slotForCopy } = await (supabase.from("sale_slots") as any)
        .select(
          `
                    slot_identifier,
                    pin_code,
                    mother_accounts:mother_account_id (
                        email,
                        password,
                        instructions,
                        send_instructions
                    )
                `,
        )
        .eq("id", slotKey)
        .single();

      const acct = slotForCopy?.mother_accounts;
      if (acct?.send_instructions && acct?.instructions)
        saleInstructions = acct.instructions;

      const expDateStr = endDateStr
        ? new Date(endDateStr + "T12:00:00").toLocaleDateString("es-PY")
        : "Sin vencimiento";

      if (data.familyAccessType && data.clientEmail) {
        // Family flow: return client email/password
        saleCredentials = {
          familyAccessType: data.familyAccessType,
          clientEmail: data.clientEmail,
          clientPassword: data.clientPassword,
          expirationDate: expDateStr,
        };
      } else if (acct) {
        // Regular slot flow
        saleCredentials = {
          email: acct.email || "",
          password: acct.password || "",
          profile: slotForCopy?.slot_identifier || "",
          pin: slotForCopy?.pin_code || "",
          expirationDate: expDateStr,
        };
      }
    } catch {
      /* non-blocking */
    }

    revalidatePath("/");
    return {
      success: true,
      message: "Venta realizada exitosamente",
      instructions: saleInstructions,
      credentials: saleCredentials,
    };
  } catch (error: any) {
    console.error("Quick Sale Error:", error);
    return { error: error.message || "Error desconocido al procesar la venta" };
  }
}

export async function cancelSubscription(saleId: string, slotId: string, cancelCombo?: boolean) {
  const supabase = await createAdminClient();
  try {
    if (cancelCombo) {
      // Check if this sale belongs to a combo
      const { data: saleCheck } = await (supabase.from("sales") as any)
        .select("combo_id")
        .eq("id", saleId)
        .single();

      if (saleCheck?.combo_id) {
        // Get all active sales in this combo
        const { data: comboSales } = await (supabase.from("sales") as any)
          .select("id, slot_id")
          .eq("combo_id", saleCheck.combo_id)
          .eq("is_active", true);

        for (const cs of (comboSales || [])) {
          await (supabase.from("sales") as any)
            .update({ is_active: false })
            .eq("id", cs.id);
          await (supabase.from("sale_slots") as any)
            .update({ status: "available" })
            .eq("id", cs.slot_id);
        }

        await logAction("cancel_combo", "combo", saleCheck.combo_id, {
          message: `canceló un combo completo (${(comboSales || []).length} servicios)`,
        });

        revalidatePath("/");
        return { success: true, cancelledCount: (comboSales || []).length };
      }
    }

    // Individual cancellation
    const { error: saleError } = await (supabase.from("sales") as any)
      .update({ is_active: false })
      .eq("id", saleId);

    if (saleError)
      throw new Error(`Error cancelando venta: ${saleError.message}`);

    const { error: slotError } = await (supabase.from("sale_slots") as any)
      .update({ status: "available" })
      .eq("id", slotId);

    if (slotError)
      throw new Error(`Error liberando slot: ${slotError.message}`);

    await logAction("cancel_sale", "sale", saleId, {
      message: `canceló una suscripción`,
    });

    revalidatePath("/");
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
    let newPlatform: string = "";

    // Get old slot info for platform/mother_account context + client credentials (family)
    const { data: oldSlotInfo } = await (supabase.from("sale_slots") as any)
      .select(
        "mother_account_id, slot_identifier, pin_code, mother_accounts:mother_account_id(platform)",
      )
      .eq("id", data.oldSlotId)
      .single();

    const motherAccountId = oldSlotInfo?.mother_account_id || "";
    const platform = oldSlotInfo?.mother_accounts?.platform || "";

    // Check if this is a family-type account (Pantalla = correo cliente, PIN = contraseña cliente)
    let isFamilyAccount = false;
    if (platform) {
      const { data: platData } = await (supabase.from("platforms") as any)
        .select("business_type")
        .eq("name", platform)
        .single();
      isFamilyAccount = platData?.business_type === "family_account";
    }
    const oldSlotIdentifier = oldSlotInfo?.slot_identifier || "";
    const oldPinCode = oldSlotInfo?.pin_code || "";

    // Get old sale dates for WhatsApp message
    const { data: oldSale } = await (supabase.from("sales") as any)
      .select("start_date, end_date")
      .eq("id", data.oldSaleId)
      .single();
    const originalEndDate = oldSale?.end_date || null;

    if (data.newSlotId) {
      newSlotId = data.newSlotId;
      const { data: newSlot } = await supabase
        .from("sale_slots")
        .select("id, mother_accounts:mother_account_id(platform)")
        .eq("id", data.newSlotId)
        .single();
      newPlatform = (newSlot as any)?.mother_accounts?.platform || "";
    } else if (data.targetPlatform) {
      const { data: availableSlots } = await (
        supabase.from("sale_slots") as any
      )
        .select("id, mother_accounts:mother_account_id(platform, status)")
        .eq("status", "available");

      const matching = (availableSlots || []).filter(
        (s: any) =>
          s.mother_accounts?.platform === data.targetPlatform &&
          s.mother_accounts?.status === "active",
      );

      if (matching.length === 0) {
        throw new Error(`No hay slots disponibles para ${data.targetPlatform}`);
      }

      newSlotId = matching[0].id;
      newPlatform = data.targetPlatform;
    } else {
      throw new Error("Debe especificar un slot o plataforma de destino");
    }

    // 2. Swap: desactivar old sale, liberar old slot, crear nueva venta, marcar nuevo slot
    // Obtener datos de la venta anterior
    const { data: oldSaleData } = await (supabase.from("sales") as any)
      .select("amount_gs, start_date, end_date, combo_id")
      .eq("id", data.oldSaleId)
      .single();

    // Desactivar venta anterior
    const { error: deactivateError } = await (supabase.from("sales") as any)
      .update({ is_active: false })
      .eq("id", data.oldSaleId);

    if (deactivateError)
      throw new Error(
        `Error desactivando venta anterior: ${deactivateError.message}`,
      );

    // Liberar slot anterior (en familia: limpiar credenciales del cliente)
    const freeSlotUpdate: any = { status: "available" };
    if (isFamilyAccount) {
      freeSlotUpdate.slot_identifier = null;
      freeSlotUpdate.pin_code = null;
    }
    const { error: freeSlotError } = await (supabase.from("sale_slots") as any)
      .update(freeSlotUpdate)
      .eq("id", data.oldSlotId);

    if (freeSlotError)
      throw new Error(
        `Error liberando slot anterior: ${freeSlotError.message}`,
      );

    // Crear nueva venta preservando fechas
    // Fallback para end_date: old sale → renewal_date de cuenta madre destino → 30 días desde hoy
    let resolvedEndDate = oldSaleData?.end_date || null;
    if (!resolvedEndDate) {
      const { data: newMotherSlot } = await (supabase.from("sale_slots") as any)
        .select("mother_accounts:mother_account_id(renewal_date)")
        .eq("id", newSlotId)
        .single();
      const motherRenewal = (newMotherSlot as any)?.mother_accounts?.renewal_date;
      if (motherRenewal) {
        resolvedEndDate = motherRenewal;
      } else {
        // Último fallback: 30 días desde hoy
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 30);
        resolvedEndDate = fallback.toISOString().split("T")[0];
      }
      console.log("[SwapService] end_date fallback:", resolvedEndDate);
    }

    const { data: newSaleData, error: newSaleError } = await (
      supabase.from("sales") as any
    )
      .insert({
        customer_id: data.customerId,
        slot_id: newSlotId,
        amount_gs: oldSaleData?.amount_gs || 0,
        original_price_gs: oldSaleData?.amount_gs || 0,
        override_price: false,
        start_date:
          oldSaleData?.start_date || new Date().toISOString().split("T")[0],
        end_date: resolvedEndDate,
        is_active: true,
        payment_method: "cash",
        ...(oldSaleData?.combo_id ? { combo_id: oldSaleData.combo_id } : {}),
      })
      .select("id")
      .single();

    if (newSaleError)
      throw new Error(`Error creando nueva venta: ${newSaleError.message}`);

    // Marcar nuevo slot como vendido
    const markSoldUpdate: any = { status: "sold" };
    if (isFamilyAccount && oldSlotIdentifier) {
      markSoldUpdate.slot_identifier = oldSlotIdentifier;
      markSoldUpdate.pin_code = oldPinCode || null;
    }
    
    const { error: markSoldError } = await (supabase.from("sale_slots") as any)
      .update(markSoldUpdate)
      .eq("id", newSlotId);

    if (markSoldError)
      throw new Error(`Error marcando nuevo slot: ${markSoldError.message}`);

    await logAction("swap_service", "sale", data.oldSaleId, {
      message: `realizó un cambio de perfil/cuenta a ${newPlatform || "nuevo slot"}`,
    });

    // 7. Enviar credenciales por WhatsApp (sin bloquear si falla)
    (async () => {
      const waSettings = await getWhatsAppSettings();
      if (waSettings.auto_send_credentials) {
        // Obtener datos del cliente (including preferred WA instance)
        const { data: customer } = await (supabase.from("customers") as any)
          .select("full_name, phone, whatsapp_instance")
          .eq("id", data.customerId)
          .single();

        // Obtener credenciales del nuevo slot
        const { data: newSlotInfo } = await (supabase.from("sale_slots") as any)
          .select(
            `
                        slot_identifier,
                        pin_code,
                        mother_accounts:mother_account_id (
                            email, password, platform, instructions, send_instructions
                        )
                    `,
          )
          .eq("id", newSlotId)
          .single();

        if (customer && newSlotInfo?.mother_accounts) {
          const acct = newSlotInfo.mother_accounts;

          // Verificar si la plataforma es de tipo FAMILIA — no enviar en cambios
          const { data: platData } = await (supabase.from("platforms") as any)
            .select("business_type")
            .eq("name", acct.platform)
            .single();
          const isFamilySwap = platData?.business_type === "family_account";

          if (isFamilySwap) {
            console.log(
              "[WhatsApp/Swap] Cuenta FAMILIA — omitiendo mensaje automático de cambio",
            );
          } else {
            // Esperar 5 segundos antes de enviar el mensaje, solicitado por el usuario
            await new Promise((r) => setTimeout(r, 5000));

            await sendCredentialUpdate({
              customerPhone: customer.phone || data.customerId,
              customerName: customer.full_name || customer.phone,
              platform: acct.platform || newPlatform,
              email: acct.email || "",
              password: acct.password || "",
              profile: newSlotInfo.slot_identifier || "Perfil asignado",
              pin: newSlotInfo.pin_code || undefined,
              customerId: data.customerId,
              instanceName: customer.whatsapp_instance || undefined,
            });

            if (acct.send_instructions && acct.instructions) {
              await new Promise((r) => setTimeout(r, 1500));
              const { sendText } = await import("@/lib/whatsapp");
              await sendText(
                customer.phone,
                `📋 *Instrucciones de acceso:*\n\n${acct.instructions}`,
                {
                  instanceName: customer.whatsapp_instance || undefined,
                  customerId: data.customerId,
                },
              );
            }
          }
        }
      }
    })().catch((waError) => {
      console.error("[WhatsApp/Swap] Error (non-blocking):", waError);
    });

    // Fetch new account email to redirect inventory search
    let newAccountEmail = "";
    try {
      const { data: newSlotForEmail } = await (
        supabase.from("sale_slots") as any
      )
        .select("mother_accounts:mother_account_id(email)")
        .eq("id", newSlotId)
        .single();
      newAccountEmail = (newSlotForEmail as any)?.mother_accounts?.email || "";
    } catch {
      /* non-blocking */
    }

    return {
      success: true,
      message: `Servicio intercambiado a ${newPlatform || "nuevo slot"} exitosamente`,
      motherAccountId,
      platform,
      newAccountEmail,
    };
  } catch (error: any) {
    console.error("[SwapService] Error:", error);
    return { error: error.message || "Error al intercambiar servicio" };
  }
}

/**
 * Get other active clients in the same mother account (siblings of the swapped slot).
 */
export async function getAccountSiblings(
  motherAccountId: string,
  excludeSlotId?: string,
) {
  const supabase = await createAdminClient();

  try {
    // Get all sold slots for this account
    const { data: slots } = await (supabase.from("sale_slots") as any)
      .select("id, slot_identifier, pin_code, status")
      .eq("mother_account_id", motherAccountId)
      .eq("status", "sold");

    if (!slots || slots.length === 0) return { siblings: [] };

    // Filter out the excluded slot
    const siblingSlots = excludeSlotId
      ? slots.filter((s: any) => s.id !== excludeSlotId)
      : slots;

    if (siblingSlots.length === 0) return { siblings: [] };

    // Get active sales for these slots
    const slotIds = siblingSlots.map((s: any) => s.id);
    const { data: sales } = await (supabase.from("sales") as any)
      .select("id, customer_id, slot_id, amount_gs")
      .in("slot_id", slotIds)
      .eq("is_active", true);

    if (!sales || sales.length === 0) return { siblings: [] };

    // Get customer info
    const custIds = [...new Set(sales.map((s: any) => s.customer_id))];
    const { data: customers } = await (supabase.from("customers") as any)
      .select("id, full_name, phone")
      .in("id", custIds);

    const custMap = new Map((customers || []).map((c: any) => [c.id, c]));

    const siblings = sales.map((sale: any) => {
      const slot = siblingSlots.find((s: any) => s.id === sale.slot_id);
      const cust = custMap.get(sale.customer_id) as any;
      return {
        sale_id: sale.id,
        slot_id: sale.slot_id,
        slot_identifier: slot?.slot_identifier || "",
        customer_id: sale.customer_id,
        customer_name: cust?.full_name || "Sin nombre",
        customer_phone: cust?.phone || "",
        amount: sale.amount_gs,
      };
    });

    return { siblings };
  } catch (error: any) {
    console.error("[GetAccountSiblings] Error:", error);
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
    const { data: account } = await (supabase.from("mother_accounts") as any)
      .select("platform")
      .eq("id", motherAccountId)
      .single();

    if (!account) throw new Error("Cuenta no encontrada");

    // Check if this is a family-type platform
    let isFamilyBulk = false;
    if (account.platform) {
      const { data: platData } = await (supabase.from("platforms") as any)
        .select("business_type")
        .eq("name", account.platform)
        .single();
      isFamilyBulk = platData?.business_type === "family_account";
    }

    // Get all active sales for this account's slots (include credentials for family)
    const { data: slots } = await (supabase.from("sale_slots") as any)
      .select("id, slot_identifier, pin_code")
      .eq("mother_account_id", motherAccountId)
      .eq("status", "sold");

    if (!slots || slots.length === 0) return { success: true, moved: 0 };

    const slotIds = slots.map((s: any) => s.id);
    const { data: sales } = await (supabase.from("sales") as any)
      .select("id, customer_id, slot_id, amount_gs, start_date, end_date")
      .in("slot_id", slotIds)
      .eq("is_active", true);

    if (!sales || sales.length === 0) return { success: true, moved: 0 };

    // Build a map of slot credentials for family transfer
    const slotCredMap = new Map<
      string,
      { slot_identifier: string | null; pin_code: string | null }
    >(
      slots.map((s: any) => [
        s.id,
        { slot_identifier: s.slot_identifier, pin_code: s.pin_code },
      ]),
    );

    // Get available slots from OTHER accounts of same platform
    const { data: availableSlots } = await (supabase.from("sale_slots") as any)
      .select("id, mother_accounts:mother_account_id(platform, status)")
      .eq("status", "available")
      .neq("mother_account_id", motherAccountId);

    const validSlots = (availableSlots || []).filter(
      (s: any) =>
        s.mother_accounts?.platform === account.platform &&
        s.mother_accounts?.status === "active",
    );

    if (validSlots.length < sales.length) {
      return {
        error: `No hay suficientes slots disponibles. Necesarios: ${sales.length}, disponibles: ${validSlots.length}`,
      };
    }

    // Move each client
    let moved = 0;
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const targetSlot = validSlots[i];
      const oldCreds = slotCredMap.get(sale.slot_id);

      // Deactivate old sale
      await (supabase.from("sales") as any)
        .update({ is_active: false })
        .eq("id", sale.id);

      // Free old slot (clear credentials if family)
      const freeUpdate: any = { status: "available" };
      if (isFamilyBulk) {
        freeUpdate.slot_identifier = null;
        freeUpdate.pin_code = null;
      }
      await (supabase.from("sale_slots") as any)
        .update(freeUpdate)
        .eq("id", sale.slot_id);

      // Create new sale — preservar fechas del sale anterior
      let bulkEndDate = sale.end_date || null;
      if (!bulkEndDate) {
        // Fallback: renewal_date de la cuenta madre destino → 30 días
        const { data: tgtSlotInfo } = await (supabase.from("sale_slots") as any)
          .select("mother_accounts:mother_account_id(renewal_date)")
          .eq("id", targetSlot.id)
          .single();
        bulkEndDate = (tgtSlotInfo as any)?.mother_accounts?.renewal_date || null;
        if (!bulkEndDate) {
          const fb = new Date();
          fb.setDate(fb.getDate() + 30);
          bulkEndDate = fb.toISOString().split("T")[0];
        }
      }
      await (supabase.from("sales") as any).insert({
        customer_id: sale.customer_id,
        slot_id: targetSlot.id,
        amount_gs: sale.amount_gs,
        original_price_gs: sale.amount_gs,
        override_price: false,
        start_date: sale.start_date || new Date().toISOString().split("T")[0],
        end_date: bulkEndDate,
        is_active: true,
        payment_method: "cash",
      });

      // Mark new slot as sold (transfer credentials if family)
      const soldUpdate: any = { status: "sold" };
      if (isFamilyBulk && oldCreds?.slot_identifier) {
        soldUpdate.slot_identifier = oldCreds.slot_identifier;
        soldUpdate.pin_code = oldCreds.pin_code || null;
      }
      await (supabase.from("sale_slots") as any)
        .update(soldUpdate)
        .eq("id", targetSlot.id);

      moved++;
    }

    return { success: true, moved };
  } catch (error: any) {
    console.error("[BulkSwap] Error:", error);
    return { error: error.message || "Error al migrar clientes" };
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
      .from("bundles")
      .select("*, bundle_items(*)")
      .eq("id", data.bundleId)
      .single();

    if (bundleError || !bundle) {
      return { error: "Bundle no encontrado" };
    }

    // Cast bundle to any to access properties
    const bundleData = bundle as any;

    // 2. Buscar o crear cliente
    let customerId: string = data.customerId || "";

    if (!customerId) {
      const { data: existingCustomer } = await (
        supabase.from("customers") as any
      )
        .select("id")
        .eq("phone", normalizePhone(data.customerPhone))
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: createError } = await (
          supabase.from("customers") as any
        )
          .insert({
            phone: normalizePhone(data.customerPhone),
            full_name: data.customerName || data.customerPhone,
            notes: "Creado desde Venta de Bundle",
          })
          .select("id")
          .single();

        if (createError)
          throw new Error(`Error creando cliente: ${createError.message}`);
        customerId = newCustomer.id;
      }
    }

    // Auto-create portal account if customer doesn't have one
    try {
      await ensurePortalAccount(
        customerId,
        normalizePhone(data.customerPhone),
        data.customerName || data.customerPhone,
      );
    } catch (e) {
      console.warn(
        "[BundleSale] Portal account creation failed (non-blocking):",
        e,
      );
    }

    // 3. Para cada item del bundle, asignar un slot
    const bundleItems = bundleData.bundle_items || [];
    const assignedSlots: { slotId: string; platform: string }[] = [];

    for (const item of bundleItems) {
      for (let i = 0; i < item.slot_count; i++) {
        // Buscar slot disponible para esta plataforma
        const { data: bestSlot, error: slotError } = await supabase.rpc(
          "get_best_slot_for_sale",
          {
            target_platform: item.platform,
          } as any,
        );

        const slotArray = (bestSlot as unknown as any[]) || [];
        const slot = slotArray.length > 0 ? slotArray[0] : bestSlot;

        if (slotError || !slot) {
          // Rollback: liberar slots ya asignados
          for (const assigned of assignedSlots) {
            await (supabase.from("sale_slots") as any)
              .update({ status: "available" })
              .eq("id", assigned.slotId);
          }
          return { error: `No hay slots disponibles para ${item.platform}` };
        }

        // Marcar slot como vendido
        const slotId = slot.slot_id || slot.id;
        await (supabase.from("sale_slots") as any)
          .update({ status: "sold", customer_id: customerId })
          .eq("id", slotId);

        assignedSlots.push({ slotId, platform: item.platform });
      }
    }

    // 4. Crear una venta por cada slot asignado (o una venta principal con bundle_id)
    // Usamos una venta principal que representa el bundle
    const pricePerSlot = data.price / assignedSlots.length;

    for (let i = 0; i < assignedSlots.length; i++) {
      const assigned = assignedSlots[i];
      const { error: saleError } = await (supabase.from("sales") as any).insert(
        {
          customer_id: customerId,
          slot_id: assigned.slotId,
          amount_gs: i === 0 ? data.price : 0, // Solo la primera venta tiene el monto total
          original_price_gs: bundleData.original_price_gs || data.price,
          bundle_id: data.bundleId,
          start_date: new Date().toISOString().split("T")[0],
          is_active: true,
          payment_method: "cash",
        },
      );

      if (saleError)
        throw new Error(`Error creando venta: ${saleError.message}`);
    }

    await logAction("create_bundle_sale", "bundle", data.bundleId, {
      message: `realizó una venta de combo a ${data.customerName || data.customerPhone}`,
    });

    revalidatePath("/");
    return {
      success: true,
      message: `Bundle "${bundleData.name}" vendido exitosamente (${assignedSlots.length} servicios)`,
    };
  } catch (error: any) {
    console.error("Bundle Sale Error:", error);
    return {
      error:
        error.message || "Error desconocido al procesar la venta de bundle",
    };
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

export async function getAvailableSlots(
  platform: string,
): Promise<{ data: AvailableSlot[] | null; error: string | null }> {
  const supabase = await createAdminClient();

  try {
    const { data, error } = await supabase
      .from("sale_slots")
      .select(
        `
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
            `,
      )
      .eq("status", "available")
      .eq("mother_accounts.platform", platform)
      .eq("mother_accounts.status", "active");

    if (error) throw error;

    // Transform the data to match our interface
    const transformedSlots = (data || []).map((slot: any) => ({
      ...slot,
      mother_account: Array.isArray(slot.mother_account)
        ? slot.mother_account[0]
        : slot.mother_account,
    }));

    return { data: transformedSlots, error: null };
  } catch (error: any) {
    console.error("Error getting available slots:", error);
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
      return { error: "El combo debe tener al menos una plataforma" };
    }
    if (!data.customerPhone || data.customerPhone.length < 10) {
      return { error: "Se requiere un número de teléfono válido" };
    }
    if (!data.totalPrice || data.totalPrice <= 0) {
      return { error: "El precio del combo debe ser mayor a 0" };
    }

    // 1. Check stock for ALL platforms before proceeding
    const { data: allAvailableSlots, error: slotError } = await (
      supabase.from("sale_slots") as any
    )
      .select(
        `
                id,
                slot_identifier,
                mother_accounts:mother_account_id (
                    id,
                    platform,
                    email,
                    renewal_date
                )
            `,
      )
      .eq("status", "available");

    if (slotError) {
      return { error: `Error verificando stock: ${slotError.message}` };
    }

    // Group available slots by platform
    const slotsByPlatform: Record<string, any[]> = {};
    for (const slot of allAvailableSlots || []) {
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
          error: `Falta stock de ${item.platform} para completar el combo (disponible: ${available}, necesario: ${item.quantity})`,
        };
      }
    }

    // 2. Find or create customer
    let customerId = data.customerId || "";

    if (!customerId) {
      const { data: existingCustomer } = await (
        supabase.from("customers") as any
      )
        .select("id")
        .eq("phone", normalizePhone(data.customerPhone))
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: createError } = await (
          supabase.from("customers") as any
        )
          .insert({
            phone: normalizePhone(data.customerPhone),
            full_name: data.customerName || data.customerPhone,
            notes: "Creado desde Venta Rápida (Combo)",
          })
          .select("id")
          .single();

        if (createError)
          return { error: `Error creando cliente: ${createError.message}` };
        customerId = newCustomer.id;
      }
    }

    // Auto-create portal account if customer doesn't have one
    try {
      await ensurePortalAccount(
        customerId,
        normalizePhone(data.customerPhone),
        data.customerName || data.customerPhone,
      );
    } catch (e) {
      console.warn(
        "[ComboSale] Portal account creation failed (non-blocking):",
        e,
      );
    }

    // 2b. Leer whatsapp_instance del cliente
    let customerWaInstance: string | null = null;
    {
      const { data: custWa } = await (supabase.from("customers") as any)
        .select("whatsapp_instance")
        .eq("id", customerId)
        .single();
      customerWaInstance = custWa?.whatsapp_instance || null;
    }

    // 3. Generate a shared combo_id for grouping
    const comboId = crypto.randomUUID();
    const today = new Date().toISOString().split("T")[0];
    const comboLabel = data.items
      .map((it) => `${it.quantity}x ${it.platform}`)
      .join(" + ");

    // 4. Assign slots and create sales records
    const assignedSlots: { slotId: string; platform: string; email: string }[] =
      [];
    const totalItems = data.items.reduce((sum, it) => sum + it.quantity, 0);

    for (const item of data.items) {
      const platformSlots = slotsByPlatform[item.platform];

      for (let i = 0; i < item.quantity; i++) {
        const slot = platformSlots[i];

        // Mark slot as sold
        const { error: updateError } = await (
          supabase.from("sale_slots") as any
        )
          .update({ status: "sold" })
          .eq("id", slot.id)
          .eq("status", "available");

        if (updateError) {
          for (const assigned of assignedSlots) {
            await (supabase.from("sale_slots") as any)
              .update({ status: "available" })
              .eq("id", assigned.slotId);
          }
          return {
            error: `Error asignando slot de ${item.platform}: ${updateError.message}`,
          };
        }

        // Create sale record — first sale gets full price, rest get $0
        const isFirst = assignedSlots.length === 0;
        const comboStartDate = data.deliveryDate ? data.deliveryDate : today;
        const comboEndDateObj = new Date(comboStartDate + "T12:00:00");
        comboEndDateObj.setDate(comboEndDateObj.getDate() + 30);
        const comboEndDate = comboEndDateObj.toISOString().split("T")[0];
        const { error: saleError } = await (
          supabase.from("sales") as any
        ).insert({
          customer_id: customerId,
          slot_id: slot.id,
          amount_gs: isFirst ? data.totalPrice : 0,
          original_price_gs: data.totalPrice,
          start_date: comboStartDate,
          end_date: comboEndDate,
          is_active: true,
          payment_method: "cash",
          combo_id: comboId,
        });

        if (saleError) {
          for (const assigned of assignedSlots) {
            await (supabase.from("sale_slots") as any)
              .update({ status: "available" })
              .eq("id", assigned.slotId);
          }
          await (supabase.from("sale_slots") as any)
            .update({ status: "available" })
            .eq("id", slot.id);
          return { error: `Error registrando venta: ${saleError.message}` };
        }

        assignedSlots.push({
          slotId: slot.id,
          platform: item.platform,
          email: slot.mother_accounts?.email || "",
        });
      }
    }

    // 5. Kommo CRM desactivado temporalmente

    // 6. Enviar credenciales por WhatsApp para cada slot del combo (sin bloquear)
    (async () => {
      const waSettings = await getWhatsAppSettings();
      if (waSettings.auto_send_credentials) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        const expDateStr = endDate.toLocaleDateString("es-PY");

        for (const assigned of assignedSlots) {
          try {
            // Fetch slot credentials
            const { data: slotDetail } = await (
              supabase.from("sale_slots") as any
            )
              .select(
                `
                                slot_identifier, pin_code,
                                mother_accounts:mother_account_id (email, password, platform)
                            `,
              )
              .eq("id", assigned.slotId)
              .single();

            if (slotDetail?.mother_accounts) {
              const acct = slotDetail.mother_accounts;
              const comboCredResult = await sendSaleCredentials({
                customerPhone: data.customerPhone,
                customerName: data.customerName || data.customerPhone,
                platform: acct.platform || assigned.platform,
                email: acct.email || "",
                password: acct.password || "",
                profile: slotDetail.slot_identifier || "Perfil asignado",
                expirationDate: expDateStr,
                customerId,
                instanceName: customerWaInstance || undefined,
              });
              // Auto-assign WA instance if customer didn't have one
              if (!customerWaInstance && comboCredResult?.instanceUsed) {
                customerWaInstance = comboCredResult.instanceUsed;
                await (supabase.from("customers") as any)
                  .update({ whatsapp_instance: comboCredResult.instanceUsed })
                  .eq("id", customerId);
              }
            }
          } catch (slotWaErr) {
            console.error(
              `[WhatsApp] Error sending combo slot ${assigned.slotId}:`,
              slotWaErr,
            );
          }
        }
      }
    })().catch((waError) => {
      console.error("[WhatsApp] Combo error (non-blocking):", waError);
    });

    await logAction("create_combo_sale", "combo", comboId, {
      message: `realizó una venta múltiple a ${data.customerName || data.customerPhone}`,
    });

    revalidatePath("/");
    revalidatePath("/sales");
    revalidatePath("/inventory");

    // Retrieve credentials for the final copy-to-clipboard action
    const comboCredentials = [];
    const expDateStr = new Date(Date.now() + 30 * 86400000).toLocaleDateString("es-PY");
    for (const assigned of assignedSlots) {
      try {
        const { data: slotDetail } = await (supabase.from("sale_slots") as any)
          .select("slot_identifier, pin_code, mother_accounts:mother_account_id (email, password, platform)")
          .eq("id", assigned.slotId)
          .single();
        if (slotDetail?.mother_accounts) {
          comboCredentials.push({
             platform: slotDetail.mother_accounts.platform || assigned.platform,
             email: slotDetail.mother_accounts.email || "",
             password: slotDetail.mother_accounts.password || "",
             profile: slotDetail.slot_identifier || "",
             pin: slotDetail.pin_code || "",
             expirationDate: expDateStr
          });
        }
      } catch (e) {}
    }

    return {
      success: true,
      comboId: comboId.slice(0, 8),
      assignedSlots,
      totalItems,
      comboCredentials,
    };
  } catch (error: any) {
    console.error("Error procesando combo:", error);
    return { error: error.message || "Error desconocido procesando combo" };
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
    const { data: account, error: accountError } = await (
      supabase.from("mother_accounts") as any
    )
      .select(
        "id, platform, email, password, renewal_date, sale_slots (id, slot_identifier, status)",
      )
      .eq("id", motherAccountId)
      .single();

    if (accountError || !account) throw new Error("Cuenta madre no encontrada");

    const availableSlots = (account.sale_slots || []).filter(
      (s: any) => s.status === "available",
    );

    if (availableSlots.length === 0)
      throw new Error("No hay slots disponibles en esta cuenta");

    // 2. Get customer info (including preferred WhatsApp instance)
    const { data: customer } = await (supabase.from("customers") as any)
      .select("id, full_name, phone, whatsapp_instance")
      .eq("id", customerId)
      .single();

    if (!customer) throw new Error("Cliente no encontrado");

    // 3. Calculate start date
    const startDate = new Date().toISOString().split("T")[0];

    // 4. Create one sale per slot
    const salesInsert = availableSlots.map((slot: any) => ({
      customer_id: customerId,
      slot_id: slot.id,
      amount_gs: Math.round(price / availableSlots.length),
      start_date: startDate,
      is_active: true,
    }));

    const { error: salesError } = await (supabase.from("sales") as any).insert(
      salesInsert,
    );
    if (salesError)
      throw new Error(`Error creando ventas: ${salesError.message}`);

    // 5. Mark all slots as sold
    const slotIds = availableSlots.map((s: any) => s.id);
    await (supabase.from("sale_slots") as any)
      .update({ status: "sold" })
      .in("id", slotIds);

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
          expirationDate: endDate.toLocaleDateString("es-PY"),
          customerId,
          instanceName: customer.whatsapp_instance || undefined,
        });
        // Auto-assign WA instance if customer didn't have one
        if (!customer.whatsapp_instance && credResult?.instanceUsed) {
          await (supabase.from("customers") as any)
            .update({ whatsapp_instance: credResult.instanceUsed })
            .eq("id", customerId);
        }
      } catch (waErr) {
        console.warn("WhatsApp send failed (non-critical):", waErr);
      }
    }

    // 7. Audit log
    await logAction(
      "create_full_account_sale",
      "mother_account",
      motherAccountId,
      {
        message: `vendió cuenta completa de ${account.platform} a ${customer.full_name || customer.phone} (${availableSlots.length} perfiles)`,
      },
    );

    revalidatePath("/");
    revalidatePath("/sales");
    revalidatePath("/inventory");
    revalidatePath("/renewals");

    return {
      success: true,
      platform: account.platform,
      slotsCount: availableSlots.length,
    };
  } catch (error: any) {
    console.error("Error en createFullAccountSale:", error);
    return { error: error.message || "Error desconocido" };
  }
}

// ==========================================
// Add account to existing combo
// ==========================================

export async function addToCombo(comboId: string, newSlotId: string, newComboPrice: number) {
  const supabase = await createAdminClient();

  try {
    // Get existing combo sales to read dates and customer
    const { data: comboSales } = await (supabase.from("sales") as any)
      .select("id, customer_id, start_date, end_date, amount_gs, combo_id")
      .eq("combo_id", comboId)
      .eq("is_active", true)
      .order("amount_gs", { ascending: false }); // primary (with amount) first

    if (!comboSales || comboSales.length === 0) {
      return { error: "No se encontraron ventas activas en este combo" };
    }

    const primary = comboSales[0];

    // Create new sale with same combo_id and dates
    const { error: saleError } = await (supabase.from("sales") as any)
      .insert({
        customer_id: primary.customer_id,
        slot_id: newSlotId,
        amount_gs: 0, // secondary sale
        original_price_gs: newComboPrice,
        start_date: primary.start_date,
        end_date: primary.end_date,
        is_active: true,
        payment_method: "cash",
        combo_id: comboId,
      });

    if (saleError) throw new Error(`Error agregando al combo: ${saleError.message}`);

    // Mark slot as sold
    await (supabase.from("sale_slots") as any)
      .update({ status: "sold" })
      .eq("id", newSlotId);

    // Update primary sale amount to new combo price
    await (supabase.from("sales") as any)
      .update({ amount_gs: newComboPrice, original_price_gs: newComboPrice })
      .eq("id", primary.id);

    await logAction("add_to_combo", "combo", comboId, {
      message: `agregó un servicio al combo (nuevo precio: Gs. ${newComboPrice.toLocaleString()})`,
    });

    revalidatePath("/");
    return { success: true, message: "Servicio agregado al combo exitosamente" };
  } catch (error: any) {
    console.error("[AddToCombo] Error:", error);
    return { error: error.message || "Error al agregar al combo" };
  }
}

// ==========================================
// Get combo info for a given sale
// ==========================================

export async function getComboInfo(saleId: string) {
  const supabase = await createAdminClient();

  try {
    const { data: sale } = await (supabase.from("sales") as any)
      .select("combo_id")
      .eq("id", saleId)
      .single();

    if (!sale?.combo_id) return { isCombo: false, siblings: [] };

    const { data: siblings } = await (supabase.from("sales") as any)
      .select(`
        id, slot_id, amount_gs, start_date, end_date, is_active, combo_id,
        sale_slots:slot_id (
          slot_identifier,
          mother_accounts:mother_account_id (platform, email)
        )
      `)
      .eq("combo_id", sale.combo_id)
      .eq("is_active", true)
      .order("amount_gs", { ascending: false });

    return {
      isCombo: true,
      comboId: sale.combo_id,
      siblings: (siblings || []).map((s: any) => ({
        saleId: s.id,
        slotId: s.slot_id,
        amountGs: s.amount_gs,
        platform: s.sale_slots?.mother_accounts?.platform || "?",
        email: s.sale_slots?.mother_accounts?.email || "",
        slotName: s.sale_slots?.slot_identifier || "",
        startDate: s.start_date,
        endDate: s.end_date,
      })),
      totalPrice: (siblings || []).reduce((sum: number, s: any) => sum + (Number(s.amount_gs) || 0), 0),
    };
  } catch (error: any) {
    console.error("[GetComboInfo] Error:", error);
    return { isCombo: false, siblings: [], error: error.message };
  }
}

// ==========================================
// Extend Sale (extend active subscription)
// Creates a NEW sale record for financial history.
// The slot stays 'sold' — only the sale rotates.
// ==========================================

export interface ExtendSaleData {
  saleId: string;
  extraDays: number;
  amountGs: number;
  notes?: string;
}

export async function extendSale(data: ExtendSaleData) {
  const supabase = await createAdminClient();

  try {
    if (!data.saleId) throw new Error("Se require el ID de la venta");
    if (!data.extraDays || data.extraDays <= 0)
      throw new Error("Los días de extensión deben ser mayores a 0");
    if (data.amountGs < 0) throw new Error("El monto no puede ser negativo");

    // Check if this sale belongs to a combo
    const { data: saleCheck } = await (supabase.from("sales") as any)
      .select("combo_id")
      .eq("id", data.saleId)
      .single();

    const isCombo = !!saleCheck?.combo_id;

    let newSaleId: string;
    let newEndDate: string;
    let salesExtended = 1;

    if (isCombo) {
      // ── COMBO EXTENSION: extend ALL siblings atomically ──
      const { data: result, error: rpcError } = await (supabase as any).rpc(
        "extend_combo_atomic",
        {
          p_any_sale_id: data.saleId,
          p_extra_days: data.extraDays,
          p_amount_gs: data.amountGs,
          p_notes: data.notes || null,
        },
      );

      if (rpcError) {
        if (rpcError.code === "P0001") throw new Error(rpcError.message);
        if (rpcError.code === "PGRST202") {
          console.warn("[ExtendSale] extend_combo_atomic not available, falling back");
          return await extendSaleIndividual(supabase, data);
        }
        throw new Error(`Error al extender combo: ${rpcError.message}`);
      }

      const row = Array.isArray(result) ? result[0] : result;
      if (!row) throw new Error("La función no retornó resultado");

      newSaleId = row.new_combo_id;
      newEndDate = row.new_end_date;
      salesExtended = row.sales_extended || 1;

      await logAction("extend_combo", "combo", newSaleId, {
        message: `extendió combo (${salesExtended} servicios) por ${data.extraDays} días (Gs. ${data.amountGs.toLocaleString()})`,
      });

      revalidatePath("/");
      return {
        success: true,
        newSaleId,
        newEndDate,
        isCombo: true,
        salesExtended,
        message: `Combo extendido (${salesExtended} servicios) ${data.extraDays} días — nuevo vencimiento: ${new Date(newEndDate + "T12:00:00").toLocaleDateString("es-PY")}`,
      };
    } else {
      return await extendSaleIndividual(supabase, data);
    }
  } catch (error: any) {
    console.error("[ExtendSale] Error:", error);
    return { error: error.message || "Error al extender la suscripción" };
  }
}

// Helper: extend a single (non-combo) sale
async function extendSaleIndividual(supabase: any, data: ExtendSaleData) {
  const { data: result, error: rpcError } = await (supabase as any).rpc(
    "extend_sale_atomic",
    {
      p_sale_id: data.saleId,
      p_extra_days: data.extraDays,
      p_amount_gs: data.amountGs,
      p_notes: data.notes || null,
    },
  );

  if (rpcError) {
    if (rpcError.code === "P0001") throw new Error(rpcError.message);
    throw new Error(`Error al extender: ${rpcError.message}`);
  }

  const row = Array.isArray(result) ? result[0] : result;
  if (!row) throw new Error("La función no retornó resultado");

  const newSaleId: string = row.new_sale_id;
  const newEndDate: string = row.new_end_date;

  // WhatsApp notification (non-blocking)
  (async () => {
    const waSettings = await getWhatsAppSettings();
    if (waSettings.auto_send_credentials) {
      const { data: saleInfo } = await (supabase.from("sales") as any)
        .select(`
          customer_id, slot_id,
          customers:customer_id (full_name, phone, whatsapp_instance),
          sale_slots:slot_id (
            slot_identifier, pin_code,
            mother_accounts:mother_account_id (email, password, platform)
          )
        `)
        .eq("id", newSaleId)
        .single();

      if (saleInfo?.customers?.phone) {
        const slot = saleInfo.sale_slots as any;
        const platformName = slot?.mother_accounts?.platform || "";

        const { data: platData } = await (supabase.from("platforms") as any)
          .select("business_type")
          .eq("name", platformName)
          .single();
        const isFamilyExtend = platData?.business_type === "family_account";

        if (!isFamilyExtend) {
          const { sendText } = await import("@/lib/whatsapp");
          const customer = saleInfo.customers as any;
          const platform = platformName || "tu servicio";
          const expDateStr = new Date(newEndDate + "T12:00:00").toLocaleDateString("es-PY", {
            day: "2-digit", month: "long", year: "numeric",
          });
          await sendText(
            customer.phone,
            `✅ *Extensión de servicio confirmada*\n\n🎬 *Plataforma:* ${platform}\n📅 *Nueva fecha de vencimiento:* ${expDateStr}\n\n¡Gracias por tu confianza! 🙌`,
            { instanceName: customer.whatsapp_instance || undefined, customerId: saleInfo.customer_id },
          );
        }
      }
    }
  })().catch((waError) => {
    console.error("[WhatsApp/Extend] Error (non-blocking):", waError);
  });

  await logAction("extend_sale", "sale", newSaleId, {
    message: `extendió suscripción por ${data.extraDays} días (Gs. ${data.amountGs.toLocaleString()})`,
  });

  revalidatePath("/");
  return {
    success: true,
    newSaleId,
    newEndDate,
    isCombo: false,
    message: `Suscripción extendida ${data.extraDays} días — nuevo vencimiento: ${new Date(newEndDate + "T12:00:00").toLocaleDateString("es-PY")}`,
  };
}

export async function enqueueManualReminder(saleId: string) {
  const supabase = await createAdminClient();
  try {
    const { data: sale, error: saleError } = await (supabase.from("sales") as any)
      .select("id, amount_gs, end_date, customer_id, slot_id")
      .eq("id", saleId)
      .single();

    if (saleError || !sale) throw new Error("Venta no encontrada (Error en base de datos)");
    
    // Get customer
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select("id, full_name, phone, whatsapp_instance")
      .eq("id", sale.customer_id)
      .single();

    if (customerError || !customer || !customer.phone) throw new Error("El cliente no tiene teléfono asignado o no se encontró");

    // Get platform from slot -> mother_account
    let platform = "Servicio";
    if (sale.slot_id) {
        const { data: slot } = await (supabase.from("sale_slots") as any)
            .select("mother_account_id")
            .eq("id", sale.slot_id)
            .single();
        
        if (slot?.mother_account_id) {
            const { data: mother } = await (supabase.from("mother_accounts") as any)
                .select("platform")
                .eq("id", slot.mother_account_id)
                .single();
            if (mother?.platform) platform = mother.platform;
        }
    }
    
    const idempotencyKey = `manual:${saleId}:${Date.now()}`;

    const { error: queueError } = await (supabase.from("message_queue") as any)
      .insert({
        customer_id: customer.id,
        sale_id: sale.id,
        message_type: 'manual_reminder',
        channel: 'whatsapp',
        phone: customer.phone,
        customer_name: customer.full_name || 'Cliente',
        platform: platform,
        instance_name: customer.whatsapp_instance,
        idempotency_key: idempotencyKey,
        status: 'pending'
      });

    if (queueError) throw new Error(`Error encolando recordatorio: ${queueError.message}`);

    // Disparador fantasma para envío inmediato
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${baseUrl}/api/cron/trigger-pipeline?secret=clickpar-cron-2024`, { method: 'GET' })
        .catch(err => console.error('[ManualReminder] Fallo disparador fantasma:', err));

    await logAction("manual_reminder", "sale", saleId, {
      message: `encoló un recordatorio de pago manual para ${customer.full_name || customer.phone}`,
    });

    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
