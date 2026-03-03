import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    getLeadDetails,
    addNoteToLead,
    moveVentaLeadToStatus,
    formatEmailAntiSpam,
    formatPasswordAntiSpam,
    VENTAS_STATUS,
} from '@/lib/kommo';
import { normalizePhone } from '@/lib/utils/phone';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kommo/webhook/venta-confirmada
 * 
 * Webhook receiver for Kommo Digital Pipeline.
 * Triggered when a lead is moved to "Venta Confirmada" stage.
 * 
 * Kommo sends: { leads: { status: [{ id, status_id, pipeline_id, ... }] } }
 * 
 * This endpoint:
 * 1. Extracts lead ID from webhook payload
 * 2. Fetches lead details + contact from Kommo API
 * 3. Extracts platform name from lead name ("Venta {platform} - {name}")
 * 4. Finds available slot, creates sale, marks slot as sold
 * 5. Adds credentials as a note to the lead
 * 6. Moves lead to "Credenciales Enviadas"
 */
export async function POST(request: NextRequest) {
    try {
        // Parse Kommo webhook payload (x-www-form-urlencoded or JSON)
        let leadId: number | null = null;

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await request.json();
            console.log('[Webhook] JSON body:', JSON.stringify(body).substring(0, 500));
            // Format: { leads: { status: [{ id: "123", ... }] } }
            leadId = parseInt(body?.leads?.status?.[0]?.id || body?.leads?.add?.[0]?.id || '0');
        } else {
            // x-www-form-urlencoded
            const formData = await request.text();
            console.log('[Webhook] Form body:', formData.substring(0, 500));
            const params = new URLSearchParams(formData);
            // Try common patterns
            const leadData = params.get('leads[status][0][id]') || params.get('leads[add][0][id]');
            leadId = leadData ? parseInt(leadData) : null;

            // If still no lead ID, try to parse nested JSON
            if (!leadId) {
                try {
                    const parsed = JSON.parse(formData);
                    leadId = parseInt(parsed?.leads?.status?.[0]?.id || '0');
                } catch { /* not JSON */ }
            }
        }

        if (!leadId) {
            console.error('[Webhook] No lead ID found in payload');
            return NextResponse.json({ error: 'No lead ID found' }, { status: 400 });
        }

        console.log(`[Webhook] Processing lead #${leadId}`);

        // 1. Fetch lead details from Kommo
        const lead = await getLeadDetails(leadId);
        if (!lead) {
            console.error(`[Webhook] Could not fetch lead #${leadId}`);
            return NextResponse.json({ error: 'Could not fetch lead' }, { status: 404 });
        }

        // 2. Extract platform from lead name (format: "Venta {platform} - {name}")
        const nameMatch = lead.name.match(/Venta\s+(.+?)\s*-\s*(.+)/i);
        let platform = nameMatch?.[1] || '';
        const customerNameFromLead = nameMatch?.[2] || '';

        if (!platform) {
            // Try just the lead name as platform
            platform = lead.name;
        }

        // 3. Get customer phone from linked contact
        const customerPhone = lead.contacts[0]?.phone || '';
        const customerName = lead.contacts[0]?.name || customerNameFromLead || 'Cliente Kommo';

        if (!customerPhone) {
            await addNoteToLead(leadId, '❌ Error: No se encontró teléfono del cliente. Agregá un contacto con teléfono al lead.');
            return NextResponse.json({ error: 'No customer phone found' }, { status: 400 });
        }

        // 4. Find available slot for this platform
        const { data: slots, error: slotError } = await supabase
            .from('sale_slots')
            .select(`
                id,
                slot_identifier,
                pin_code,
                mother_accounts!inner(
                    id, platform, email, password, slot_price_gs
                )
            `)
            .eq('status', 'available')
            .eq('mother_accounts.platform', platform)
            .eq('mother_accounts.status', 'active')
            .limit(1);

        if (slotError || !slots || slots.length === 0) {
            await addNoteToLead(leadId, `❌ Error: No hay slots disponibles para "${platform}". Verificar stock.`);
            return NextResponse.json({ error: `No slots for ${platform}` }, { status: 404 });
        }

        const slot = slots[0] as any;
        const account = Array.isArray(slot.mother_accounts) ? slot.mother_accounts[0] : slot.mother_accounts;
        const salePrice = lead.price || account.slot_price_gs || 0;

        // 5. Find or create customer in ClickPar
        let customerId: string;
        const { data: existingCustomer } = await supabase
            .from('customers' as any)
            .select('id')
            .eq('phone', normalizePhone(customerPhone))
            .single();

        if (existingCustomer) {
            customerId = (existingCustomer as any).id;
        } else {
            const { data: newCustomer, error: createError } = await supabase
                .from('customers' as any)
                .insert({
                    phone: normalizePhone(customerPhone),
                    full_name: customerName,
                    notes: 'Creado desde webhook Kommo',
                })
                .select('id')
                .single();

            if (createError) {
                await addNoteToLead(leadId, `❌ Error creando cliente: ${createError.message}`);
                return NextResponse.json({ error: createError.message }, { status: 500 });
            }
            customerId = (newCustomer as any).id;
        }

        // 6. Create sale
        const { error: saleError } = await supabase
            .from('sales' as any)
            .insert({
                customer_id: customerId,
                slot_id: slot.id,
                amount_gs: salePrice,
                original_price_gs: salePrice,
                start_date: new Date().toISOString().split('T')[0],
                is_active: true,
                payment_method: 'kommo_webhook',
            });

        if (saleError) {
            await addNoteToLead(leadId, `❌ Error creando venta: ${saleError.message}`);
            return NextResponse.json({ error: saleError.message }, { status: 500 });
        }

        // 7. Mark slot as sold
        await supabase
            .from('sale_slots')
            .update({ status: 'sold' })
            .eq('id', slot.id);

        // 8. Format credentials and add as note
        const emailSafe = formatEmailAntiSpam(account.email);
        const passwordSafe = formatPasswordAntiSpam(account.password || '');

        const credentialsNote = [
            `✅ VENTA PROCESADA AUTOMÁTICAMENTE`,
            ``,
            `Plataforma: ${platform}`,
            `Cliente: ${customerName}`,
            `Teléfono: ${customerPhone}`,
            `Precio: Gs. ${salePrice.toLocaleString()}`,
            ``,
            `📧 CREDENCIALES (formato anti-ban):`,
            `Email: ${emailSafe}`,
            `Contraseña: ${passwordSafe}`,
            `Perfil: ${slot.slot_identifier || 'Perfil asignado'}`,
            slot.pin_code ? `PIN: ${slot.pin_code}` : '',
            ``,
            `⚠️ Enviar al cliente por WhatsApp el siguiente mensaje:`,
            ``,
            `🎬 ¡Tu cuenta de ${platform} está lista!`,
            `📧 ${emailSafe}`,
            `🔑 ${passwordSafe}`,
            `👤 ${slot.slot_identifier || 'Tu perfil'}`,
            slot.pin_code ? `🔐 PIN: ${slot.pin_code}` : '',
            `No cambies la contraseña ni el perfil.`,
        ].filter(Boolean).join('\n');

        await addNoteToLead(leadId, credentialsNote);

        // 9. Move lead to "Credenciales Enviadas"
        await moveVentaLeadToStatus(leadId, 'CREDENCIALES_ENVIADAS');

        console.log(`[Webhook] ✅ Sale processed for lead #${leadId}: ${platform} → ${customerName}`);

        return NextResponse.json({ success: true, leadId, platform, customer: customerName });
    } catch (error: any) {
        console.error('[Webhook Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
