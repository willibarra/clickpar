import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/trigger-pipeline
 *
 * Vercel Cron entry point — runs all 3 pipeline phases in sequence.
 * Schedule: "0 11 * * *" → 11:00 UTC = 7:00 AM Paraguay (UTC-4)
 *
 * Protected by CRON_SECRET via Authorization header (Vercel injects automatically).
 * Also accepts ?secret=<CRON_SECRET> as fallback for manual testing.
 */

const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

function getBaseUrl(): string {
    // NEXT_PUBLIC_APP_URL is the canonical production URL (set in env vars)
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    }
    // VERCEL_URL is set automatically by Vercel on every deployment
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Local development fallback
    return 'http://localhost:3000';
}

export async function GET(request: NextRequest) {
    // Verify cron secret — Vercel sends it as Authorization: Bearer <secret>
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.replace('Bearer ', '');
    const querySecret = request.nextUrl.searchParams.get('secret');

    if (bearerToken !== CRON_SECRET && querySecret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = getBaseUrl();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
    };

    const phases = [
        { key: 'queue',   label: 'Cola de mensajes', url: `${baseUrl}/api/cron/queue-messages` },
        { key: 'compose', label: 'Composición',       url: `${baseUrl}/api/cron/compose-messages` },
        { key: 'send',    label: 'Envío',             url: `${baseUrl}/api/cron/send-messages` },
    ];

    const results: Record<string, any> = {};
    const startedAt = new Date().toISOString();

    for (const phase of phases) {
        try {
            console.log(`[TriggerPipeline] Starting phase: ${phase.label} → ${phase.url}`);
            const res = await fetch(phase.url, { method: 'POST', headers });
            const data = await res.json();
            results[phase.key] = { success: res.ok, status: res.status, data };
            console.log(`[TriggerPipeline] Phase ${phase.key} → ${res.ok ? 'OK' : 'FAILED'}`);
        } catch (e: any) {
            console.error(`[TriggerPipeline] Phase ${phase.key} threw:`, e.message);
            results[phase.key] = { success: false, error: e.message };
        }
    }

    const allOk = Object.values(results).every((r: any) => r.success);

    return NextResponse.json({
        success: allOk,
        started_at: startedAt,
        environment: baseUrl,
        phases: results,
    });
}
