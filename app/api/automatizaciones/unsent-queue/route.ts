import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQueueSupabase } from '@/lib/queue-helpers';
import { getPlatformDisplayName } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/automatizaciones/unsent-queue
 *
 * Finds ALL active sales (any expiry date) that have NO sent/pending/composed/sending
 * message in message_queue today, and queues them with scheduled_at = today 07:00 local time.
 *
 * Use ?preview=true to get the count without queuing.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isPreview = request.nextUrl.searchParams.get('preview') === 'true';

    const admin = getQueueSupabase();

    // today at midnight local
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 7am today local → stored as UTC ISO string
    const sevenAmLocal = new Date(`${todayStr}T07:00:00`);
    // If it's already past 7am, schedule for 7am tomorrow
    if (now >= sevenAmLocal) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        sevenAmLocal.setDate(sevenAmLocal.getDate() + 1);
    }
    const scheduledAt = sevenAmLocal.toISOString();

    // 1. Get all existing message_queue entries to know which sale_ids already have messages
    const { data: existingQueue } = await admin
        .from('message_queue' as any)
        .select('sale_id, status')
        .in('status', ['pending', 'composed', 'sending', 'sent']);

    const alreadyQueuedSaleIds = new Set(
        ((existingQueue || []) as any[]).map((r: any) => r.sale_id).filter(Boolean)
    );

    // 2. Get all active sales with expiry <= today + 3 days
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysFromNowStr = threeDaysFromNow.toISOString().split('T')[0];

    const { data: salesData, error } = await admin
        .from('sales' as any)
        .select('id, amount_gs, end_date, customer_id, slot_id')
        .eq('is_active', true)
        .lte('end_date', threeDaysFromNowStr);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rawSales = ((salesData || []) as any[]).filter(
        (s: any) => !alreadyQueuedSaleIds.has(s.id)
    );

    if (rawSales.length === 0) {
        return NextResponse.json({ success: true, total_uncontacted: 0, queued: 0, skipped_no_phone: 0, scheduled_at: scheduledAt, errors: [] });
    }

    // Fetch customers and slots separately (avoids schema cache issues)
    const customerIds = [...new Set(rawSales.map((s: any) => s.customer_id).filter(Boolean))];
    const slotIds = [...new Set(rawSales.map((s: any) => s.slot_id).filter(Boolean))];

    const [{ data: customersData }, { data: slotsData }] = await Promise.all([
        admin.from('customers' as any).select('id, full_name, phone, whatsapp_instance').in('id', customerIds),
        admin.from('sale_slots' as any).select('id, slot_identifier, mother_account_id').in('id', slotIds),
    ]);

    const slotAccountIds = [...new Set(((slotsData || []) as any[]).map((sl: any) => sl.mother_account_id).filter(Boolean))];
    const { data: accountsData } = await admin
        .from('mother_accounts' as any)
        .select('id, platform')
        .in('id', slotAccountIds);

    // Build lookup maps
    const customerMap = new Map(((customersData || []) as any[]).map((c: any) => [c.id, c]));
    const slotMap = new Map(((slotsData || []) as any[]).map((sl: any) => [sl.id, sl]));
    const accountMap = new Map(((accountsData || []) as any[]).map((a: any) => [a.id, a]));

    // Enrich sales
    const sales = rawSales.map((s: any) => {
        const customer = customerMap.get(s.customer_id) || null;
        const slot = slotMap.get(s.slot_id) || null;
        const account = slot ? accountMap.get(slot.mother_account_id) || null : null;
        return { ...s, customer, slot, platform: account?.platform || 'Servicio' };
    });

    if (isPreview) {
        const withPhone = sales.filter((s: any) => s.customer?.phone);
        return NextResponse.json({
            total_uncontacted: sales.length,
            with_phone: withPhone.length,
            without_phone: sales.length - withPhone.length,
            scheduled_at: scheduledAt,
            estimated_minutes: Math.ceil(withPhone.length / 5) * 0.5,
        });
    }

    // 3. Queue them all for 7am
    let queued = 0;
    let skipped_no_phone = 0;
    const errors: string[] = [];

    for (const sale of sales) {
        const customer = sale.customer;
        const platform = sale.platform;
        const displayPlatform = await getPlatformDisplayName(platform);
        const phone = customer?.phone;
        const name = customer?.full_name || 'Cliente';

        if (!phone) { skipped_no_phone++; continue; }

        const instanceName = customer?.whatsapp_instance || null;

        // Determine message type based on end_date
        const endDate = new Date(sale.end_date);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));

        let messageType: string;
        let templateKey: string;
        if (diffDays <= 0) {
            messageType = 'expiry_today';
            templateKey = 'vencimiento_hoy';
        } else if (diffDays === 1) {
            messageType = 'expired_yesterday';
            templateKey = 'vencimiento_vencido';
        } else {
            messageType = 'expired_yesterday'; // reuse for all older
            templateKey = 'vencimiento_vencido';
        }

        const idempotency_key = `${sale.id}:${messageType}:whatsapp:scheduled7am:${todayStr}`;

        const { error: qErr } = await admin
            .from('message_queue' as any)
            .upsert({
                customer_id: sale.customer_id,
                sale_id: sale.id,
                message_type: messageType,
                channel: 'whatsapp',
                phone,
                customer_name: name,
                platform: displayPlatform,
                template_key: templateKey,
                status: 'pending',
                instance_name: instanceName,
                scheduled_at: scheduledAt,
                retry_count: 0,
                max_retries: 3,
                idempotency_key,
            }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

        if (qErr) errors.push(`${name}: ${qErr.message}`);
        else queued++;
    }

    if (queued > 0) {
        await admin.from('notifications' as any).insert({
            type: 'queue_messages',
            message: `⏰ Envío programado 7am: ${queued} clientes encolados para ${scheduledAt}`,
            is_read: false,
        });
    }

    return NextResponse.json({
        success: true,
        total_uncontacted: sales.length,
        queued,
        skipped_no_phone,
        scheduled_at: scheduledAt,
        errors,
    });
}
