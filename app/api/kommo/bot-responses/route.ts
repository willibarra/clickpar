import { NextResponse } from 'next/server';

/**
 * Kommo CRM integration is temporarily disabled.
 * Bot responses endpoint is inactive.
 */
export async function GET() {
    return NextResponse.json(
        { error: 'Kommo está desactivado temporalmente.' },
        { status: 503 }
    );
}
