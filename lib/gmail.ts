/**
 * Gmail API integration for ClickPar.
 * Used to fetch verification codes from streaming platform emails.
 */

// Platform-specific email search keywords
const PLATFORM_KEYWORDS: Record<string, string[]> = {
    'Netflix': ['netflix', 'código', 'code', 'verification', 'verificación', 'dispositivo', 'device', 'hogar', 'household'],
    'Disney+': ['disney', 'código', 'code', 'verification', 'verificación', 'one-time'],
    'HBO Max': ['hbo', 'max', 'código', 'code', 'verification', 'verificación'],
    'Amazon Prime Video': ['amazon', 'prime', 'código', 'code', 'otp', 'verificación'],
    'Prime Video': ['amazon', 'prime', 'código', 'code', 'otp', 'verificación'],
    'Spotify': ['spotify', 'código', 'code', 'verification', 'login'],
    'YouTube Premium': ['youtube', 'google', 'código', 'code', 'verification'],
    'Crunchyroll': ['crunchyroll', 'código', 'code', 'verification'],
    'Paramount+': ['paramount', 'código', 'code', 'verification'],
    'iCloud': ['apple', 'icloud', 'código', 'code', 'verification', 'verification code'],
};

// Regex patterns to extract verification codes (4-8 digits)
const CODE_PATTERNS = [
    /(?:código|code|verificación|verification|otp|pin)[\s:]*(\d{4,8})/i,
    /\b(\d{4,8})\b(?=\s*(?:es tu|is your|para|for))/i,
    /(?:ingresar?|enter|use|usar|ingresá)[\s:]*(\d{4,8})/i,
    /(?:temporary\s+access\s+code|código\s+temporal)[\s:]*(\d{4,8})/i,
    /\b(\d{6})\b/,  // Fallback: any 6-digit number
    /\b(\d{4})\b/,  // Fallback: any 4-digit number
];

interface GmailTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}

/**
 * Get OAuth2 authorization URL for Gmail.
 */
export function getGmailAuthUrl(): string {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/gmail/callback';

    if (!clientId) throw new Error('GMAIL_CLIENT_ID not configured');

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        access_type: 'offline',
        prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeGmailCode(code: string): Promise<GmailTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: process.env.GMAIL_CLIENT_ID!,
            client_secret: process.env.GMAIL_CLIENT_SECRET!,
            redirect_uri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/gmail/callback',
            grant_type: 'authorization_code',
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Gmail token exchange failed: ${error}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
    };
}

/**
 * Refresh an expired access token.
 */
export async function refreshGmailToken(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GMAIL_CLIENT_ID!,
            client_secret: process.env.GMAIL_CLIENT_SECRET!,
            grant_type: 'refresh_token',
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Gmail token refresh failed: ${error}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        expires_at: Date.now() + (data.expires_in * 1000),
    };
}

/**
 * Get a valid Gmail access token, refreshing if needed.
 */
export async function getValidGmailToken(stored: {
    access_token: string;
    refresh_token: string;
    expires_at: string | null;
}): Promise<string> {
    const expiresAt = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;

    // If token still valid (with 5 min buffer), use it
    if (expiresAt > Date.now() + 300_000) {
        return stored.access_token;
    }

    // Refresh token
    const refreshed = await refreshGmailToken(stored.refresh_token);
    return refreshed.access_token;
}

/**
 * Search Gmail for verification code emails.
 */
export async function searchVerificationEmails(
    accessToken: string,
    accountEmail: string,
    platform: string,
): Promise<{ id: string; snippet: string; date: string }[]> {
    // Build search query
    const keywords = PLATFORM_KEYWORDS[platform] || [platform.toLowerCase()];
    const keywordQuery = keywords.slice(0, 3).map(k => `"${k}"`).join(' OR ');

    // Search for emails received in the last 2 hours addressed to the account email
    const query = `to:${accountEmail} (${keywordQuery}) newer_than:2h`;

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const error = await res.text();
        console.error('[Gmail] Search error:', error);
        throw new Error('Error buscando emails');
    }

    const data = await res.json();
    const messageIds = (data.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) return [];

    // Fetch each message
    const messages = await Promise.all(
        messageIds.slice(0, 3).map(async (id: string) => {
            const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgRes.ok) return null;
            const msg = await msgRes.json();

            const date = new Date(parseInt(msg.internalDate)).toISOString();
            const snippet = msg.snippet || '';

            // Extract body text
            let body = '';
            if (msg.payload?.body?.data) {
                body = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8');
            } else if (msg.payload?.parts) {
                for (const part of msg.payload.parts) {
                    if (part.mimeType === 'text/plain' && part.body?.data) {
                        body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
                        break;
                    }
                    if (part.mimeType === 'text/html' && part.body?.data) {
                        body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
                    }
                }
            }

            return { id, snippet, body, date };
        })
    );

    return messages.filter(Boolean) as any[];
}

/**
 * Extract verification code from email body text.
 */
export function extractVerificationCode(body: string, snippet: string): string | null {
    // Strip HTML tags
    const plainText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const searchText = `${snippet} ${plainText}`;

    for (const pattern of CODE_PATTERNS) {
        const match = searchText.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Generic search for the inbox.
 */
export async function searchInbox(
    accessToken: string,
    accountEmail: string,
    queryTerm: string = '',
): Promise<{ id: string; snippet: string; date: string; subject: string }[]> {
    // Search for emails received to the account email
    const query = `to:${accountEmail} ${queryTerm} newer_than:2d`.trim();

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const error = await res.text();
        console.error('[Gmail] Search Inbox error:', error);
        throw new Error('Error buscando emails');
    }

    const data = await res.json();
    const messageIds = (data.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) return [];

    // Fetch each message
    const messages = await Promise.all(
        messageIds.map(async (id: string) => {
            const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgRes.ok) return null;
            const msg = await msgRes.json();

            const date = new Date(parseInt(msg.internalDate)).toISOString();
            const snippet = msg.snippet || '';
            const headers = msg.payload?.headers || [];
            const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
            const subject = subjectHeader ? subjectHeader.value : 'Sin Asunto';

            return { id, snippet, subject, date };
        })
    );

    return messages.filter(Boolean) as any[];
}
