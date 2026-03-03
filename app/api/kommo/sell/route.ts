import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createVentaLead, addNoteToLead, moveVentaLeadToStatus, formatEmailAntiSpam, formatPasswordAntiSpam } from '@/lib/kommo';
import { normalizePhone } from '@/lib/utils/phone';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kommo/sell
 * Process an automated sale from Kommo.
 * Body: { platform, customerName, customerPhone, price?, leadId? }
 * Returns: sale info + credentials (with anti-ban formatting)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { platform, customerName, customerPhone, price, leadId } = body;

        if (!platform || !customerPhone) {
            return NextResponse.json(
                { error: 'Se requiere plataforma y teléfono del cliente' },
                { status: 400 }
            );
        }

        // 1. Find available slot for this platform
        const { data: slots, error: slotError } = await supabase
            .from('sale_slots')
            .select(`
                id,
                slot_identifier,
                pin_code,
                mother_accounts!inner(
                    id, platform, email, password, renewal_date, slot_price_gs
                )
            `)
            .eq('status', 'available')
            .eq('mother_accounts.platform', platform)
            .eq('mother_accounts.status', 'active')
            .limit(1);

        if (slotError || !slots || slots.length === 0) {
            return NextResponse.json(
                { error: `No hay slots disponibles para ${platform}`, available: false },
                { status: 404 }
            );
        }

        const slot = slots[0] as any;
        const account = Array.isArray(slot.mother_accounts) ? slot.mother_accounts[0] : slot.mother_accounts;
        const salePrice = price || account.slot_price_gs || 0;

        // 2. Find or create customer
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
                    full_name: customerName || customerPhone,
                    notes: 'Creado desde Kommo (venta automática)',
                })
                .select('id')
                .single();

            if (createError) {
                return NextResponse.json({ error: `Error creando cliente: ${createError.message}` }, { status: 500 });
            }
            customerId = (newCustomer as any).id;
        }

        // 3. Create sale
        const { error: saleError } = await supabase
            .from('sales' as any)
            .insert({
                customer_id: customerId,
                slot_id: slot.id,
                amount_gs: salePrice,
                original_price_gs: salePrice,
                start_date: new Date().toISOString().split('T')[0],
                is_active: true,
                payment_method: 'kommo_auto',
            });

        if (saleError) {
            return NextResponse.json({ error: `Error creando venta: ${saleError.message}` }, { status: 500 });
        }

        // 4. Mark slot as sold
        await supabase
            .from('sale_slots')
            .update({ status: 'sold' })
            .eq('id', slot.id);

        // 5. Create or update lead in Kommo
        try {
            if (leadId) {
                await moveVentaLeadToStatus(leadId, 'CREDENCIALES_ENVIADAS');
                await addNoteToLead(leadId,
                    `✅ Venta procesada\nPlataforma: ${platform}\nPrecio: Gs. ${salePrice.toLocaleString()}\nPerfil: ${slot.slot_identifier || 'N/A'}`
                );
            } else {
                const kommoResult = await createVentaLead({
                    platform,
                    customerPhone,
                    customerName: customerName || customerPhone,
                    price: salePrice,
                    statusKey: 'CREDENCIALES_ENVIADAS',
                });
                if (kommoResult.leadId) {
                    await addNoteToLead(kommoResult.leadId,
                        `Venta automática\nPlataforma: ${platform}\nPrecio: Gs. ${salePrice.toLocaleString()}\nEmail: ${account.email}\nPerfil: ${slot.slot_identifier || 'N/A'}`
                    );
                }
            }
        } catch (kommoError) {
            console.error('[Kommo] Error (non-blocking):', kommoError);
        }

        // 6. Return credentials with anti-ban formatting
        const emailSafe = formatEmailAntiSpam(account.email);
        const passwordSafe = formatPasswordAntiSpam(account.password || '');

        return NextResponse.json({
            success: true,
            sale: {
                platform,
                customer: customerName || customerPhone,
                phone: customerPhone,
                price: salePrice,
                price_formatted: `Gs. ${salePrice.toLocaleString()}`,
            },
            credentials: {
                email: account.email,
                email_safe: emailSafe,
                password_safe: passwordSafe,
                profile: slot.slot_identifier || 'Perfil asignado',
                pin: slot.pin_code || null,
            },
            message_for_customer: `🎬 ¡Tu cuenta de ${platform} está lista!\n\n📧 Email: ${emailSafe}\n🔑 Contraseña: ${passwordSafe}\n👤 Perfil: ${slot.slot_identifier || 'Tu perfil asignado'}\n${slot.pin_code ? `🔐 PIN: ${slot.pin_code}` : ''}\n\n⚠️ No cambies la contraseña ni el perfil. Si tenés algún problema, escribinos!`,
        });
    } catch (error: any) {
        console.error('[API Sell Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
