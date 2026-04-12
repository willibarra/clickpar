/**
 * IMAP Reader — imapflow
 *
 * Conecta on-demand a cuentas Hotmail/Outlook para extraer
 * códigos de verificación de correos por asunto y remitente.
 *
 * Uso típico:
 *   const code = await fetchCodeFromImap(config, { subjectFilter: 'código de acceso' });
 */

import { ImapFlow } from 'imapflow';

// ==========================================
// Types
// ==========================================

export interface ImapAccountConfig {
    email: string;
    password: string;             // App Password de Microsoft (16 chars)
    host?: string;                // Default: outlook.office365.com
    port?: number;                // Default: 993
    secure?: boolean;             // Default: true (TLS)
}

export interface ImapSearchOptions {
    subjectFilter: string;        // Asunto parcial (case-insensitive CONTAINS)
    senderFilter?: string;        // Remitente (ej: "noreply@disneyplus.com")
    lookbackMinutes?: number;     // Cuántos minutos hacia atrás (default: 15)
    maxResults?: number;          // Cuántos correos revisar (default: 5)
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
// Code Extraction Patterns
// ==========================================

const CODE_PATTERNS = [
    /c[oó]digo[^:]*:\s*(\d{4,8})/i,
    /code[^:]*:\s*(\d{4,8})/i,
    /verification[^:]*:\s*(\d{4,8})/i,
    /verificaci[oó]n[^:]*:\s*(\d{4,8})/i,
    /your code[^:]*:\s*(\d{4,8})/i,
    /tu c[oó]digo[^:]*:\s*(\d{4,8})/i,
    />\s*(\d{4,8})\s*</,                      // Código en tag HTML
    /\b(\d{6})\b/,                             // 6 dígitos aislados
    /\b(\d{4})\b/,                             // 4 dígitos aislados
];

function extractCodeFromText(text: string): string | null {
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
// Main Function
// ==========================================

/**
 * Conecta a una cuenta IMAP (Outlook/Hotmail) y busca un correo
 * que coincida con el asunto y/o remitente en los últimos N minutos.
 * Extrae el código de verificación del cuerpo del correo.
 */
export async function fetchCodeFromImap(
    config: ImapAccountConfig,
    options: ImapSearchOptions,
): Promise<ImapCodeResult> {
    const {
        subjectFilter,
        senderFilter,
        lookbackMinutes = 15,
        maxResults = 5,
    } = options;

    const host = config.host || 'outlook.office365.com';
    const port = config.port || 993;
    const secure = config.secure !== false;

    const client = new ImapFlow({
        host,
        port,
        secure,
        auth: {
            user: config.email,
            pass: config.password,
        },
        logger: false, // Silenciar logs de la librería
    });

    try {
        console.log(`[IMAP] Connecting to ${host} as ${config.email}...`);
        await client.connect();
        console.log(`[IMAP] Connected ✅`);

        await client.mailboxOpen('INBOX');

        // Build search criteria
        const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);
        const searchCriteria: any = { since };
        
        if (subjectFilter) {
            searchCriteria.subject = subjectFilter;
        }
        if (senderFilter) {
            searchCriteria.from = senderFilter;
        }

        console.log(`[IMAP] Searching: subject="${subjectFilter}" since=${since.toISOString()}`);

        const uids = (await client.search(searchCriteria, { uid: true }) || []) as number[];
        console.log(`[IMAP] Found ${uids.length} matching messages`);

        if (uids.length === 0) {
            await client.logout();
            return {
                success: false,
                error: `No se encontraron correos con asunto "${subjectFilter}" en los últimos ${lookbackMinutes} minutos`,
            };
        }

        // Get the most recent ones (last maxResults)
        const recentUids = uids.slice(-maxResults).reverse();

        for (const uid of recentUids) {
            const message = await client.fetchOne(String(uid), {
                envelope: true,
                bodyStructure: true,
                source: true,
            }, { uid: true });

            if (!message) continue;

            const subject = message.envelope?.subject || '';
            const from = message.envelope?.from?.[0]?.address || '';
            const receivedAt = message.envelope?.date;

            console.log(`[IMAP] Checking message: subject="${subject}" from=${from}`);

            // Get the raw source and decode
            const rawSource = message.source?.toString('utf-8') || '';
            
            // Try extracting from raw HTML/text
            const cleanText = stripHtml(rawSource);
            const code = extractCodeFromText(cleanText) || extractCodeFromText(rawSource);

            if (code) {
                console.log(`[IMAP] ✅ Code found: ${code} (from subject: "${subject}")`);
                await client.logout();
                return {
                    success: true,
                    code,
                    subject,
                    from,
                    receivedAt,
                };
            } else {
                console.log(`[IMAP] No code found in message "${subject}"`);
            }
        }

        await client.logout();
        return {
            success: false,
            error: `Se encontraron ${uids.length} correos pero ninguno contenía un código de verificación`,
        };

    } catch (err: any) {
        console.error(`[IMAP] Error: ${err.message}`);
        try { await client.logout(); } catch {}
        return {
            success: false,
            error: `Error de conexión IMAP: ${err.message}`,
        };
    }
}

/**
 * Prueba solo la conexión a la cuenta IMAP (sin buscar correos).
 * Útil para el botón "Probar conexión" en el Admin Panel.
 */
export async function testImapConnection(config: ImapAccountConfig): Promise<{
    success: boolean;
    error?: string;
    messageCount?: number;
}> {
    const host = config.host || 'outlook.office365.com';
    const port = config.port || 993;
    const secure = config.secure !== false;

    const client = new ImapFlow({
        host,
        port,
        secure,
        auth: {
            user: config.email,
            pass: config.password,
        },
        logger: false,
    });

    try {
        await client.connect();
        const mailbox = await client.mailboxOpen('INBOX');
        const messageCount = mailbox.exists;
        await client.logout();
        return { success: true, messageCount };
    } catch (err: any) {
        try { await client.logout(); } catch {}
        return { success: false, error: err.message };
    }
}
