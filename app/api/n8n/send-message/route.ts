import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText, isPhoneWhitelisted } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/n8n/send-message
 *
 * Called by N8N to send a WhatsApp message to a customer.
 * Respects the whitelist for testing mode.
 *
 * Body: {
 *   phone: string,
 *   message: string,
 *   instance_name?: string,
 *   customer_id?: string,
 *   template_key?: string,
 *   conversation_id?: string,
 *   intent?: string,         // detected intent for logging
 *   needs_human?: boolean,   // if AI couldn't handle it
 * }
 */
export async function POST(request: NextRequest) {
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            phone,
            message,
            instance_name,
            customer_id,
            template_key,
            intent,
            needs_human,
        } = body;

        if (!phone || !message) {
            return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 });
        }

        const normalizedPhone = normalizePhone(phone);

        // Respect whitelist
        if (!isPhoneWhitelisted(normalizedPhone)) {
            console.log(`[N8N Send] Skipping ${normalizedPhone} — not in whitelist`);
            return NextResponse.json({ success: false, skipped: true, reason: 'not_whitelisted' });
        }

        // Send WhatsApp message
        const result = await sendText(normalizedPhone, message, {
            instanceName: instance_name,
            customerId: customer_id,
            templateKey: template_key || 'n8n_ai_response',
        });

        // Update conversation session
        try {
            await (supabase as any)
                .from('whatsapp_conversations')
                .upsert({
                    phone: normalizedPhone,
                    last_message_at: new Date().toISOString(),
                    ai_handled: true,
                    needs_human: needs_human || false,
                    status: needs_human ? 'escalated' : 'active',
                    customer_id: customer_id || null,
                    metadata: { last_intent: intent || null },
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'phone' });
        } catch {
            // Non-fatal
        }

        return NextResponse.json({ success: result.success, error: result.error });

    } catch (error: any) {
        console.error('[N8N Send Message] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
