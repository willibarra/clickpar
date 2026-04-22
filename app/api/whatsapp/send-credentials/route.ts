// @ts-nocheck — new tables (conversations, conversation_messages) not yet in Supabase types
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSaleCredentials } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/send-credentials
 *
 * Sends sale credentials via WhatsApp when a sale is confirmed.
 * Called from the sales panel after assigning a slot to a customer.
 *
 * Body: { saleId }
 */
export async function POST(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const { saleId } = await request.json();
        if (!saleId) return NextResponse.json({ error: 'saleId required' }, { status: 400 });

        // Fetch sale with all needed info
        const { data: sale, error } = await supabase
            .from('sales')
            .select(`
                id,
                amount_gs,
                end_date,
                is_active,
                customer_id,
                slot_id,
                customers:customer_id (
                    id,
                    full_name,
                    phone,
                    whatsapp_instance
                ),
                sale_slots:slot_id (
                    id,
                    slot_identifier,
                    pin_code,
                    status,
                    mother_accounts:mother_account_id (
                        id,
                        platform,
                        email,
                        password
                    )
                )
            `)
            .eq('id', saleId)
            .single();

        if (error || !sale) {
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        const customer = (sale as any).customers;
        const slot = (sale as any).sale_slots;
        const account = slot?.mother_accounts;

        if (!customer?.phone) {
            return NextResponse.json({ error: 'El cliente no tiene número de WhatsApp registrado' }, { status: 400 });
        }

        if (!account?.email || !account?.password) {
            return NextResponse.json({ error: 'La cuenta no tiene credenciales configuradas' }, { status: 400 });
        }

        const result = await sendSaleCredentials({
            customerPhone: customer.phone,
            customerName: customer.full_name || 'Cliente',
            platform: account.platform,
            email: account.email,
            password: account.password,
            profile: slot?.slot_identifier || 'Tu perfil',
            pin: slot?.pin_code || undefined,
            expirationDate: (sale as any).end_date || '',
            customerId: customer.id,
            saleId: saleId,
            instanceName: customer.whatsapp_instance || undefined,
            triggeredBy: 'manual',
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'No se pudo enviar el mensaje' }, { status: 500 });
        }

        // Also log a message in the conversation thread (if one exists)
        try {
            const { data: conv } = await (supabase
                .from('conversations' as any) as any)
                .select('id')
                .eq('customer_id', customer.id)
                .in('status', ['open', 'waiting', 'resolved'])
                .order('last_message_at', { ascending: false })
                .limit(1)
                .single();

            if (conv) {
                await supabase.from('conversation_messages' as any).insert({
                    conversation_id: conv.id,
                    direction: 'outbound',
                    sender: 'bot',
                    sender_name: 'ClickPar Auto',
                    message: `📦 Credenciales enviadas automáticamente al confirmar la venta #${saleId.slice(0, 8).toUpperCase()}`,
                    wa_status: 'sent',
                    is_automated: true,
                    template_key: 'venta_credenciales',
                });
                await (supabase
                    .from('conversations' as any) as any)
                    .update({ last_message_at: new Date().toISOString(), status: 'open' })
                    .eq('id', conv.id);
            }
        } catch { /* non-fatal */ }

        return NextResponse.json({
            success: true,
            instanceUsed: result.instanceUsed,
            messageId: result.messageId,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
