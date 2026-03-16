/**
 * WhatsApp Integration Service via Evolution API
 * Handles sending messages through configured WhatsApp instances.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

// ==========================================
// Test Whitelist — only these numbers receive automated messages
// Set to empty array [] to disable and send to ALL customers
// ==========================================
const TEST_WHITELIST: string[] = ['595973442773'];

/**
 * Check if a phone number is allowed to receive automated messages.
 * Returns true if whitelist is empty (disabled) or if the phone is in the list.
 */
export function isPhoneWhitelisted(phone: string): boolean {
    if (TEST_WHITELIST.length === 0) return true; // Whitelist disabled
    const normalized = normalizePhone(phone);
    return TEST_WHITELIST.some(w => normalizePhone(w) === normalized);
}

// Untyped supabase client for whatsapp tables (not yet in database.types.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waSupabase(): Promise<any> {
    return await createAdminClient();
}

// ==========================================
// Types
// ==========================================

export type SendMode = 'alternate' | 'instance-1' | 'instance-2';

export interface WhatsAppInstance {
    name: string;
    connected: boolean;
    ownerJid?: string;
    profileName?: string;
    profilePicUrl?: string;
}

export interface WhatsAppSettings {
    send_mode: SendMode;
    instance_1_name: string;
    instance_2_name: string;
    instance_1_alias: string;
    instance_2_alias: string;
    auto_send_credentials: boolean;
    auto_send_pre_expiry: boolean;
    auto_send_expiry: boolean;
    auto_send_credential_change: boolean;
    pre_expiry_days: number;
    batch_send_interval_seconds: number;
}

export interface WhatsAppTemplate {
    id: string;
    key: string;
    name: string;
    message: string;
    enabled: boolean;
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    instanceUsed?: string;
    error?: string;
}

// ==========================================
// Configuration
// ==========================================

const EVO_URL = process.env.EVOLUTION_API_URL || '';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';

function evoHeaders() {
    return {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
    };
}

// ==========================================
// Instance Management
// ==========================================

/**
 * Fetch all instances and their connection status
 */
