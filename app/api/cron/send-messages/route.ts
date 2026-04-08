import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    formatDate,
    todayMidnight,
    MessageQueueRow,
} from '@/lib/queue-helpers';
import { sendText } from '@/lib/whatsapp';
import { checkHourlyLimit, createBatchController } from '@/lib/rate-limiter';
export const dynamic = 'force-dynamic';


/**
 * POST /api/cron/send-messages
 *
 * Phase 3 of the message queue pipeline.
 * Reads composed messages and sends them via WhatsApp or Kommo.
 *
 * Anti-ban protections:
 * - Batches of 10 messages with 5-minute pauses between batches
 * - Sequential sending within each batch (sendText applies 8-25s random delay)
 * - Hourly rate limit check (30 msgs/hour) before each batch
 * - Automatic retries up to max_retries
 */
export async function POST(request: NextRequest) {
    const authError = verifyCronSecret(request);
    if (authError) return authError;

    const supabase = getQueueSupabase();
    const todayStr = formatDate(todayMidnight());

    // Fetch composed messages that haven't exceeded max retries and are due
    const { data: composedRows, error: fetchErr } = await supabase
        .from('message_queue' as any)
        .select('*')
        .eq('status', 'composed')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(50);

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const messages = (composedRows || []).filter(
        (m: any) => m.retry_count < m.max_retries
    ) as MessageQueueRow[];

    const results = {
        sent: 0,
        failed: 0,
        retrying: 0,
        rate_limited: 0,
        errors: [] as string[],
    };

    const batchCtrl = createBatchController();

    // Process messages sequentially with batch control
    // sendText() handles per-message random delay (8-25s)
    // batchCtrl handles batch pauses (5 min every 10 messages)
    for (const msg of messages) {
        // Check hourly rate limit before each message
        const hourlyCheck = await checkHourlyLimit();
        if (!hourlyCheck.allowed) {
            console.warn(
                `[SendMessages] Hourly rate limit reached (${hourlyCheck.sent}/${hourlyCheck.limit}). ` +
                `Stopping pipeline. ${results.sent} sent so far.`
            );
            results.rate_limited = messages.length - results.sent - results.failed - results.retrying;
            break;
        }

        // Batch pause (5 min every 10 messages)
        await batchCtrl.beforeSend();

        try {
            const result = await sendSingleMessage(msg, supabase);
            if (result.success) {
                results.sent++;
            } else if (result.retrying) {
                results.retrying++;
            } else {
                results.failed++;
            }
        } catch (e: any) {
            results.failed++;
            results.errors.push(`send-error: ${e.message}`);
        }
    }

    // Log summary
    if (results.sent > 0 || results.failed > 0) {
        const rateLimitNote = results.rate_limited > 0
            ? ` | ${results.rate_limited} ⏸️ (rate limited)`
            : '';
        await supabase.from('notifications' as any).insert({
            type: 'send_messages',
            message: `📬 Mensajes enviados: ${results.sent} ✅ | ${results.failed} ❌ | ${results.retrying} 🔄${rateLimitNote}`,
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

    // sendText now handles anti-ban delay internally (8-25s random delay)
    const result = await sendText(msg.phone, msg.message_body, {
        instanceName: msg.instance_name || undefined,
        templateKey: msg.template_key || undefined,
        customerId: msg.customer_id || undefined,
        saleId: msg.sale_id || undefined,
        triggeredBy: msg.idempotency_key?.startsWith('manual:') ? 'manual' : 'auto',
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

    // If rate limited, don't count as failure — reset to composed for next run
    if (result.error?.includes('Rate limit exceeded')) {
        await supabase
            .from('message_queue' as any)
            .update({ status: 'composed', error: result.error })
            .eq('id', msg.id);
        return { success: false, retrying: true };
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



