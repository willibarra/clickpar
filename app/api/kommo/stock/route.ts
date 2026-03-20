import { NextResponse } from 'next/server';

/**
 * Kommo CRM integration is temporarily disabled.
 */
export async function GET() {
    return NextResponse.json(
        { error: 'Kommo está desactivado temporalmente.' },
        { status: 503 }
    );
}

export async function POST() {
    return NextResponse.json(
        { error: 'Kommo está desactivado temporalmente.' },
        { status: 503 }
    );
}
