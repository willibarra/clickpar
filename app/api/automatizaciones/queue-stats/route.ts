import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/automatizaciones/queue-stats
 * Returns:
 *   - message_queue counts by status
 *   - recent 30 queue rows
 *   - N8N enabled flag from app_config
 *   - whitelist mode flag from app_config
 *   - last 10 pipeline execution notifications
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // --- Parallel reads ---
    const [queueAll, queueRecent, n8nConfig, whitelistConfig, notifications] = await Promise.all([
        // all statuses for counting
        admin.from('message_queue' as any).select('status', { count: 'exact' }),
        // recent 30 rows
        admin.from('message_queue' as any)
            .select('id, status, message_type, channel, customer_name, platform, phone, error, sent_at, created_at, compose_method')
            .order('created_at', { ascending: false })
            .limit(30),
        // N8N flag
        admin.from('app_config' as any).select('value').eq('key', 'use_n8n_ai').single(),
        // Whitelist flag
        admin.from('app_config' as any).select('value').eq('key', 'wa_whitelist_enabled').single(),
        // Execution history
        admin.from('notifications' as any)
            .select('id, type, message, created_at')
            .in('type', ['queue_messages', 'send_messages', 'expiration_cron'])
            .order('created_at', { ascending: false })
            .limit(15),
    ]);

    // Count by status
    const rows = (queueAll.data || []) as any[];
    const counts = rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
    }, {});

    return NextResponse.json({
        counts: {
            pending: counts['pending'] || 0,
            composed: counts['composed'] || 0,
            sending: counts['sending'] || 0,
            sent: counts['sent'] || 0,
            failed: counts['failed'] || 0,
            skipped: counts['skipped'] || 0,
            total: rows.length,
        },
        recent: queueRecent.data || [],
        n8nEnabled: (n8nConfig.data as any)?.value === 'true',
        whitelistEnabled: (whitelistConfig.data as any)?.value === 'true',
        history: notifications.data || [],
    });
}

/**
 * PATCH /api/automatizaciones/queue-stats
 * Toggle app_config keys (n8n, whitelist).
 */
export async function PATCH(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    const allowed = ['use_n8n_ai', 'wa_whitelist_enabled'];
    if (!allowed.includes(key)) {
        return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    // Upsert config key
    const { error } = await admin.from('app_config' as any).upsert({ key, value }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
