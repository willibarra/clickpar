import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


/**
 * Kommo CRM webhook is temporarily disabled.
 */
export async function POST() {
    return NextResponse.json(
        { error: 'Kommo webhook está desactivado temporalmente.' },
        { status: 503 }
    );
}
