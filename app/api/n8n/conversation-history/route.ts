import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';



const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/n8n/conversation-history
 *
 * Called by N8N to retrieve the last N messages from a customer's phone number.
 * Used to give context to the AI before generating a response.
 *
 * Body: { phone: string, limit?: number }
 * Returns: { messages: Array<{ text, role, received_at }> }
 */
export async function POST(request: NextRequest) {
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const rawPhone = body.phone as string | undefined;
        const limit = Math.min(parseInt(body.limit || '10'), 30); // max 30 messages

        if (!rawPhone) {
            return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
        }

        const phone = normalizePhone(rawPhone);

        // Get last N incoming messages from this customer
        const { data: incoming } = await (supabase as any)
            .from('whatsapp_incoming_log')
            .select('text, received_at, n8n_handled, instance_name')
            .eq('phone', phone)
            .order('received_at', { ascending: false })
            .limit(limit);

        // Get last N outgoing messages to this customer (our responses)
        const { data: outgoing } = await (supabase as any)
            .from('whatsapp_send_log')
            .select('message, created_at, template_key, instance_used')
            .eq('phone', phone)
            .order('created_at', { ascending: false })
            .limit(limit);

        // Merge and sort by time ascending (oldest first for AI context)
        const messages = [
            ...(incoming || []).map((m: any) => ({
                role: 'user',
                text: m.text,
                timestamp: m.received_at,
            })),
            ...(outgoing || []).map((m: any) => ({
                role: 'assistant',
                text: m.message,
                timestamp: m.created_at,
                template: m.template_key,
            })),
        ]
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .slice(-limit); // take the most recent N combined

        return NextResponse.json({
            phone,
            message_count: messages.length,
            messages,
        });

    } catch (error: any) {
        console.error('[N8N Conversation History] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
