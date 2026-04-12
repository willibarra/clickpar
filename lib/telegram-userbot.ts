/**
 * Telegram UserBot Service — GramJS
 * 
 * Connects as a Telegram USER (not bot) to interact with provider bots
 * like @autocodestream_bot to fetch verification codes automatically.
 * 
 * Uses StringSession for persistent auth — the session is stored in DB.
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

// ==========================================
// Types
// ==========================================

export interface TelegramSessionConfig {
    apiId: number;
    apiHash: string;
    sessionString: string;
}

export interface BotFlowStep {
    /** Message to send to the bot (ignored if clickButtonText is set) */
    message?: string;
    /** 
     * If set, instead of sending a text message, click the inline button
     * whose text contains this string (case-insensitive partial match).
     */
    clickButtonText?: string;
    /** 
     * Pattern to match in the bot's reply before advancing to the next step.
     * If a message doesn't match, it's treated as an intermediate message and skipped.
     * If null/undefined, the step advances on any reply.
     */
    waitForPattern?: RegExp | null;
    /** Delay (ms) before sending this step. Default: 1500 */
    delayMs?: number;
}

export interface CodeRequestResult {
    success: boolean;
    code?: string;
    error?: string;
    rawMessages?: string[];
}

// ==========================================
// Singleton Client Management
// ==========================================

let _client: TelegramClient | null = null;
let _clientConfig: string | null = null; // track which session is active

/**
 * Get or create a connected TelegramClient instance.
 * Reuses the same client if the session hasn't changed.
 */
export async function getClient(config: TelegramSessionConfig): Promise<TelegramClient> {
    const configKey = `${config.apiId}:${config.sessionString.substring(0, 20)}`;
    
    if (_client && _clientConfig === configKey && _client.connected) {
        return _client;
    }

    // Disconnect old client if exists
    if (_client) {
        try { await _client.disconnect(); } catch {}
        _client = null;
        _clientConfig = null;
    }

    const session = new StringSession(config.sessionString);
    const client = new TelegramClient(session, config.apiId, config.apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        autoReconnect: true,
    });

    await client.connect();

    if (!await client.checkAuthorization()) {
        throw new Error('Telegram session is not authorized. Please re-authenticate.');
    }

    _client = client;
    _clientConfig = configKey;

    console.log('[TelegramUserBot] Connected successfully');
    return client;
}

/**
 * Disconnect the singleton client
 */
export async function disconnectClient(): Promise<void> {
    if (_client) {
        try { await _client.disconnect(); } catch {}
        _client = null;
        _clientConfig = null;
    }
}

/**
 * Extract a numeric verification code from a message text.
 */
