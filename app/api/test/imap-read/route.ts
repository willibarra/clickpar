import { NextResponse } from 'next/server';
import { fetchCodeFromImap, testImapConnection } from '@/lib/imap-reader';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/test/imap-read
 *
 * Test endpoint for IMAP connection and code extraction.
 *
 * Body:
 *   { email, password, subjectFilter, senderFilter?, lookbackMinutes?, testOnly? }
 *
 * testOnly=true → solo prueba la conexión, no busca correos
 */
export async function POST(request: Request) {
    const body = await request.json();
    const {
        email,
        password,
        subjectFilter,
        senderFilter,
        lookbackMinutes = 15,
        testOnly = false,
    } = body;

    if (!email || !password) {
        return NextResponse.json({ success: false, error: 'email y password son requeridos' }, { status: 400 });
    }

    const config = { email, password };

    if (testOnly) {
        const result = await testImapConnection(config);
        return NextResponse.json(result);
    }

    if (!subjectFilter) {
        return NextResponse.json({ success: false, error: 'subjectFilter es requerido' }, { status: 400 });
    }

    const result = await fetchCodeFromImap(config, {
        subjectFilter,
        senderFilter,
        lookbackMinutes,
    });

    return NextResponse.json(result);
}
