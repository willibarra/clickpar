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
import { getPlatformDisplayName, isPhoneWhitelisted } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';


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

    const results = {
        queued: 0,
        skipped_no_phone: 0,
        skipped_whitelist: 0,
        errors: [] as string[],
    };

    // Define date ranges and their message types.
    // Covers: 7 days, 3 days, 1 day before expiry + same day + 1 day after.
    // idempotency_key = saleId:type:channel:dateStr → no duplicates across runs.
    const sevenDaysStr = formatDate(addDays(today, 7));
    const threeDaysStr = formatDate(addDays(today, 3));

    const dateRanges: { filterDate: string; type: MessageType; templateKey: string; daysLabel: string }[] = [
        { filterDate: todayStr,      type: 'expiry_today',      templateKey: 'vencimiento_hoy',    daysLabel: '0d' },
    ];

    for (const range of dateRanges) {
        try {
            const { data: sales } = await supabase
                .from('sales' as any)
                .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone, whatsapp_instance), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, id))')
                .eq('is_active', true)
                .eq('end_date', range.filterDate);

            // Fetch already queued messages for this template today to avoid manual+auto duplicates
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            
            const { data: alreadyQueued } = await supabase
                .from('message_queue' as any)
                .select('sale_id')
                .eq('template_key', range.templateKey)
                .gte('created_at', startOfDay.toISOString());
                
            const { data: alreadySentLog } = await (supabase.from('whatsapp_send_log') as any)
                .select('sale_id')
                .eq('template_key', range.templateKey)
                .gte('created_at', startOfDay.toISOString());
            
            const alreadyProcessedSaleIds = new Set([
                ...(alreadyQueued || []).map((q: any) => q.sale_id),
                ...(alreadySentLog || []).map((q: any) => q.sale_id)
            ]);

            for (const sale of (sales || []) as any[]) {
                if (alreadyProcessedSaleIds.has(sale.id)) {
                    // Skip! Ya se envió o encoló manualmente hoy.
                    continue;
                }
                const customer = sale.customers;
                const slot = sale.sale_slots;
                const platform = slot?.mother_accounts?.platform || 'Servicio';
                const displayPlatform = await getPlatformDisplayName(platform);
                const phone = customer?.phone;
                const name = customer?.full_name || 'Cliente';

                if (!phone) {
                    results.skipped_no_phone++;
                    continue;
                }

                // Skip phones not in whitelist (if whitelist is active)
                if (!await isPhoneWhitelisted(phone)) {
                    results.skipped_whitelist++;
                    continue;
                }

                const instanceName = customer?.whatsapp_instance || null;

                // Use filterDate + daysLabel in idempotency key to distinguish
                // 7-day vs 3-day vs 1-day pre_expiry messages for the same sale.
                const idempotencyDate = `${range.filterDate}:${range.daysLabel}`;

                // Queue WhatsApp message
                const waKey = makeIdempotencyKey(sale.id, range.type, 'whatsapp', idempotencyDate);
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
                    results.errors.push(`wa-queue [${range.daysLabel}]: ${name} - ${waErr.message}`);
                } else {
                    results.queued++;
                }
            }
        } catch (e: any) {
            results.errors.push(`range-${range.type}-${range.daysLabel}: ${e.message}`);
        }
    }

    // Log summary as internal notification
    if (results.queued > 0) {
        await supabase.from('notifications' as any).insert({
            type: 'queue_messages',
            message: `📋 Cola de mensajes: ${results.queued} encolados | ${results.skipped_no_phone} sin teléfono | ${results.skipped_whitelist} en whitelist`,
            is_read: false,
        });
    }

    return NextResponse.json({
        success: true,
        date: todayStr,
        results,
    });
}
