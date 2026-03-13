/**
 * Telegram Bot Integration for ClickPar
 * Bot: @clickpar_admin_bot
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ==========================================
// Types
// ==========================================

export interface TelegramUser {
    id: number;
    first_name: string;
    username?: string;
}

export interface TelegramMessage {
    message_id: number;
    from: TelegramUser;
    chat: { id: number; type: string };
    text?: string;
}

export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message: TelegramMessage;
    data?: string;
}

export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface InlineButton {
    text: string;
    callback_data: string;
}

// ==========================================
// Auth
// ==========================================

/**
 * Check if a Telegram user ID is in the whitelist
 */
export function isAllowed(userId: number): boolean {
    if (ALLOWED_IDS.length === 0) return false;
    return ALLOWED_IDS.includes(String(userId));
}

// ==========================================
// Send Messages
// ==========================================

/**
 * Send a text message to a Telegram chat
 */
export async function sendMessage(
    chatId: number,
    text: string,
    options?: {
        parseMode?: 'Markdown' | 'HTML';
        buttons?: InlineButton[][];
        disablePreview?: boolean;
    }
): Promise<boolean> {
    try {
        const body: Record<string, unknown> = {
            chat_id: chatId,
            text,
            parse_mode: options?.parseMode ?? 'Markdown',
            disable_web_page_preview: options?.disablePreview ?? true,
        };

        if (options?.buttons && options.buttons.length > 0) {
            body.reply_markup = {
                inline_keyboard: options.buttons.map(row =>
                    row.map(btn => ({
                        text: btn.text,
                        callback_data: btn.callback_data,
                    }))
                ),
            };
        }

        const res = await fetch(`${TG_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        return res.ok;
    } catch (err) {
        console.error('[Telegram] sendMessage error:', err);
        return false;
    }
}

/**
 * Answer a callback query (acknowledge the button press to stop the loading spinner)
 */
export async function answerCallback(
    callbackQueryId: string,
    text?: string
): Promise<boolean> {
    try {
        const res = await fetch(`${TG_API}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text || '',
                show_alert: false,
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Edit an existing message (for updates inline)
 */
export async function editMessage(
    chatId: number,
    messageId: number,
    text: string,
    buttons?: InlineButton[][]
): Promise<boolean> {
    try {
        const body: Record<string, unknown> = {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
        };

        if (buttons) {
            body.reply_markup = {
                inline_keyboard: buttons.map(row =>
                    row.map(btn => ({
                        text: btn.text,
                        callback_data: btn.callback_data,
                    }))
                ),
            };
        }

        const res = await fetch(`${TG_API}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ==========================================
// Formatters
// ==========================================

/**
 * Format a number as Guaraníes
 */
export function formatGs(amount: number): string {
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

/**
 * Format a date string to dd/mm/yyyy
 */
export function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Sin fecha';
    try {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

/**
 * Calculate days until a date (negative = already passed)
 */
export function daysUntil(dateStr: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T12:00:00');
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
}

/**
 * Escape special Markdown characters
 */
export function esc(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ==========================================
// Main Menu
// ==========================================

export function mainMenuText(firstName: string): string {
    return (
        `👋 Hola *${firstName}*\\! Soy el bot de *ClickPar*\\.\n\n` +
        `¿Qué querés hacer?`
    );
}

export const MAIN_MENU_BUTTONS: InlineButton[][] = [
    [
        { text: '📦 Inventario', callback_data: 'cmd:inventario' },
        { text: '📅 Vencimientos', callback_data: 'cmd:vencimientos' },
    ],
    [
        { text: '👤 Buscar cliente', callback_data: 'cmd:clientes' },
        { text: '➕ Nuevo cliente', callback_data: 'cmd:nuevo_cliente' },
    ],
    [
        { text: '💰 Vender', callback_data: 'cmd:vender' },
        { text: '📊 Resumen del día', callback_data: 'cmd:ventas' },
    ],
];
