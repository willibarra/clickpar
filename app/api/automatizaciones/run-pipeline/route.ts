import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function getBaseUrl(request: NextRequest): string {
    const host = request.headers.get('host') || 'localhost:3000';
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
    return `${proto}://${host}`;
}
const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

/**
 * POST /api/automatizaciones/run-pipeline
 *
 * Runs all 3 cron pipeline phases in sequence:
 *   1. queue-messages
 *   2. compose-messages
 *   3. send-messages
 *
 * Accepts optional ?phase=queue|compose|send to run a single phase.
 * Protected by Supabase session.
 */
export async function POST(request: NextRequest) {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const phase = request.nextUrl.searchParams.get('phase'); // optional

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
    };

    const baseUrl = getBaseUrl(request);

    const phases: { key: string; label: string; url: string }[] = [
        { key: 'queue', label: 'Cola de mensajes', url: `${baseUrl}/api/cron/queue-messages` },
        { key: 'compose', label: 'Composición', url: `${baseUrl}/api/cron/compose-messages` },
        { key: 'send', label: 'Envío', url: `${baseUrl}/api/cron/send-messages` },
    ];

    const targetPhases = phase ? phases.filter(p => p.key === phase) : phases;

    const results: Record<string, any> = {};

    for (const p of targetPhases) {
        try {
            const res = await fetch(p.url, { method: 'POST', headers });
            const data = await res.json();
            results[p.key] = { success: res.ok, status: res.status, data };
        } catch (e: any) {
            results[p.key] = { success: false, error: e.message };
        }
    }

    return NextResponse.json({ success: true, phases: results });
}
