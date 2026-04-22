// @ts-nocheck — new tables (conversations, conversation_messages) not yet in Supabase types
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/webhook
 *
 * Receives incoming WhatsApp events from Evolution API.
 * Handles inbound messages and delivery status updates.
 *
 * Configure in Evolution API dashboard:
 * Webhook URL: https://clickpar.shop/api/whatsapp/webhook
 * Events: MESSAGES_UPSERT, MESSAGES_UPDATE
 */

const KEYWORDS_AUTORESPONSE: { pattern: RegExp; response: string; createTicket?: string }[] = [
    {
        pattern: /\b(renovar|renewal|renew|renovacion|renovación)\b/i,
        response: '💳 *Renovación de servicio*\n\nGracias por escribirnos. En breve un asesor te confirma el precio y método de pago.\n\n⏰ Horario de atención: Lun-Sáb 9:00 - 18:00',
    },
    {
        pattern: /\b(no (me )?(conecta|funciona|carga|anda)|no (puedo|podemos)|error|caído|caido)\b/i,
        response: '🔧 *Soporte técnico*\n\nRecibimos tu reporte. Estamos revisando el problema y te respondemos a la brevedad.\n\nSi es urgente, por favor indicanos qué servicio no funciona.',
        createTicket: 'no_conecta',
    },
    {
        pattern: /\b(gracias|perfecto|ok|listo|confirmado|dale)\b/i,
        response: '😊 ¡Con gusto! Si necesitás algo más, escribinos.',
    },
];

const BUSINESS_HOURS = { start: 9, end: 18 }; // Paraguay time (UTC-4)

function isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getUTCHours() - 4; // UTC-4 Paraguay
    const adjustedHour = (hour + 24) % 24;
    return adjustedHour >= BUSINESS_HOURS.start && adjustedHour < BUSINESS_HOURS.end;
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();

        // Evolution API sends different event types
        const event = payload.event || payload.type;
        const instance = payload.instance;

        // Handle message delivery status updates
        if (event === 'MESSAGES_UPDATE') {
            await handleStatusUpdate(payload);
            return NextResponse.json({ ok: true });
        }

        // Handle new incoming messages
        if (event === 'MESSAGES_UPSERT') {
            const messages = Array.isArray(payload.data?.messages)
                ? payload.data.messages
                : [payload.data];

            for (const msg of messages) {
                await processInboundMessage(msg, instance);
            }
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ ok: true, skipped: event });
    } catch (error: any) {
        console.error('[WA Webhook] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// =============================================
// Process a single inbound message
// =============================================

async function processInboundMessage(msg: any, instance: string) {
    // Ignore messages from us (outbound)
    if (msg.key?.fromMe) return;

    const phone = extractPhone(msg.key?.remoteJid || '');
    if (!phone) return;

    // Ignore group messages
    if (msg.key?.remoteJid?.includes('@g.us')) return;

    const text = extractText(msg.message);
    if (!text) return;

    const waMessageId = msg.key?.id;
    const supabase = await createAdminClient();

    // 1. Find customer by phone
    const { data: customer } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .or(`phone.eq.${phone},phone.eq.+${phone}`)
        .single();

    // 2. Find or create conversation
    let conversation: any;
    if (customer) {
        const { data: existingRaw } = await supabase
            .from('conversations' as any)
            .select('*')
            .eq('customer_id', customer.id)
            .in('status', ['open', 'waiting'])
            .order('last_message_at', { ascending: false })
            .limit(1)
            .single();

        if (existing) {
            conversation = existing;
            // Update last message info
            await supabase
                .from('conversations' as any)
                .update({
                    last_message_at: new Date().toISOString(),
                    last_message_preview: text.slice(0, 100),
                    unread_count: (existing.unread_count || 0) + 1,
                    status: 'open',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            // Create new conversation
            const { data: newConvRaw } = await supabase
                .from('conversations' as any)
                .insert({
                    customer_id: customer.id,
                    status: 'open',
                    channel: 'whatsapp',
                    wa_phone: phone,
                    last_message_at: new Date().toISOString(),
                    last_message_preview: text.slice(0, 100),
                    unread_count: 1,
                })
                .select()
                .single();
            conversation = newConv;
        }
    } else {
        // Unknown customer — create conversation with just the phone
        const { data: existingRaw } = await supabase
            .from('conversations' as any)
            .select('*')
            .eq('wa_phone', phone)
            .in('status', ['open', 'waiting'])
            .order('last_message_at', { ascending: false })
            .limit(1)
            .single();

        if (existing) {
            conversation = existing;
            await supabase
                .from('conversations' as any)
                .update({
                    last_message_at: new Date().toISOString(),
                    last_message_preview: text.slice(0, 100),
                    unread_count: (existing.unread_count || 0) + 1,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            const { data: newConvRaw } = await supabase
                .from('conversations' as any)
                .insert({
                    status: 'open',
                    channel: 'whatsapp',
                    wa_phone: phone,
                    last_message_at: new Date().toISOString(),
                    last_message_preview: text.slice(0, 100),
                    unread_count: 1,
                })
                .select()
                .single();
            conversation = newConv;
        }
    }

    if (!conversation) return;

    // 3. Save the inbound message
    await supabase.from('conversation_messages' as any).insert({
        conversation_id: conversation.id,
        direction: 'inbound',
        sender: 'customer',
        sender_name: customer?.full_name || phone,
        message: text,
        wa_message_id: waMessageId,
        wa_status: 'received',
    });

    // 4. Notify staff (internal notification)
    await supabase.from('notifications' as any).insert({
        type: 'new_message',
        message: `💬 Nuevo mensaje de ${customer?.full_name || phone}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`,
        is_read: false,
    });

    // 5. Auto-response logic
    await handleAutoResponse(phone, text, conversation.id, instance, customer, supabase);
}

// =============================================
// Auto-response logic
// =============================================

async function handleAutoResponse(
    phone: string,
    text: string,
    conversationId: string,
    instance: string,
    customer: any,
    supabase: any,
) {
    // Check keywords first
    for (const kw of KEYWORDS_AUTORESPONSE) {
        if (kw.pattern.test(text)) {
            await sendAutoReply(phone, kw.response, conversationId, instance, supabase);

            // Create ticket if needed
            if (kw.createTicket && customer?.id) {
                await supabase.from('tickets').insert({
                    customer_id: customer.id,
                    tipo: kw.createTicket,
                    estado: 'abierto',
                    descripcion: text,
                    canal_origen: 'whatsapp',
                }).catch(() => {}); // Don't fail if tickets table is different
            }
            return;
        }
    }

    // Outside business hours auto-response (only once per conversation per day)
    if (!isBusinessHours()) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: alreadySentOOHRaw } = await supabase
            .from('conversation_messages' as any)
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('direction', 'outbound')
            .eq('sender', 'bot')
            .gte('created_at', startOfDay.toISOString())
            .limit(1);

        if (!alreadySentOOH?.length) {
            const oohMessage = `🕐 *Fuera de horario*\n\nGracias por escribirnos. Nuestro horario de atención es:\n\n📅 Lunes a Sábado: 9:00 - 18:00 hs\n\nTu mensaje fue recibido y te responderemos en el próximo horario disponible. ¡Gracias por tu paciencia!`;
            await sendAutoReply(phone, oohMessage, conversationId, instance, supabase);
        }
    }
}

// =============================================
// Send auto-reply via WhatsApp + save to conversation
// =============================================

async function sendAutoReply(
    phone: string,
    message: string,
    conversationId: string,
    instance: string,
    supabase: any,
) {
    try {
        const { sendText } = await import('@/lib/whatsapp');
        const result = await sendText(phone, message, {
            instanceName: instance,
            templateKey: 'auto_response',
            skipRateLimiting: true,
        });

        if (result.success) {
            await supabase.from('conversation_messages' as any).insert({
                conversation_id: conversationId,
                direction: 'outbound',
                sender: 'bot',
                sender_name: 'ClickPar Auto',
                message,
                wa_status: 'sent',
                is_automated: true,
            });

            // Update conversation preview
            await supabase
                .from('conversations' as any)
                .update({
                    last_message_at: new Date().toISOString(),
                    last_message_preview: `🤖 ${message.slice(0, 80)}`,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId);
        }
    } catch (e) {
        console.error('[WA Webhook] Auto-reply error:', e);
    }
}

// =============================================
// Handle delivery status updates
// =============================================

async function handleStatusUpdate(payload: any) {
    const updates = payload.data?.messages || [];
    if (!updates.length) return;

    const supabase = await createAdminClient();
    for (const upd of updates) {
        const waId = upd.key?.id;
        const status = upd.update?.status?.toLowerCase(); // DELIVERY_ACK, READ, etc.
        if (!waId || !status) continue;

        const mappedStatus = status.includes('read') ? 'read'
            : status.includes('delivery') ? 'delivered'
            : status.includes('fail') ? 'failed'
            : 'sent';

        await supabase
            .from('conversation_messages' as any)
            .update({ wa_status: mappedStatus })
            .eq('wa_message_id', waId);
    }
}

// =============================================
// Helpers
// =============================================

function extractPhone(jid: string): string {
    // Evolution API format: "595XXXXXXXXX@s.whatsapp.net"
    return jid.split('@')[0].replace(/\D/g, '');
}

function extractText(message: any): string | null {
    if (!message) return null;
    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        null
    );
}
