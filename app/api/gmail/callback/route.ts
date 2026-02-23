import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { exchangeGmailCode } from '@/lib/gmail';

/**
 * GET /api/gmail/callback?code=xxx
 * Handles Google OAuth2 callback, stores tokens in Supabase.
 */
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code');
    const error = req.nextUrl.searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL('/settings?gmail=error&reason=' + error, req.url));
    }

    if (!code) {
        return NextResponse.redirect(new URL('/settings?gmail=error&reason=no_code', req.url));
    }

    try {
        const tokens = await exchangeGmailCode(code);

        // Store tokens in Supabase
        const supabase = await createAdminClient();

        // Get the Gmail user info to determine which email was authorized
        const userInfoRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json();
        const gmailAddress = userInfo.emailAddress || 'unknown';

        // Upsert into gmail_tokens table
        await (supabase.from('gmail_tokens') as any).upsert({
            email: gmailAddress,
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token,
            expires_at: new Date(tokens.expires_at).toISOString(),
        }, { onConflict: 'email' });

        console.log(`[Gmail] Tokens stored for ${gmailAddress}`);

        return NextResponse.redirect(new URL(`/settings?gmail=success&email=${gmailAddress}`, req.url));
    } catch (err: any) {
        console.error('[Gmail] Callback error:', err);
        return NextResponse.redirect(new URL('/settings?gmail=error&reason=token_exchange', req.url));
    }
}