export function extractCodeFromMessage(text: string): string | null {
    if (!text) return null;
    
    const patterns = [
        /c[oó]digo[^:]*:\s*(\d{4,8})/i,
        /code[^:]*:\s*(\d{4,8})/i,
        /verification[^:]*:\s*(\d{4,8})/i,
        /verificaci[oó]n[^:]*:\s*(\d{4,8})/i,
        /🔐[^0-9]*(\d{4,8})/,
        /^\s*(\d{4,8})\s*$/m,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

/**
 * Send a sequence of messages/clicks to a Telegram bot and wait for the verification code.
 * 
 * Uses a simple sequential approach with fixed delays between steps,
 * then polls for the code message at the end.
 */
export async function requestCodeFromBot(
    client: TelegramClient,
    botUsername: string,
    steps: BotFlowStep[],
    timeoutMs: number = 180_000,
): Promise<CodeRequestResult> {
    const collectedMessages: string[] = [];
    
    let botEntity: Api.User;
    try {
        const entity = await client.getEntity(botUsername);
        if (!(entity instanceof Api.User)) {
            return { success: false, error: `${botUsername} no es un usuario/bot válido` };
        }
        botEntity = entity;
    } catch (err: any) {
        return { success: false, error: `No se pudo encontrar al bot ${botUsername}: ${err.message}` };
    }

    // Helper: click an inline button in recent messages
    const clickButton = async (buttonText: string): Promise<boolean> => {
        const messages = await client.getMessages(botEntity, { limit: 5 });
        const searchText = buttonText.toLowerCase();
        
        for (const msg of messages) {
            if (!msg?.replyMarkup || !('rows' in msg.replyMarkup)) continue;
            const rows = (msg.replyMarkup as any).rows || [];
            for (let i = 0; i < rows.length; i++) {
                const buttons = rows[i].buttons || [];
                for (let j = 0; j < buttons.length; j++) {
                    if (buttons[j].text?.toLowerCase().includes(searchText)) {
                        console.log(`[TelegramUserBot] Clicking "${buttons[j].text}" [${i},${j}]`);
                        await Promise.race([
                            (msg as any).click(i, j).catch((e: any) => {
                                console.log(`[TelegramUserBot] click() result: ${e?.message || 'ok'}`);
                            }),
                            new Promise(r => setTimeout(r, 5000)),
                        ]);
                        return true;
                    }
                }
            }
        }
        return false;
    };

    // Helper: get the latest bot message text
    const getLatestBotMessage = async (): Promise<string | null> => {
        const messages = await client.getMessages(botEntity, { limit: 3 });
        for (const msg of messages) {
            if (msg && !msg.out && msg.text) return msg.text;
        }
        return null;
    };

    // Execute each step sequentially
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const delay = step.delayMs ?? 1500;
        await new Promise(r => setTimeout(r, delay));

        if (step.clickButtonText) {
            console.log(`[TelegramUserBot] Step ${i + 1}/${steps.length}: clicking "${step.clickButtonText}"`);
            const clicked = await clickButton(step.clickButtonText);
            if (!clicked) {
                console.log(`[TelegramUserBot] Button not found, sending text as fallback`);
                await client.sendMessage(botEntity, { message: step.clickButtonText });
            }
        } else if (step.message) {
            console.log(`[TelegramUserBot] Step ${i + 1}/${steps.length}: sending "${step.message}"`);
            await client.sendMessage(botEntity, { message: step.message });
        }
    }

    // After all steps are sent, poll for the verification code
    console.log(`[TelegramUserBot] All steps sent — polling for code...`);
    const pollStart = Date.now();
    const pollInterval = 3000;
    
    while (Date.now() - pollStart < timeoutMs) {
        await new Promise(r => setTimeout(r, pollInterval));

        // Get last few messages from bot
        const messages = await client.getMessages(botEntity, { limit: 5 });
        for (const msg of messages) {
            if (!msg || msg.out || !msg.text) continue;
            const text = msg.text;
            if (!collectedMessages.includes(text)) {
                collectedMessages.push(text);
            }
            const code = extractCodeFromMessage(text);
            if (code) {
                console.log(`[TelegramUserBot] ✅ Code found: ${code}`);
                return { success: true, code, rawMessages: collectedMessages };
            }
        }
    }

    const lastMsg = await getLatestBotMessage();
    return {
        success: false,
        error: `Timeout sin código. Último mensaje del bot: "${lastMsg?.substring(0, 200) || 'ninguno'}"`,
        rawMessages: collectedMessages,
    };
}

// ==========================================
// Flow Builders
// ==========================================

/**
 * Build the flow for @autocodestream_bot
 * 
 * Real flow:
 * 1. Send /start
 * 2. Bot shows buttons → click "Soy administrador"
 * 3. Bot sends warning + "dime tu usuario" → send username
 * 4. Bot confirms → asks for email → send email
 * 5. Bot sends the code
 */
export function buildAutocodeStreamFlow(
    userIdentifier: string,
    accountEmail: string,
): BotFlowStep[] {
    return [
        {
            message: '/start',
            waitForPattern: /continuar|asistente|verificaci[oó]n|hola/i,
            delayMs: 500,
        },
        {
            clickButtonText: 'Soy cliente',
            waitForPattern: /usuario|perfil|dime tu/i,
            delayMs: 2000,
        },
        {
            message: userIdentifier,
            waitForPattern: /correo|email|confirmad/i,
            delayMs: 1500,
        },
        {
            message: accountEmail,
            waitForPattern: /verificad|esperando|c[oó]digo|listo/i,
            delayMs: 1500,
        },
    ];
}

/**
 * Generic flow builder for bots with /start → identifier → email pattern.
 */
export function buildGenericBotFlow(
    userIdentifier: string,
    accountEmail: string,
): BotFlowStep[] {
    return [
        { message: '/start', delayMs: 500 },
        { message: userIdentifier, delayMs: 2500 },
        { message: accountEmail, delayMs: 2500 },
    ];
}


