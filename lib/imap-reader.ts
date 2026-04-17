/**
 * IMAP Reader — imapflow
 * Conecta on-demand a Outlook/Hotmail para extraer códigos de verificación.
 * Soporta múltiples filtros de asunto por cuenta.
 */

import { ImapFlow } from 'imapflow';

export interface ImapAccountConfig {
    email: string;
    password: string;
    host?: string;
    port?: number;
    secure?: boolean;
}

export interface ImapSearchOptions {
    /** Uno o varios asuntos a buscar (case-insensitive CONTAINS) */
    subjectFilters: string[];
    senderFilter?: string;
    lookbackMinutes?: number;
}

export interface ImapCodeResult {
    success: boolean;
    code?: string;
    subject?: string;
    from?: string;
    receivedAt?: Date;
    error?: string;
}

// ==========================================
// Code Extraction
// ==========================================

const CODE_PATTERNS = [
    /c[oó]digo[^:]*:\s*(\d{4,8})/i,
    /code[^:]*:\s*(\d{4,8})/i,
    /verification[^:]*:\s*(\d{4,8})/i,
    /verificaci[oó]n[^:]*:\s*(\d{4,8})/i,
    /your code[^:]*:\s*(\d{4,8})/i,
    /tu c[oó]digo[^:]*:\s*(\d{4,8})/i,
    />\s*(\d{4,8})\s*</,
    /\b(\d{6})\b/,
    /\b(\d{4})\b/,
];

function extractCode(text: string): string | null {
    for (const pattern of CODE_PATTERNS) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

// ==========================================
// Main: fetch code from IMAP
// ==========================================

export async function fetchCodeFromImap(
    config: ImapAccountConfig,
    options: ImapSearchOptions,
): Promise<ImapCodeResult> {
    const {
        subjectFilters,
        senderFilter,
        lookbackMinutes = 15,
    } = options;

    if (!subjectFilters || subjectFilters.length === 0) {
        return { success: false, error: 'No se configuraron asuntos para buscar' };
    }

    const host = config.host || 'outlook.office365.com';
    const port = config.port || 993;
    const secure = config.secure !== false;

    const client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user: config.email, pass: config.password },
        logger: false,
        socketTimeout: 20000,
        greetingTimeout: 15000,
        connectionTimeout: 15000,
    });

    try {
        console.log(`[IMAP] Connecting to ${host} as ${config.email}...`);
        await client.connect();
        await client.mailboxOpen('INBOX');

        const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);

        // Try each subject filter until we find a code
        for (const subject of subjectFilters) {
            if (!subject.trim()) continue;

            const searchCriteria: any = { since, subject: subject.trim() };
            if (senderFilter) searchCriteria.from = senderFilter;

            console.log(`[IMAP] Searching subject="${subject}" since=${since.toISOString()}`);

            const uids = (await client.search(searchCriteria, { uid: true }) || []) as number[];
            console.log(`[IMAP] Found ${uids.length} messages for subject="${subject}"`);

            if (uids.length === 0) continue;

            // Check most recent first
            const recentUids = uids.slice(-5).reverse();
            for (const uid of recentUids) {
                const msg = await client.fetchOne(String(uid), {
                    envelope: true,
                    source: true,
                }, { uid: true });

                if (!msg) continue;

                const msgSubject = msg.envelope?.subject || '';
                const from = msg.envelope?.from?.[0]?.address || '';
                const receivedAt = msg.envelope?.date;
                const raw = msg.source?.toString('utf-8') || '';

                const code = extractCode(stripHtml(raw)) || extractCode(raw);
                if (code) {
                    console.log(`[IMAP] ✅ Code ${code} found in "${msgSubject}"`);
                    await client.logout();
                    return { success: true, code, subject: msgSubject, from, receivedAt };
                }
            }
        }

        await client.logout();
        return {
            success: false,
            error: `No se encontró código en los últimos ${lookbackMinutes} min (${subjectFilters.length} asunto(s) revisado(s))`,
        };

    } catch (err: any) {
        console.error(`[IMAP] Error: ${err.message}`);
        try { await client.logout(); } catch {}
        return { success: false, error: `Error IMAP: ${err.message}` };
    }
}

// ==========================================
// Test connection only
// ==========================================

export async function testImapConnection(config: ImapAccountConfig): Promise<{
    success: boolean;
    error?: string;
    messageCount?: number;
}> {
    const client = new ImapFlow({
        host: config.host || 'outlook.office365.com',
        port: config.port || 993,
        secure: config.secure !== false,
        auth: { user: config.email, pass: config.password },
        logger: false,
        socketTimeout: 20000,
        greetingTimeout: 15000,
        connectionTimeout: 15000,
    });

    try {
        await client.connect();
        const mb = await client.mailboxOpen('INBOX');
        await client.logout();
        return { success: true, messageCount: mb.exists };
    } catch (err: any) {
        try { await client.logout(); } catch {}
        return { success: false, error: err.message };
    }
}
