import { NextRequest, NextResponse } from 'next/server';

/**
 * Kommo OAuth Callback Handler
 * Handles the redirect from Kommo after authorization.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const referer = searchParams.get('referer');

    if (!code) {
        return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    try {
        // Exchange code for tokens
        const tokenRes = await fetch(`https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/oauth2/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.KOMMO_CLIENT_ID,
                client_secret: process.env.KOMMO_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.KOMMO_REDIRECT_URI,
            }),
        });

        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            return NextResponse.json({ error: 'Token exchange failed', details: errorText }, { status: 400 });
        }

        const tokens = await tokenRes.json();

        // Log tokens for manual update (in production, save to DB)
        console.log('[Kommo Callback] New tokens received:');
        console.log('Access Token:', tokens.access_token?.substring(0, 30) + '...');
        console.log('Refresh Token:', tokens.refresh_token?.substring(0, 30) + '...');

        return NextResponse.json({
            success: true,
            message: 'Kommo integration authorized successfully. Check server logs for tokens.',
        });
    } catch (error: any) {
        console.error('[Kommo Callback] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
