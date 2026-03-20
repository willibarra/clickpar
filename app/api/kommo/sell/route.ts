import { NextResponse } from 'next/server';

/**
 * Kommo CRM integration is temporarily disabled.
 */
export async function POST() {
    return NextResponse.json(
        { error: 'Kommo está desactivado temporalmente. Contactar al administrador.' },
        { status: 503 }
    );
}
