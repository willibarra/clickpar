import { NextResponse } from 'next/server';
import { getGmailAuthUrl } from '@/lib/gmail';
export const dynamic = 'force-dynamic';


/**
 * GET /api/gmail/auth
 * Redirects admin to Google OAuth2 consent screen.
 */
export async function GET() {
    try {
        const authUrl = getGmailAuthUrl();
        return NextResponse.redirect(authUrl);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Gmail API not configured' },
            { status: 500 }
        );
    }
}