export async function getInstances(): Promise<WhatsAppInstance[]> {
    try {
        const res = await fetch(`${EVO_URL}/instance/fetchInstances`, {
            headers: evoHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data || []).map((inst: any) => ({
            name: inst.name,
            connected: inst.connectionStatus === 'open',
            ownerJid: inst.ownerJid,
            profileName: inst.profileName,
            profilePicUrl: inst.profilePicUrl,
        }));
    } catch {
        return [];
    }
}

/**
 * Get connection state of a specific instance
 */
export async function getInstanceState(instanceName: string): Promise<'open' | 'close' | 'connecting'> {
    try {
        const res = await fetch(`${EVO_URL}/instance/connectionState/${instanceName}`, {
            headers: evoHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) return 'close';
        const data = await res.json();
        return data?.instance?.state || 'close';
    } catch {
        return 'close';
    }
}

/**
 * Generate QR code for an instance
 */
export async function getInstanceQR(instanceName: string): Promise<string | null> {
    try {
        const res = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, {
            headers: evoHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.base64 || null;
    } catch {
        return null;
    }
}

/**
 * Create a new instance
 */
export async function createInstance(instanceName: string): Promise<{ success: boolean; qrBase64?: string }> {
    try {
        const res = await fetch(`${EVO_URL}/instance/create`, {
            method: 'POST',
            headers: evoHeaders(),
            body: JSON.stringify({
                instanceName,
                integration: 'WHATSAPP-BAILEYS',
                qrcode: true,
            }),
        });
        const data = await res.json();
        return {
            success: res.ok,
            qrBase64: data?.qrcode?.base64,
        };
    } catch {
        return { success: false };
    }
}

/**
 * Disconnect/logout an instance
 */
export async function logoutInstance(instanceName: string): Promise<boolean> {
    try {
        const res = await fetch(`${EVO_URL}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers: evoHeaders(),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ==========================================
// Settings & Templates (Database)
// ==========================================

const DEFAULT_SETTINGS: WhatsAppSettings = {
    send_mode: 'instance-1',
    instance_1_name: 'clickpar-1',
    instance_2_name: 'clickpar-2',
    instance_1_alias: 'Número 1',
    instance_2_alias: 'Número 2',
    auto_send_credentials: true,
    auto_send_pre_expiry: true,
    auto_send_expiry: true,
    auto_send_credential_change: true,
    pre_expiry_days: 3,
    batch_send_interval_seconds: 30,
};

/**
 * Get WhatsApp settings from database
 */
export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
    try {
        const supabase = await waSupabase();
        const { data } = await supabase
            .from('whatsapp_settings')
            .select('*')
            .limit(1)
            .single();
        if (data) return data as WhatsAppSettings;
        return DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

/**
 * Update WhatsApp settings
 */
export async function updateWhatsAppSettings(settings: Partial<WhatsAppSettings>): Promise<boolean> {
    try {
        const supabase = await waSupabase();
        const { data: existing } = await supabase
            .from('whatsapp_settings')
            .select('id')
            .limit(1)
            .single();

        if (existing) {
            const { error } = await supabase
                .from('whatsapp_settings')
                .update({ ...settings, updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            return !error;
        } else {
            const { error } = await supabase
                .from('whatsapp_settings')
                .insert({ ...DEFAULT_SETTINGS, ...settings });
            return !error;
        }
    } catch {
        return false;
    }
}

/**
 * Get all templates
 */
export async function getTemplates(): Promise<WhatsAppTemplate[]> {
    try {
        const supabase = await waSupabase();
        const { data } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .order('key');
        return (data || []) as WhatsAppTemplate[];
    } catch {
        return [];
    }
}

/**
 * Update a template message
 */
export async function updateTemplate(id: string, message: string): Promise<boolean> {
    try {
        const supabase = await waSupabase();
        const { error } = await supabase
            .from('whatsapp_templates')
            .update({ message, updated_at: new Date().toISOString() })
            .eq('id', id);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Toggle template enabled/disabled
 */
export async function toggleTemplate(id: string, enabled: boolean): Promise<boolean> {
    try {
        const supabase = await waSupabase();
        const { error } = await supabase
            .from('whatsapp_templates')
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq('id', id);
        return !error;
    } catch {
        return false;
    }
}

// ==========================================
// Template Rendering
// ==========================================

/**
 * Render a template with variables.
 * Lines that contain a variable that resolves to an empty string are removed entirely
 * (e.g. "🔒 PIN: {pin}" won't appear when there is no PIN).
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
    const emptyKeys = new Set(
        Object.entries(variables)
            .filter(([, v]) => !v)
            .map(([k]) => k)
    );

    return template
        .split('\n')
        .filter(line => {
            // If this line contains a placeholder for an empty variable, drop the line
            for (const key of emptyKeys) {
                if (line.includes(`{${key}}`)) return false;
            }
            return true;
        })
        .map(line => {
            let result = line;
            for (const [key, value] of Object.entries(variables)) {
                result = result.replaceAll(`{${key}}`, value || '');
            }
            return result;
        })
        // Collapse consecutive blank lines into one
        .reduce<string[]>((acc, line) => {
            if (line.trim() === '' && acc.length > 0 && acc[acc.length - 1].trim() === '') {
                return acc; // skip duplicate blank line
            }
            acc.push(line);
            return acc;
        }, [])
        .join('\n')
        .trimEnd();
}

/**
 * Get a specific template by key and render it
 */
export async function getRenderedTemplate(
    templateKey: string,
    variables: Record<string, string>
): Promise<string | null> {
    try {
        const supabase = await waSupabase();
        const { data } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('key', templateKey)
            .eq('enabled', true)
            .single();
        if (!data) return null;
        return renderTemplate(data.message, variables);
    } catch {
        return null;
    }
}

// ==========================================
// Message Sending
// ==========================================

// Simple counter for round-robin (in-memory, resets on restart)
let sendCounter = 0;

/**
 * Check if a specific instance is connected
 */
async function isInstanceConnected(instanceName: string): Promise<boolean> {
    try {
        const state = await getInstanceState(instanceName);
        return state === 'open';
    } catch {
        return false;
    }
}

/**
 * Get the alias for an instance name (human-readable label)
 */
export async function getInstanceAlias(instanceName: string): Promise<string> {
    const settings = await getWhatsAppSettings();
    if (instanceName === settings.instance_1_name) return settings.instance_1_alias || 'Número 1';
    if (instanceName === settings.instance_2_name) return settings.instance_2_alias || 'Número 2';
    return instanceName;
}

/**
 * Determine which instance to use based on settings.
 * If preferred instance is not connected, fallback to the other.
 */
async function pickInstance(preferredInstance?: string): Promise<string> {
    const settings = await getWhatsAppSettings();

    let primary: string;
    let fallback: string;

    if (preferredInstance) {
        // Client has a configured preferred instance → use it, fallback to the other
        primary = preferredInstance;
        fallback = preferredInstance === settings.instance_1_name
            ? settings.instance_2_name
            : settings.instance_1_name;
    } else {
        // No preferred instance → always rotate round-robin between both
        // (send_mode in settings only applies when an explicit instance is requested)
        sendCounter++;
        primary = sendCounter % 2 === 0
            ? settings.instance_1_name
            : settings.instance_2_name;
        fallback = primary === settings.instance_1_name
            ? settings.instance_2_name
            : settings.instance_1_name;
    }

    // Check connectivity, fallback if primary is down
    const primaryConnected = await isInstanceConnected(primary);
    if (primaryConnected) return primary;

    console.warn(`[WhatsApp] Instance ${primary} not connected, falling back to ${fallback}`);
    const fallbackConnected = await isInstanceConnected(fallback);
    if (fallbackConnected) return fallback;

    // Both down, try primary anyway (will fail gracefully)
    console.error(`[WhatsApp] Both instances appear disconnected, trying ${primary} anyway`);
    return primary;
}


/**
 * Format phone number for WhatsApp
 * Accepts: 0973682124, 595973682124, +595973682124
 * Returns: 595973682124
 */
function formatPhone(phone: string): string {
    return normalizePhone(phone);
}

/**
 * Send a text message via WhatsApp
 */
export async function sendText(
    phone: string,
    message: string,
    options?: {
        instanceName?: string;
        templateKey?: string;
        customerId?: string;
        saleId?: string;
    }
): Promise<SendResult> {
    try {
        const instanceName = await pickInstance(options?.instanceName);
        const formattedPhone = formatPhone(phone);

        const res = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: evoHeaders(),
            body: JSON.stringify({
                number: formattedPhone,
                text: message,
            }),
        });

        const data = await res.json();

        // Log the message
        try {
            const supabase = await waSupabase();
            await supabase.from('whatsapp_send_log').insert({
                template_key: options?.templateKey || null,
                phone: formattedPhone,
                message,
                instance_used: instanceName,
                status: res.ok ? 'sent' : 'failed',
                customer_id: options?.customerId || null,
                sale_id: options?.saleId || null,
            });
        } catch {
            // Don't fail if logging fails
        }

        if (res.ok && data?.key?.id) {
            return {
                success: true,
                messageId: data.key.id,
                instanceUsed: instanceName,
            };
        }

        return {
            success: false,
            instanceUsed: instanceName,
            error: data?.response?.message?.[0] || 'Failed to send message',
        };
    } catch (err: any) {
        return {
            success: false,
            error: err.message || 'Network error',
        };
    }
}

// ==========================================
// Platform Nickname Resolution
// ==========================================

/**
 * Returns the first nickname of a platform, or the original name if none.
 * Used to send friendlier names in WhatsApp messages.
 */
export async function getPlatformDisplayName(platformName: string): Promise<string> {
    try {
        const supabase = await waSupabase();
        const { data } = await supabase
            .from('platforms')
            .select('nicknames')
            .eq('name', platformName)
            .eq('is_active', true)
            .single();

        if (data?.nicknames && Array.isArray(data.nicknames) && data.nicknames.length > 0) {
            return data.nicknames[0];
        }
    } catch {
        // Fallback silently
    }
    return platformName;
}

// ==========================================
// High-Level Message Functions
// ==========================================

/**
 * Send sale credentials to customer
 */
export async function sendSaleCredentials(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    email: string;
    password: string;
    profile: string;
    pin?: string;
    expirationDate: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    // Resolve nickname
    const displayName = await getPlatformDisplayName(params.platform);

    const message = await getRenderedTemplate('venta_credenciales', {
        nombre: params.customerName,
        plataforma: displayName,
        email: params.email,
        password: params.password,
        perfil: params.profile,
        pin: params.pin || '',
        fecha_vencimiento: params.expirationDate,
    });

    if (!message) {
        return { success: false, error: 'Template "venta_credenciales" not found or disabled' };
    }

    return sendText(params.customerPhone, message, {
        templateKey: 'venta_credenciales',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}

/**
 * Send family account credentials (we created the account for the customer)
 * Includes email + password for the member account we created
 */
export async function sendFamilyCredentials(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    clientEmail: string;
    clientPassword: string;
    expirationDate: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    const displayName = await getPlatformDisplayName(params.platform);

    // Try template first, fallback to hardcoded message
    const templateMsg = await getRenderedTemplate('familia_credenciales', {
        nombre: params.customerName,
        plataforma: displayName,
        email: params.clientEmail,
        password: params.clientPassword,
        fecha_vencimiento: params.expirationDate,
    });

    const message = templateMsg || [
        `✅ *Tu acceso a ${displayName} (Plan Familiar)*`,
        ``,
        `👤 Hola ${params.customerName}!`,
        `📧 *Correo:* ${params.clientEmail}`,
        `🔑 *Contraseña:* ${params.clientPassword}`,
        `📅 *Vigencia:* ${params.expirationDate}`,
        ``,
        `_Ingresá con estas credenciales a ${displayName}._`,
    ].join('\n');

    return sendText(params.customerPhone, message, {
        templateKey: 'familia_credenciales',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}

/**
 * Send family account invitation notice (customer uses their own account)
 * No password — customer just needs to accept the invitation link/email
 */
export async function sendFamilyInvite(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    clientEmail: string;
    expirationDate: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    const displayName = await getPlatformDisplayName(params.platform);

    const templateMsg = await getRenderedTemplate('familia_invitacion', {
        nombre: params.customerName,
        plataforma: displayName,
        email: params.clientEmail,
        fecha_vencimiento: params.expirationDate,
    });

    const message = templateMsg || [
        `✅ *Acceso a ${displayName} (Plan Familiar)*`,
        ``,
        `👤 Hola ${params.customerName}!`,
        `📧 Hemos enviado una invitación a: *${params.clientEmail}*`,
        ``,
        `⚠️ *Revisá tu correo y aceptá la invitación* para activar tu acceso.`,
        `📅 *Vigencia:* ${params.expirationDate}`,
    ].join('\n');

    return sendText(params.customerPhone, message, {
        templateKey: 'familia_invitacion',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}



/**
 * Send pre-expiry reminder
 */
export async function sendPreExpiryReminder(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    expirationDate: string;
    daysRemaining: number;
    price: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    // Resolve nickname
    const displayName = await getPlatformDisplayName(params.platform);

    const message = await getRenderedTemplate('pre_vencimiento', {
        nombre: params.customerName,
        plataforma: displayName,
        fecha_vencimiento: params.expirationDate,
        dias_restantes: String(params.daysRemaining),
        precio: params.price,
    });

    if (!message) {
        return { success: false, error: 'Template "pre_vencimiento" not found or disabled' };
    }

    return sendText(params.customerPhone, message, {
        templateKey: 'pre_vencimiento',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}

/**
 * Send expiry notification
 */
export async function sendExpiryNotification(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    price: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    // Resolve nickname
    const displayName = await getPlatformDisplayName(params.platform);

    const message = await getRenderedTemplate('vencimiento_hoy', {
        nombre: params.customerName,
        plataforma: displayName,
        precio: params.price,
    });

    if (!message) {
        return { success: false, error: 'Template "vencimiento_hoy" not found or disabled' };
    }

    return sendText(params.customerPhone, message, {
        templateKey: 'vencimiento_hoy',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}

/**
 * Send expired notification (service already past due)
 * Uses template "vencimiento_vencido" → "venció el {fecha}"
 */
export async function sendExpiredNotification(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    expirationDate: string;
    price: string;
    customerId?: string;
    saleId?: string;
    instanceName?: string;
}): Promise<SendResult> {
    const displayName = await getPlatformDisplayName(params.platform);

    const message = await getRenderedTemplate('vencimiento_vencido', {
        nombre: params.customerName,
        plataforma: displayName,
        fecha_vencimiento: params.expirationDate,
        precio: params.price,
    });

    if (!message) {
        return { success: false, error: 'Template "vencimiento_vencido" not found or disabled' };
    }

    return sendText(params.customerPhone, message, {
        templateKey: 'vencimiento_vencido',
        customerId: params.customerId,
        saleId: params.saleId,
        instanceName: params.instanceName,
    });
}


/**
 * Send updated credentials to active users of a mother account
 */
export async function sendCredentialUpdate(params: {
    customerPhone: string;
    customerName: string;
    platform: string;
    email: string;
    password: string;
    profile: string;
    pin?: string;
    customerId?: string;
}): Promise<SendResult> {
    const message = await getRenderedTemplate('credenciales_actualizadas', {
        nombre: params.customerName,
        plataforma: params.platform,
        email: params.email,
        password: params.password,
        perfil: params.profile,
        pin: params.pin || '',
    });

    if (!message) {
        return { success: false, error: 'Template "credenciales_actualizadas" not found or disabled' };
    }

    return sendText(params.customerPhone, message, {
        templateKey: 'credenciales_actualizadas',
        customerId: params.customerId,
    });
}

/**
 * Send credential updates to all active (paid) users of a mother account
 * Returns list of results for each user
 */
export async function notifyAccountCredentialChange(params: {
    motherAccountId: string;
    newEmail: string;
    newPassword: string;
}): Promise<{ sent: SendResult[]; activeSlots: any[]; expiredSlots: any[] }> {
    const supabase = await waSupabase();

    // Get all slots with sales for this mother account
    // Usamos sale_slots con status='sold' y buscamos ventas activas asociadas
    const { data: slots } = await supabase
        .from('sale_slots')
        .select(`
            id,
            slot_identifier,
            pin_code,
            status
        `)
        .eq('mother_account_id', params.motherAccountId)
        .eq('status', 'sold');

    // Get mother account info
    const { data: account } = await supabase
        .from('mother_accounts')
        .select('platform, email')
        .eq('id', params.motherAccountId)
        .single();

    const platform = (account as any)?.platform || 'Plataforma';
    const activeSlots: any[] = [];
    const expiredSlots: any[] = [];
    const sent: SendResult[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!slots || slots.length === 0) return { sent, activeSlots, expiredSlots };

    // Fetch sales for these slots (is_active=true)
    const slotIds = (slots as any[]).map((s: any) => s.id);
    const { data: sales } = await (supabase as any)
        .from('sales')
        .select('id, slot_id, end_date, customer_id')
        .in('slot_id', slotIds)
        .eq('is_active', true);

    // Fetch customer info
    const custIds = [...new Set((sales || []).map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, any>();
    if (custIds.length > 0) {
        const { data: customers } = await (supabase as any)
            .from('customers')
            .select('id, full_name, phone')
            .in('id', custIds);
        (customers || []).forEach((c: any) => custMap.set(c.id, c));
    }

    // Build sale map by slot_id
    const saleBySlot = new Map<string, any>();
    (sales || []).forEach((s: any) => saleBySlot.set(s.slot_id, s));

    for (const slot of (slots || []) as any[]) {
        const sale = saleBySlot.get(slot.id);
        if (!sale) continue;

        const customer = custMap.get(sale.customer_id);
        // Atrasado: end_date existe y ya venció
        const endDate = sale.end_date ? new Date(sale.end_date + 'T00:00:00') : null;
        const isOverdue = endDate !== null && endDate < today;

        if (isOverdue) {
            // Cliente atrasado: NO enviar mensaje
            expiredSlots.push({
                slotId: slot.id,
                slotName: slot.slot_identifier,
                customerName: customer?.full_name || null,
                customerPhone: customer?.phone || null,
                endDate: sale.end_date,
                daysOverdue: endDate ? Math.floor((today.getTime() - endDate.getTime()) / 86400000) : 0,
            });
        } else {
            // Cliente al día: enviar actualización de credenciales
            activeSlots.push({
                slotId: slot.id,
                slotName: slot.slot_identifier,
                customerName: customer?.full_name || null,
                customerPhone: customer?.phone || null,
                endDate: sale.end_date,
            });

            if (customer?.phone) {
                const result = await sendCredentialUpdate({
                    customerPhone: customer.phone,
                    customerName: customer.full_name || 'Cliente',
                    platform,
                    email: params.newEmail,
                    password: params.newPassword,
                    profile: slot.slot_identifier || 'Tu perfil',
                    pin: slot.pin_code || undefined,
                    customerId: customer.id,
                });
                sent.push(result);
            }
        }
    }

    return { sent, activeSlots, expiredSlots };
}

// ==========================================
// N8N Integration - AI Renewal Messages
// ==========================================

const N8N_WEBHOOK_URL = process.env.N8N_RENEWAL_WEBHOOK_URL || '';

export interface RenewalN8NData {
    customer: {
        id: string;
        name: string;
        phone: string;
        whatsapp_instance?: string;
    };
    sale: {
        id: string;
        platform: string;
        platform_display: string;
        amount_gs: number;
        end_date: string;
    };
    type: 'pre_expiry' | 'expiry_today' | 'expired_yesterday';
    instanceName?: string;
}

/**
 * Send renewal data to N8N webhook for AI-powered message generation.
 * N8N will generate a unique message via AI and send it through Evolution API.
 * 
 * Returns true if N8N accepted the webhook, false otherwise.
 * On failure, the caller should fallback to static template messages.
 */
export async function sendRenewalToN8N(data: RenewalN8NData): Promise<boolean> {
    if (!N8N_WEBHOOK_URL) {
        console.warn('[WhatsApp/N8N] N8N_RENEWAL_WEBHOOK_URL not configured, skipping');
        return false;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer: data.customer,
                sale: data.sale,
                type: data.type,
                instanceName: data.instanceName || data.customer.whatsapp_instance,
                timestamp: new Date().toISOString(),
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
            console.log(`[WhatsApp/N8N] Renewal data sent for ${data.customer.name} (${data.type})`);
            return true;
        }

        console.error(`[WhatsApp/N8N] Webhook returned ${res.status}: ${await res.text()}`);
        return false;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.error('[WhatsApp/N8N] Webhook timeout (5s)');
        } else {
            console.error('[WhatsApp/N8N] Webhook error:', err.message);
        }
        return false;
    }
}
