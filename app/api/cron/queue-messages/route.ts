import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    formatDate,
    addDays,
    todayMidnight,
    makeIdempotencyKey,
    MessageType,
} from '@/lib/queue-helpers';
import { getPlatformDisplayName } from '@/lib/whatsapp';

/**
 * POST /api/cron/queue-messages
 *
 * Phase 1 of the message queue pipeline.
 * Reads expiring sales and inserts rows into message_queue.
 * Also handles auto-cancellation for 2-day-old expired sales.
 * Target: < 5 seconds.
 */
export async function POST(request: NextRequest) {
    const authError = verifyCronSecret(request);
    if (authError) return authError;

    const supabase = getQueueSupabase();
    const today = todayMidnight();
    const todayStr = formatDate(today);
    const tomorrowStr = formatDate(addDays(today, 1));
    const yesterdayStr = formatDate(addDays(today, -1));
    const twoDaysAgoStr = formatDate(addDays(today, -2));

    const results = {
        queued: 0,
        skipped_no_phone: 0,
        cancelled: 0,
        errors: [] as string[],
    };

    // Define date ranges and their message types
    const dateRanges: { dateStr: string; filterDate: string; type: MessageType; templateKey: string }[] = [
        { dateStr: tomorrowStr, filterDate: tomorrowStr, type: 'pre_expiry', templateKey: 'pre_vencimiento' },
        { dateStr: todayStr, filterDate: todayStr, type: 'expiry_today', templateKey: 'vencimiento_hoy' },
        { dateStr: yesterdayStr, filterDate: yesterdayStr, type: 'expired_yesterday', templateKey: 'vencimiento_vencido' },
        { dateStr: twoDaysAgoStr, filterDate: twoDaysAgoStr, type: 'cancelled', templateKey: '' },
    ];

    for (const range of dateRanges) {
        try {
            const { data: sales } = await supabase
                .from('sales' as any)
                .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone, whatsapp_instance), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, id))')
                .eq('is_active', true)
                .eq('end_date', range.filterDate);

            for (const sale of (sales || []) as any[]) {
                const customer = sale.customers;
                const slot = sale.sale_slots;
                const platform = slot?.mother_accounts?.platform || 'Servicio';
                const displayPlatform = await getPlatformDisplayName(platform);
                const phone = customer?.phone;
                const name = customer?.full_name || 'Cliente';

                // ---- Auto-cancel for 2-day-ago ----
                if (range.type === 'cancelled') {
                    // Deactivate the sale
                    await supabase
                        .from('sales' as any)
                        .update({ is_active: false })
                        .eq('id', sale.id);

                    // Free up the slot
                    if (sale.slot_id) {
                        await supabase
                            .from('sale_slots')
                            .update({ status: 'available' })
                            .eq('id', sale.slot_id);
                    }

                    results.cancelled++;
                }

                if (!phone) {
                    results.skipped_no_phone++;
                    continue;
                }

                const price = (sale.amount_gs || 0).toLocaleString();
                const instanceName = customer?.whatsapp_instance || null;

                // Queue WhatsApp message
                const waKey = makeIdempotencyKey(sale.id, range.type, 'whatsapp', todayStr);
                const { error: waErr } = await supabase
                    .from('message_queue' as any)
                    .upsert({
                        customer_id: sale.customer_id,
                        sale_id: sale.id,
                        message_type: range.type,
                        channel: 'whatsapp',
                        phone,
                        customer_name: name,
                        platform: displayPlatform,
                        template_key: range.templateKey || null,
                        status: 'pending',
                        instance_name: instanceName,
                        scheduled_at: new Date().toISOString(),
                        retry_count: 0,
                        max_retries: 3,
                        idempotency_key: waKey,
                    }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

                if (waErr) {
                    results.errors.push(`wa-queue: ${name} - ${waErr.message}`);
                } else {
                    results.queued++;
                }

                // Queue Kommo message
                const kommoKey = makeIdempotencyKey(sale.id, range.type, 'kommo', todayStr);
                const { error: kommoErr } = await supabase
                    .from('message_queue' as any)
                    .upsert({
                        customer_id: sale.customer_id,
                        sale_id: sale.id,
                        message_type: range.type,
                        channel: 'kommo',
                        phone,
                        customer_name: name,
                        platform: displayPlatform,
                        template_key: null,
                        status: 'pending',
                        instance_name: null,
                        scheduled_at: new Date().toISOString(),
                        retry_count: 0,
                        max_retries: 3,
                        idempotency_key: kommoKey,
                    }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

                if (kommoErr) {
                    results.errors.push(`kommo-queue: ${name} - ${kommoErr.message}`);
                } else {
                    results.queued++;
                }
            }
        } catch (e: any) {
            results.errors.push(`range-${range.type}: ${e.message}`);
        }
    }

    // Log summary as internal notification
    if (results.queued > 0 || results.cancelled > 0) {
        await supabase.from('notifications' as any).insert({
            type: 'queue_messages',
            message: `📋 Cola de mensajes: ${results.queued} encolados, ${results.cancelled} cancelados, ${results.skipped_no_phone} sin teléfono`,
            is_read: false,
        });
    }

    return NextResponse.json({
        success: true,
        date: todayStr,
        results,
    });
}
