import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

// ─── [Capa 3] Rate limiter ────────────────────────────────────────────────────
// Module-level Map works reliably in the persistent Node.js process used by
// Dokploy. If you ever migrate to a serverless/edge runtime, replace this with
// an Upstash Redis rate limiter (e.g. @upstash/ratelimit).
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT  = 15;     // max events per window per identifier
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(id: string): boolean {
    const now   = Date.now();
    const entry = rateMap.get(id);

    if (!entry || now > entry.resetAt) {
        rateMap.set(id, { count: 1, resetAt: now + RATE_WINDOW });
        return false;
    }
    if (entry.count >= RATE_LIMIT) return true;
    entry.count++;
    return false;
}

/**
 * POST /api/portal/log-access
 * Logs portal access events (login, credential_view, etc.)
 *
 * Protections applied:
 *  [Capa 3] Rate limiting  — max 15 events/min per IP (fallback: user_id)
 *  [Capa 4] Idempotency    — duplicate `login` events within 30 s are dropped
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // [Capa 3] Rate limit by IP; fall back to user_id if IP is not available
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || req.headers.get('x-real-ip')
        || user.id;

    if (isRateLimited(ip)) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { eventType, metadata = {} } = await req.json();

    if (!eventType) {
        return NextResponse.json({ error: 'Falta eventType' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // [Capa 4] Idempotency: if a `login` event was already recorded for this user
    // in the last 30 seconds, silently succeed instead of inserting a duplicate.
    // This prevents double-entries caused by slow connections, retries, or a
    // user submitting the form twice.
    if (eventType === 'login') {
        const windowStart = new Date(Date.now() - 30_000).toISOString();
        const { data: recentEvent } = await (admin.from('portal_access_log') as any)
            .select('id')
            .eq('user_id', user.id)
            .eq('event_type', 'login')
            .gte('created_at', windowStart)
            .limit(1)
            .maybeSingle();

        if (recentEvent) {
            // Already logged — return success without inserting
            return NextResponse.json({ success: true, deduplicated: true });
        }
    }

    // Try to find customer_id from profile phone
    let customerId = null;
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    if (profile?.phone_number) {
        const { data: customer } = await (admin.from('customers') as any)
            .select('id')
            .eq('phone', normalizePhone(profile.phone_number))
            .single();
        customerId = customer?.id || null;
    }

    // Insert log entry
    await (admin.from('portal_access_log') as any).insert({
        customer_id: customerId,
        user_id:     user.id,
        event_type:  eventType,
        ip_address:  ip,
        user_agent:  req.headers.get('user-agent') || 'unknown',
        metadata,
    });

    return NextResponse.json({ success: true });
}
