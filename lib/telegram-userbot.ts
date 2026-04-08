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
import { NewMessage } from 'telegram/events';

// ==========================================
// Types
// ==========================================

export interface TelegramSessionConfig {
    apiId: number;
    apiHash: string;
    sessionString: string;
}

export interface BotFlowStep {
    /** Message to send to the bot */
    message: string;
    /** 
     * Pattern to match in the bot's reply to know the step succeeded.
     * If null, any reply is accepted.
     */
    expectedPattern?: RegExp | null;
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

// ==========================================
// Code Request Flow
// ==========================================

/**
 * Extract a numeric verification code from a message text.
 * Looks for 4-8 digit numbers that look like verification codes.
 */
export function extractCodeFromMessage(text: string): string | null {
    if (!text) return null;

    // Common patterns for verification codes:
    // "Tu código de verificación es: 301423"
    // "🔐 Tu código es: 301423"
    // "Código: 301423"  
    // Just a standalone 4-8 digit number on its own line
    
    const patterns = [
        /c[oó]digo[^:]*:\s*(\d{4,8})/i,
        /code[^:]*:\s*(\d{4,8})/i,
        /verification[^:]*:\s*(\d{4,8})/i,
        /verificaci[oó]n[^:]*:\s*(\d{4,8})/i,
        /🔐[^0-9]*(\d{4,8})/,
        /^\s*(\d{4,8})\s*$/m,  // standalone number on a line
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Send a sequence of messages to a Telegram bot and wait for the verification code.
 * 
 * This implements the typical flow:
 * 1. /start
 * 2. username (e.g. "will")
 * 3. email
 * 4. Wait for the code message
 * 
 * @param client - Connected TelegramClient
 * @param botUsername - Bot to interact with (e.g. "autocodestream_bot")
 * @param steps - Sequence of messages to send
 * @param timeoutMs - Max time to wait for code (default: 3 min)
 */
export async function requestCodeFromBot(
    client: TelegramClient,
    botUsername: string,
    steps: BotFlowStep[],
    timeoutMs: number = 180_000,
): Promise<CodeRequestResult> {
    const collectedMessages: string[] = [];
    
    // Resolve the bot entity
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

    const botId = botEntity.id.toString();

    return new Promise<CodeRequestResult>(async (resolve) => {
        let resolved = false;
        let stepIndex = 0;

        const cleanup = () => {
            if (handler) {
                try { client.removeEventHandler(handler, event); } catch {}
            }
            if (timeoutHandle) clearTimeout(timeoutHandle);
        };

        const done = (result: CodeRequestResult) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve({ ...result, rawMessages: collectedMessages });
        };

        // Set up message listener
        const event = new NewMessage({
            chats: [botEntity],
            incoming: true,
        });

        const handler = async (eventData: any) => {
            const msg = eventData.message;
            if (!msg?.text) return;
            
            const text = msg.text;
            collectedMessages.push(text);
            
            console.log(`[TelegramUserBot] Bot reply: ${text.substring(0, 200)}`);
            
            // Try to extract code from every message
            const code = extractCodeFromMessage(text);
            if (code) {
                console.log(`[TelegramUserBot] ✅ Code found: ${code}`);
                done({ success: true, code });
                return;
            }

            // If we're still in the step sequence, check if the current step's expected pattern matches
            if (stepIndex < steps.length) {
                const currentStep = steps[stepIndex];
                if (currentStep.expectedPattern) {
                    if (!currentStep.expectedPattern.test(text)) {
                        // Unexpected response — could be an error from the bot
                        if (/error|denied|acceso denegado|no autorizado|failed/i.test(text)) {
                            done({ success: false, error: `Bot respondió con error: ${text.substring(0, 200)}` });
                            return;
                        }
                    }
                }
                
                // Send next step
                stepIndex++;
                if (stepIndex < steps.length) {
                    const nextStep = steps[stepIndex];
                    const delay = nextStep.delayMs ?? 1500;
                    setTimeout(async () => {
                        try {
                            console.log(`[TelegramUserBot] Sending step ${stepIndex + 1}: ${nextStep.message}`);
                            await client.sendMessage(botEntity, { message: nextStep.message });
                        } catch (err: any) {
                            done({ success: false, error: `Error al enviar mensaje: ${err.message}` });
                        }
                    }, delay);
                }
                // If stepIndex >= steps.length, we've sent all steps — just wait for the code
            }
        };

        client.addEventHandler(handler, event);

        // Timeout
        const timeoutHandle = setTimeout(() => {
            done({
                success: false,
                error: `Timeout: no se recibió código después de ${Math.round(timeoutMs / 1000)}s`,
            });
        }, timeoutMs);

        // Send the first step
        try {
            const firstStep = steps[0];
            const firstDelay = firstStep.delayMs ?? 500;
            
            await new Promise(r => setTimeout(r, firstDelay));
            
            console.log(`[TelegramUserBot] Sending step 1: ${firstStep.message}`);
            await client.sendMessage(botEntity, { message: firstStep.message });
        } catch (err: any) {
            done({ success: false, error: `Error al iniciar comunicación con bot: ${err.message}` });
        }
    });
}

// ==========================================
// High-Level: Process a Code Request
// ==========================================

/**
 * Build the standard flow steps for @autocodestream_bot
 * Flow: /start → user → email → wait for code
 */
export function buildAutocodeStreamFlow(
    userIdentifier: string,
    accountEmail: string,
): BotFlowStep[] {
    return [
        {
            message: '/start',
            expectedPattern: /hola|bienvenid|asistente|comenzar|verificaci/i,
            delayMs: 500,
        },
        {
            message: userIdentifier,
            expectedPattern: /confirmad|verificad|usuario/i,
            delayMs: 2000,
        },
        {
            message: accountEmail,
            expectedPattern: /verificad|esperando|código|code/i,
            delayMs: 2000,
        },
        // After sending email, the bot will respond and then eventually send the code.
        // The handler will catch it via extractCodeFromMessage.
    ];
}

/**
 * Generic flow builder that works for most bots with the 
 * standard /start → identifier → email pattern
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
