import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    formatDate,
    todayMidnight,
    MessageQueueRow,
} from '@/lib/queue-helpers';
import { sendText, getWhatsAppSettings } from '@/lib/whatsapp';
import { checkHourlyLimit, checkDailyLimit, createBatchController, waitPairGap, waitInterPairGap } from '@/lib/rate-limiter';
export const dynamic = 'force-dynamic';


/**
 * POST /api/cron/send-messages
 *
 * Phase 3 of the message queue pipeline.
 * Reads composed messages and sends them via WhatsApp.
 *
 * PAIRED SENDING STRATEGY:
 * Messages are sorted into two groups by instance (WA-1 and WA-2).
 * For each "pair": WA-1 sends → 5-10s → WA-2 sends → 35-45s → next pair.
 * After every 4 pairs (8 messages) → 5-7 min random pause.
 *
 * Safety:
 * - Hourly rate limit check (30 msgs/hour) before each pair
 * - Daily rate limit (80 msgs/day) checked at start
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
        .limit(200);

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const allMessages = (composedRows || []).filter(
        (m: any) => m.retry_count < m.max_retries
    ) as MessageQueueRow[];

    const results = {
        sent: 0,
        failed: 0,
        retrying: 0,
        rate_limited: 0,
        errors: [] as string[],
    };

    // Check daily rate limit before processing any messages
    const dailyCheck = await checkDailyLimit();
    if (!dailyCheck.allowed) {
        console.warn(
            `[SendMessages] Daily limit reached (${dailyCheck.sent}/${dailyCheck.limit}). ` +
            `Skipping entire batch. Messages will be retried tomorrow.`
        );
        await supabase.from('notifications' as any).insert({
            type: 'send_messages',
            message: `⏸️ Límite diario alcanzado: ${dailyCheck.sent}/${dailyCheck.limit} mensajes hoy. Los pendientes se enviarán mañana.`,
            is_read: false,
        });
        return NextResponse.json({
            success: true,
            date: todayStr,
            processed: 0,
            results: { ...results, rate_limited: allMessages.length },
            daily_limit_reached: true,
        });
    }

    // ── PAIRED SENDING: Sort messages into two instance groups ──
    const settings = await getWhatsAppSettings();
    const inst1 = settings.instance_1_name;
    const inst2 = settings.instance_2_name;

    const group1: MessageQueueRow[] = [];
    const group2: MessageQueueRow[] = [];

    for (const msg of allMessages) {
        if (msg.instance_name === inst2) {
            group2.push(msg);
        } else {
            // Default to instance 1 if no instance assigned or unknown
            group1.push(msg);
        }
    }

    console.log(`[SendMessages] Paired sending: ${inst1}=${group1.length}, ${inst2}=${group2.length}`);

    // Build interleaved pairs: [g1[0], g2[0]], [g1[1], g2[1]], ...
    // If one group is larger, the remaining messages become "solo" sends
    const maxPairs = Math.max(group1.length, group2.length);
    const batchCtrl = createBatchController();

    for (let i = 0; i < maxPairs; i++) {
        // Check hourly rate limit before each pair
        const hourlyCheck = await checkHourlyLimit();
        if (!hourlyCheck.allowed) {
            const remaining = (maxPairs - i) * 2;
            console.warn(
                `[SendMessages] Hourly rate limit reached (${hourlyCheck.sent}/${hourlyCheck.limit}). ` +
                `Stopping. ${results.sent} sent so far, ~${remaining} remaining.`
            );
            results.rate_limited = allMessages.length - results.sent - results.failed - results.retrying;
            break;
        }

        // ── Send message from instance 1 (if available) ──
        if (i < group1.length) {
            try {
                const r = await sendSingleMessage(group1[i], supabase);
                if (r.success) results.sent++;
                else if (r.retrying) results.retrying++;
                else results.failed++;
            } catch (e: any) {
                results.failed++;
                results.errors.push(`send-error: ${e.message}`);
            }
        }

        // ── Short gap (5-10 seconds) ──
        if (i < group1.length && i < group2.length) {
            await waitPairGap();
        }

        // ── Send message from instance 2 (if available) ──
        if (i < group2.length) {
            try {
                const r = await sendSingleMessage(group2[i], supabase);
                if (r.success) results.sent++;
                else if (r.retrying) results.retrying++;
                else results.failed++;
            } catch (e: any) {
                results.failed++;
                results.errors.push(`send-error: ${e.message}`);
            }
        }

        // ── Batch pause after every 4 pairs (8 messages) — 5-7 min random ──
        await batchCtrl.afterPair();

        // ── Long gap between pairs (35-45 seconds) ──
        // Skip if this was the last pair or if batch pause already happened
        if (i < maxPairs - 1) {
            await waitInterPairGap();
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
        processed: allMessages.length,
        pairedSending: { [inst1]: group1.length, [inst2]: group2.length },
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

    // sendText — delay is handled at the pair level now, so skip internal delay
    const result = await sendText(msg.phone, msg.message_body, {
        instanceName: msg.instance_name || undefined,
        templateKey: msg.template_key || undefined,
        customerId: msg.customer_id || undefined,
        saleId: msg.sale_id || undefined,
        triggeredBy: msg.idempotency_key?.startsWith('manual:') ? 'manual' : 'auto',
        skipRateLimiting: true, // Delays are handled at the pair level in this pipeline
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
