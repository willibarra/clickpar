import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/n8n/incoming-message
 *
 * Receives incoming WhatsApp messages from Evolution API webhooks.
 * Stores the conversation state and forwards to N8N for AI processing.
 *
 * Evolution API sends this when a message arrives on any connected instance.
 *
 * IMPORTANT: Configure this URL in Evolution API:
 *   Settings → Webhooks → Global Webhook URL = https://[domain]/api/n8n/incoming-message
 *   Or per-instance: POST /instance/setWebhook/:instance
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Evolution API webhook payload structure
        const event = body.event as string;
        const instanceName = body.instance as string;
        const data = body.data;

        // Only process incoming text messages (ignore our own outgoing messages)
        if (event !== 'messages.upsert') {
            return NextResponse.json({ received: true, skipped: true });
        }

        const message = data?.messages?.[0] || data?.message;
        if (!message) {
            return NextResponse.json({ received: true, skipped: true });
        }

        // Skip if it's from us (fromMe = true)
        if (message.key?.fromMe === true) {
            return NextResponse.json({ received: true, skipped: 'outgoing' });
        }

        const rawJid = message.key?.remoteJid as string | undefined;
        if (!rawJid || rawJid.includes('@g.us')) {
            // Skip group messages
            return NextResponse.json({ received: true, skipped: 'group_or_no_jid' });
        }

        // Extract phone from JID (e.g. "595973442773@s.whatsapp.net" → "595973442773")
        const rawPhone = rawJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const phone = normalizePhone(rawPhone);

        // Extract message text
        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.buttonsResponseMessage?.selectedDisplayText ||
            message.message?.listResponseMessage?.title ||
            '[sin texto]';

        const messageId = message.key?.id;
        const timestamp = message.messageTimestamp
            ? new Date(Number(message.messageTimestamp) * 1000).toISOString()
            : new Date().toISOString();

        // Log the incoming message to DB for context
        try {
            await (supabase as any)
                .from('whatsapp_incoming_log')
                .insert({
                    message_id: messageId,
                    phone,
                    raw_jid: rawJid,
                    instance_name: instanceName,
                    text,
                    raw_payload: body,
                    received_at: timestamp,
                });
        } catch {
            // Table may not exist yet — non-fatal
        }

        // Forward to N8N for AI processing
        const n8nIncomingUrl = process.env.N8N_INCOMING_WEBHOOK_URL;

        if (!n8nIncomingUrl) {
            console.warn('[Incoming] N8N_INCOMING_WEBHOOK_URL not set — message logged but not forwarded');
            return NextResponse.json({ received: true, forwarded: false });
        }

        try {
            const n8nRes = await fetch(n8nIncomingUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    text,
                    instance_name: instanceName,
                    message_id: messageId,
                    timestamp,
                }),
                signal: AbortSignal.timeout(8000),
            });

            if (!n8nRes.ok) {
                console.error('[Incoming] N8N webhook returned:', n8nRes.status);
            }
        } catch (err: any) {
            console.error('[Incoming] Failed to forward to N8N:', err.message);
        }

        return NextResponse.json({ received: true, forwarded: true, phone });

    } catch (error: any) {
        console.error('[Incoming Message] Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
