/**
 * IMAP client for ClickPar.
 * Connects to Hotmail/Outlook/cPanel mailboxes via IMAP to fetch verification codes.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';

// ─── Code extraction patterns ──────────────────────────────────────────────
const CODE_PATTERNS = [
    /(?:código|code|verificación|verification|otp|pin)[\s:]*([\d]{4,8})/i,
    /\b(\d{4,8})\b(?=\s*(?:es tu|is your|para|for))/i,
    /(?:ingresar?|enter|use|usar|ingresá)[\s:]*([\d]{4,8})/i,
    /(?:temporary\s+access\s+code|código\s+temporal)[\s:]*([\d]{4,8})/i,
    /\b(\d{6})\b/, // Fallback: any 6-digit number
    /\b(\d{4})\b/, // Fallback: any 4-digit number
];

const PLATFORM_KEYWORDS: Record<string, string[]> = {
    Netflix: ['netflix', 'código', 'code', 'verification', 'household', 'hogar', 'dispositivo'],
    'Disney+': ['disney', 'código', 'code', 'one-time'],
    'HBO Max': ['hbo', 'max', 'código', 'code', 'verification'],
    'Amazon Prime Video': ['amazon', 'prime', 'código', 'code', 'otp'],
    'Prime Video': ['amazon', 'prime', 'código', 'code', 'otp'],
    Spotify: ['spotify', 'código', 'code', 'verification'],
    'YouTube Premium': ['youtube', 'google', 'código', 'code', 'verification'],
    Crunchyroll: ['crunchyroll', 'código', 'code'],
    'Paramount+': ['paramount', 'código', 'code'],
    iCloud: ['apple', 'icloud', 'código', 'code', 'verification'],
};

// ─── Known IMAP server configs ────────────────────────────────────────────
export const IMAP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
    hotmail: { host: 'outlook.office365.com', port: 993, secure: true },
    outlook: { host: 'outlook.office365.com', port: 993, secure: true },
    live: { host: 'outlook.office365.com', port: 993, secure: true },
    gmail: { host: 'imap.gmail.com', port: 993, secure: true },
    yahoo: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    icloud: { host: 'imap.mail.me.com', port: 993, secure: true },
    me: { host: 'imap.mail.me.com', port: 993, secure: true },
    // cPanel uses custom host — must be provided explicitly
};

export interface ImapAccountConfig {
    email: string;
    password: string;
    host: string;
    port: number;
    secure: boolean;
}

export interface ImapCodeResult {
    success: boolean;
    code?: string;
    subject?: string;
    from?: string;
    date?: string;
    error?: string;
}

/**
 * Detect IMAP server settings from an email address.
 */
export function detectImapConfig(email: string): { host: string; port: number; secure: boolean } | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    // Check presets
    for (const [key, config] of Object.entries(IMAP_PRESETS)) {
        if (domain.includes(key)) return config;
    }

    // For custom domains (cPanel), try the standard imap.domain pattern
    return { host: `mail.${domain}`, port: 993, secure: true };
}

/**
 * Extract verification code from email text.
 */
function extractCode(text: string): string | null {
    const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    for (const pattern of CODE_PATTERNS) {
        const match = cleanText.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

/**
 * Check if email content matches a platform's verification pattern.
 */
function matchesPlatform(text: string, platform: string): boolean {
    const keywords = PLATFORM_KEYWORDS[platform] || [platform.toLowerCase()];
    const lowerText = text.toLowerCase();
    return keywords.some((kw) => lowerText.includes(kw));
}

/**
 * Search a mailbox via IMAP for recent verification codes.
 * 
 * @param config - IMAP account credentials and server settings
 * @param accountEmail - The account email we're looking for codes sent TO
 * @param platform - The streaming platform to filter by
 * @param maxAgeMinutes - Only look at emails received within this many minutes
 */
export async function searchImapForCode(
    config: ImapAccountConfig,
    accountEmail: string,
    platform: string,
    maxAgeMinutes: number = 15,
): Promise<ImapCodeResult> {
    let client: ImapFlow | null = null;

    try {
        client = new ImapFlow({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.email,
                pass: config.password,
            },
            logger: false,
            emitLogs: false,
        });

        await client.connect();

        // Open INBOX
        const lock = await client.getMailboxLock('INBOX');

        try {
            // Search for recent messages
            const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

            // Search for messages sent TO the account email since the cutoff
            const messages = client.fetch(
                {
                    since,
                    to: accountEmail,
                },
                {
                    envelope: true,
                    source: true,
                },
                { uid: true }
            );

            const candidates: Array<{
                code: string;
                subject: string;
                from: string;
                date: string;
                score: number;
            }> = [];

            for await (const msg of messages) {
                if (!msg.source) continue;
                const parsed = await simpleParser(msg.source) as ParsedMail;

                const subject = parsed.subject || '';
                const body = parsed.text || '';
                const html = parsed.html || '';
                const allText = `${subject} ${body} ${html}`;
                const date = parsed.date?.toISOString() || '';
                const from = parsed.from?.text || '';

                // Check if this email is relevant to the platform
                if (!matchesPlatform(allText, platform)) continue;

                // Try to extract a code
                const code = extractCode(allText);
                if (!code) continue;

                // Score by relevance (newer = higher priority)
                const ageMs = Date.now() - (parsed.date?.getTime() || 0);
                const score = Math.max(0, maxAgeMinutes * 60 * 1000 - ageMs);

                candidates.push({ code, subject, from, date, score });
            }

            // Return the most recent/relevant match
            if (candidates.length > 0) {
                candidates.sort((a, b) => b.score - a.score);
                const best = candidates[0];
                return {
                    success: true,
                    code: best.code,
                    subject: best.subject,
                    from: best.from,
                    date: best.date,
                };
            }

            return {
                success: false,
                error: `No se encontró código de ${platform} en los últimos ${maxAgeMinutes} minutos`,
            };
        } finally {
            lock.release();
        }
    } catch (err: any) {
        console.error(`[IMAP] Error connecting to ${config.email}@${config.host}:`, err.message);
        return {
            success: false,
            error: `Error de conexión IMAP: ${err.message}`,
        };
    } finally {
        if (client) {
            try { await client.logout(); } catch {}
        }
    }
}

/**
 * Batch search multiple IMAP accounts for a verification code.
 * Useful when the "receiving" account could be any of several mailboxes.
 * Returns the first code found.
 */
export async function searchMultipleImapForCode(
    accounts: ImapAccountConfig[],
    accountEmail: string,
    platform: string,
    maxAgeMinutes: number = 10,
): Promise<ImapCodeResult> {
    // Run searches in parallel with a timeout
    const results = await Promise.allSettled(
        accounts.map((acct) =>
            Promise.race([
                searchImapForCode(acct, accountEmail, platform, maxAgeMinutes),
                new Promise<ImapCodeResult>((_, reject) =>
                    setTimeout(() => reject(new Error('IMAP timeout')), 30_000)
                ),
            ])
        )
    );

    // Return first successful result
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
            return result.value;
        }
    }

    // Collect errors for diagnostics
    const errors = results
        .map((r, i) => {
            if (r.status === 'rejected') return `${accounts[i].email}: ${r.reason?.message || 'timeout'}`;
            if (!r.value.success) return `${accounts[i].email}: ${r.value.error}`;
            return null;
        })
        .filter(Boolean);

    return {
        success: false,
        error: `No se encontró código en ${accounts.length} cuentas. Errores: ${errors.join('; ')}`,
    };
}
