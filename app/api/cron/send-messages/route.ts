import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    formatDate,
    todayMidnight,
    MessageQueueRow,
} from '@/lib/queue-helpers';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';


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
        }

        // Canal kommo desactivado: marcar como skipped
        if (msg.channel === 'kommo') {
            await supabase
                .from('message_queue' as any)
                .update({ status: 'skipped', error: 'Kommo desactivado temporalmente' })
                .eq('id', msg.id);
            return { success: false, retrying: false };
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
            status: maxed ? 'failed' : 'composed',
            retry_count: newRetryCount,
            error: errorMessage,
        })
        .eq('id', msg.id);

    return { success: false, retrying: !maxed };
}



