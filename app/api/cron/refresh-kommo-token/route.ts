import { NextResponse } from 'next/server';

/**
 * Kommo token refresh is temporarily disabled.
 */
export async function GET() {
    return NextResponse.json(
        { error: 'Kommo está desactivado temporalmente. No se requiere refresh de token.' },
        { status: 503 }
    );
}
