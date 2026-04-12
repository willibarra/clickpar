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
 * Send a sequence of messages to a Telegram bot and wait for the verification code.
 * 
 * Supports both text messages and inline button clicks via `clickButtonText`.
 * Uses `waitForPattern` to handle bots that send multiple messages per step.
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

        // Track last message ID for button clicking
        let lastMsgId: number | null = null;

        // Helper to execute a step
        const executeStep = async (step: BotFlowStep) => {
            const delay = step.delayMs ?? 1500;
            await new Promise(r => setTimeout(r, delay));
            
            // If step wants to click an inline button
            if (step.clickButtonText) {
                console.log(`[TelegramUserBot] Step ${stepIndex + 1}/${steps.length}: clicking button "${step.clickButtonText}"`);
                
                // Re-fetch the last message to get its replyMarkup
                if (lastMsgId) {
                    try {
                        const msgs = await client.getMessages(botEntity, { ids: [lastMsgId] });
                        const msg = msgs?.[0];
                        if (msg?.replyMarkup) {
                            const searchText = step.clickButtonText.toLowerCase();
                            const markup = msg.replyMarkup;
                            
                            // Search for the button in inline markup
                            if ('rows' in markup) {
                                for (const row of (markup as any).rows || []) {
                                    for (const button of row.buttons || []) {
                                        if (button.text?.toLowerCase().includes(searchText) && button.data) {
                                            console.log(`[TelegramUserBot] Found button "${button.text}", sending callback...`);
                                            
                                            // Fire callback with 3s timeout — don't wait for bot's answer popup
                                            const callbackPromise = client.invoke(
                                                new Api.messages.GetBotCallbackAnswer({
                                                    peer: msg.peerId!,
                                                    msgId: msg.id,
                                                    data: button.data,
                                                })
                                            );
                                            
                                            // Race: either callback completes or we timeout after 3s
                                            // Either way, the callback DATA was sent to Telegram servers
                                            await Promise.race([
                                                callbackPromise.catch(() => {}),
                                                new Promise(r => setTimeout(r, 3000)),
                                            ]);
                                            
                                            console.log(`[TelegramUserBot] Callback sent successfully`);
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err: any) {
                        console.log(`[TelegramUserBot] Error fetching message for button: ${err.message}`);
                    }
                }
                
                // Fallback: send button text as message (probably won't work but try)
                console.log(`[TelegramUserBot] Fallback: sending button text as message`);
                await client.sendMessage(botEntity, { message: step.clickButtonText });
                return;
            }
            
            // Regular text message
            if (step.message) {
                console.log(`[TelegramUserBot] Step ${stepIndex + 1}/${steps.length}: sending "${step.message}"`);
                await client.sendMessage(botEntity, { message: step.message });
            }
        };

        const event = new NewMessage({
            chats: [botEntity],
            incoming: true,
        });

        const handler = async (eventData: any) => {
            const msg = eventData.message;
            if (!msg?.text) return;
            
            const text = msg.text;
            collectedMessages.push(text);
            lastMsgId = msg.id; // Store for button clicking
            
            console.log(`[TelegramUserBot] Bot reply (step ${stepIndex}): ${text.substring(0, 200)}`);
            
            // Always try to extract code
            const code = extractCodeFromMessage(text);
            if (code) {
                console.log(`[TelegramUserBot] ✅ Code found: ${code}`);
                done({ success: true, code });
                return;
            }

            // Check for error messages (but not "Importante" warnings)
            if (/error|denied|acceso denegado|no autorizado|failed|bloqueado/i.test(text) &&
                !/importante|antes de/i.test(text)) {
                done({ success: false, error: `Bot respondió con error: ${text.substring(0, 200)}` });
                return;
            }

            // Check waitForPattern
            const currentStep = steps[stepIndex];
            if (currentStep?.waitForPattern) {
                if (!currentStep.waitForPattern.test(text)) {
                    console.log(`[TelegramUserBot] Intermediate message, waiting for pattern...`);
                    return;
                }
            }
            
            // Pattern matched — advance and execute next step
            stepIndex++;
            if (stepIndex < steps.length) {
                try {
                    await executeStep(steps[stepIndex]);
                } catch (err: any) {
                    done({ success: false, error: `Error en paso ${stepIndex + 1}: ${err.message}` });
                }
            }
        };

        client.addEventHandler(handler, event);

        const timeoutHandle = setTimeout(() => {
            done({
                success: false,
                error: `Timeout: no se recibió código después de ${Math.round(timeoutMs / 1000)}s`,
            });
        }, timeoutMs);

        // Send the first step
        try {
            await executeStep(steps[0]);
        } catch (err: any) {
            done({ success: false, error: `Error al iniciar: ${err.message}` });
        }
    });
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


