import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    formatDate,
    todayMidnight,
    MessageQueueRow,
} from '@/lib/queue-helpers';
import { sendText } from '@/lib/whatsapp';
import { createVentaLead, addNoteToLead, refreshKommoToken } from '@/lib/kommo';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;

/**
 * POST /api/cron/send-messages
 *
 * Phase 3 of the message queue pipeline.
 * Reads composed messages and sends them via WhatsApp or Kommo.
 * Processes in batches of 5 with 2 second delays between batches.
 * Automatic retries up to max_retries.
 */
export async function POST(request: NextRequest) {
    const authError = verifyCronSecret(request);
    if (authError) return authError;

    const supabase = getQueueSupabase();
    const todayStr = formatDate(todayMidnight());

    // Auto-refresh Kommo token if needed
    await ensureFreshKommoToken(supabase);

    // Fetch composed messages that haven't exceeded max retries
    const { data: composedRows, error: fetchErr } = await supabase
        .from('message_queue' as any)
        .select('*')
        .eq('status', 'composed')
        .order('scheduled_at', { ascending: true })
        .limit(50);

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const messages = (composedRows || []).filter(
        (m: any) => m.retry_count < m.max_retries
    ) as MessageQueueRow[];

    const results = { sent: 0, failed: 0, retrying: 0, errors: [] as string[] };

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        if (i > 0) {
            // Delay between batches
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }

        const batch = messages.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(
            batch.map(msg => sendSingleMessage(msg, supabase))
        );

        for (let j = 0; j < settled.length; j++) {
            const result = settled[j];
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    results.sent++;
                } else if (result.value.retrying) {
                    results.retrying++;
                } else {
                    results.failed++;
                }
            } else {
                results.failed++;
                results.errors.push(`batch-error: ${result.reason}`);
            }
        }
    }

    // Log summary
    if (results.sent > 0 || results.failed > 0) {
        await supabase.from('notifications' as any).insert({
            type: 'send_messages',
            message: `📬 Mensajes enviados: ${results.sent} ✅ | ${results.failed} ❌ | ${results.retrying} 🔄`,
            is_read: false,
        });
    }

    return NextResponse.json({
        success: true,
        date: todayStr,
        processed: messages.length,
        results,
    });
}

// =============================================
// Send single message
// =============================================

async function sendSingleMessage(
    msg: MessageQueueRow,
    supabase: ReturnType<typeof getQueueSupabase>,
): Promise<{ success: boolean; retrying: boolean }> {
    // Mark as sending
    await supabase
        .from('message_queue' as any)
        .update({ status: 'sending' })
        .eq('id', msg.id);

    try {
        if (msg.channel === 'whatsapp') {
            return await sendWhatsApp(msg, supabase);
        } else if (msg.channel === 'kommo') {
            return await sendKommo(msg, supabase);
        }

        // Unknown channel
        await supabase
            .from('message_queue' as any)
            .update({ status: 'failed', error: `Unknown channel: ${msg.channel}` })
            .eq('id', msg.id);
        return { success: false, retrying: false };
    } catch (e: any) {
        return await handleFailure(msg, supabase, e.message);
    }
}

// =============================================
// WhatsApp sender
// =============================================

async function sendWhatsApp(
    msg: MessageQueueRow,
    supabase: ReturnType<typeof getQueueSupabase>,
): Promise<{ success: boolean; retrying: boolean }> {
    if (!msg.phone || !msg.message_body) {
        await supabase
            .from('message_queue' as any)
            .update({ status: 'failed', error: 'Missing phone or message body' })
            .eq('id', msg.id);
        return { success: false, retrying: false };
    }

    const result = await sendText(msg.phone, msg.message_body, {
        instanceName: msg.instance_name || undefined,
        templateKey: msg.template_key || undefined,
        customerId: msg.customer_id || undefined,
        saleId: msg.sale_id || undefined,
    });

    if (result.success) {
        await supabase
            .from('message_queue' as any)
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                error: null,
            })
            .eq('id', msg.id);
        return { success: true, retrying: false };
    }

    return await handleFailure(msg, supabase, result.error || 'WhatsApp send failed');
}

// =============================================
// Kommo sender
// =============================================

async function sendKommo(
    msg: MessageQueueRow,
    supabase: ReturnType<typeof getQueueSupabase>,
): Promise<{ success: boolean; retrying: boolean }> {
    if (!msg.phone || !msg.message_body) {
        await supabase
            .from('message_queue' as any)
            .update({ status: 'failed', error: 'Missing phone or message body' })
            .eq('id', msg.id);
        return { success: false, retrying: false };
    }

    const lead = await createVentaLead({
        platform: 'Renovación',
        customerPhone: msg.phone,
        customerName: msg.customer_name || 'Cliente',
        price: 0,
        statusKey: 'INCOMING',
    });

    if (lead.leadId) {
        await addNoteToLead(lead.leadId, msg.message_body);
        await supabase
            .from('message_queue' as any)
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                error: null,
            })
            .eq('id', msg.id);
        return { success: true, retrying: false };
    }

    return await handleFailure(msg, supabase, lead.error || 'Kommo lead creation failed');
}

// =============================================
// Retry handling
// =============================================

async function handleFailure(
    msg: MessageQueueRow,
    supabase: ReturnType<typeof getQueueSupabase>,
    errorMessage: string,
): Promise<{ success: boolean; retrying: boolean }> {
    const newRetryCount = msg.retry_count + 1;
    const maxed = newRetryCount >= msg.max_retries;

    await supabase
        .from('message_queue' as any)
        .update({
            status: maxed ? 'failed' : 'composed', // keep composed for retry
            retry_count: newRetryCount,
            error: errorMessage,
        })
        .eq('id', msg.id);

    return { success: false, retrying: !maxed };
}

// =============================================
// Kommo token helper
// =============================================

async function ensureFreshKommoToken(supabase: ReturnType<typeof getQueueSupabase>) {
    try {
        const token = process.env.KOMMO_ACCESS_TOKEN;
        if (token) {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const expiresAt = payload.exp * 1000;
            if (expiresAt - Date.now() > 2 * 60 * 60 * 1000) return;
        }

        console.log('[Send] Kommo token expiring soon, refreshing...');
        const newTokens = await refreshKommoToken();
        if (newTokens) {
            process.env.KOMMO_ACCESS_TOKEN = newTokens.access_token;
            process.env.KOMMO_REFRESH_TOKEN = newTokens.refresh_token;
            await supabase.from('kommo_tokens' as any).upsert({
                id: 'default',
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
    } catch (e) {
        console.error('[Send] Kommo token refresh failed:', e);
    }
}
