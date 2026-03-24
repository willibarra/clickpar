import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPlatformDisplayName } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/automatizaciones/retroactive-queue
 *
 * Queues WhatsApp messages for all active sales that expired
 * MORE than 2 days ago (the regular cron pipeline only covers up to 2 days back).
 *
 * Uses today's date as idempotency key suffix so can be re-run without duplicates.
 * Does NOT cancel sales — only queues notification messages.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 3 days ago and older (pipeline already handles 0-2 days)
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    // Fetch all active sales older than 2 days
    const { data: overdueSales, error } = await (admin as any)
        .from('sales')
        .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone, whatsapp_instance), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, id))')
        .eq('is_active', true)
        .lte('end_date', threeDaysAgoStr);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const sales = (overdueSales || []) as any[];

    let queued = 0;
    let skipped_no_phone = 0;
    const errors: string[] = [];

    for (const sale of sales) {
        const customer = sale.customers;
        const slot = sale.sale_slots;
        const platform = slot?.mother_accounts?.platform || 'Servicio';
        const displayPlatform = await getPlatformDisplayName(platform);
        const phone = customer?.phone;
        const name = customer?.full_name || 'Cliente';
        const instanceName = customer?.whatsapp_instance || null;

        if (!phone) {
            skipped_no_phone++;
            continue;
        }

        // Use todayStr in idempotency key so it can re-run each day without duplicates
        const idempotency_key = `${sale.id}:overdue_retroactive:whatsapp:${todayStr}`;

        const { error: qErr } = await admin
            .from('message_queue' as any)
            .upsert({
                customer_id: sale.customer_id,
                sale_id: sale.id,
                message_type: 'expired_yesterday', // reuse this template (overdue message)
                channel: 'whatsapp',
                phone,
                customer_name: name,
                platform: displayPlatform,
                template_key: 'vencimiento_vencido',
                status: 'pending',
                instance_name: instanceName,
                scheduled_at: new Date().toISOString(),
                retry_count: 0,
                max_retries: 3,
                idempotency_key,
            }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

        if (qErr) {
            errors.push(`${name}: ${qErr.message}`);
        } else {
            queued++;
        }
    }

    // Log as notification
    if (queued > 0) {
        await admin.from('notifications' as any).insert({
            type: 'queue_messages',
            message: `📋 Retroactivo: ${queued} clientes en mora encolados para aviso (${skipped_no_phone} sin teléfono)`,
            is_read: false,
        });
    }

    return NextResponse.json({
        success: true,
        total_overdue: sales.length,
        queued,
        skipped_no_phone,
        errors,
        cutoff_date: threeDaysAgoStr,
    });
}
