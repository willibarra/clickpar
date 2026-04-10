/**
 * Shared helpers for the message queue cron endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// Supabase admin client
// ==========================================

export function getQueueSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// ==========================================
// Auth
// ==========================================

const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

/**
 * Verify cron secret from Authorization header or query param.
 * Returns null if valid, or an error NextResponse if invalid.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
    // Check Authorization: Bearer header first
    const auth = request.headers.get('authorization');
    if (auth) {
        const token = auth.replace('Bearer ', '');
        if (token === CRON_SECRET) return null;
    }

    // Fallback: check ?secret= param
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret === CRON_SECRET) return null;

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// ==========================================
// Date helpers
// ==========================================

export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

export function todayMidnight(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// ==========================================
// Types
// ==========================================

export type MessageType = 'pre_expiry' | 'expiry_today' | 'expired_yesterday' | 'cancelled' | 'manual_reminder';
export type Channel = 'whatsapp' | 'kommo';
export type QueueStatus = 'pending' | 'composed' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface MessageQueueRow {
    id: string;
    customer_id: string | null;
    sale_id: string | null;
    message_type: MessageType;
    channel: Channel;
    phone: string | null;
    customer_name: string | null;
    platform: string | null;
    template_key: string | null;
    message_body: string | null;
    compose_method: string | null;
    status: QueueStatus;
    instance_name: string | null;
    scheduled_at: string;
    sent_at: string | null;
    error: string | null;
    retry_count: number;
    max_retries: number;
    idempotency_key: string;
    created_at: string;
}

// ==========================================
// Message type configuration
// ==========================================

interface MessageTypeConfig {
    templateKey: string;
    settingsFlag: 'auto_send_pre_expiry' | 'auto_send_expiry';
    n8nType: 'pre_expiry' | 'expiry_today' | 'expired_yesterday';
}

const MESSAGE_TYPE_CONFIGS: Record<string, MessageTypeConfig> = {
    pre_expiry: {
        templateKey: 'pre_vencimiento',
        settingsFlag: 'auto_send_pre_expiry',
        n8nType: 'pre_expiry',
    },
    expiry_today: {
        templateKey: 'vencimiento_hoy',
        settingsFlag: 'auto_send_expiry',
        n8nType: 'expiry_today',
    },
    expired_yesterday: {
        templateKey: 'vencimiento_vencido',
        settingsFlag: 'auto_send_expiry',
        n8nType: 'expired_yesterday',
    },
    manual_reminder: {
        templateKey: 'vencimiento_vencido',
        settingsFlag: 'auto_send_expiry',
        n8nType: 'expired_yesterday',
    },
};

export function getMessageTypeConfig(type: string): MessageTypeConfig | null {
    return MESSAGE_TYPE_CONFIGS[type] || null;
}

// ==========================================
// Kommo message text builders
// ==========================================

export function buildKommoMessage(
    type: MessageType,
    name: string,
    displayPlatform: string,
    dateStr: string,
    price: string,
): string {
    switch (type) {
        case 'pre_expiry':
            return (
                `⏰ *Recordatorio de Vencimiento*\n\n` +
                `Hola ${name}, tu servicio de *${displayPlatform}* vence *mañana* (${dateStr}).\n\n` +
                `💰 Renovación: Gs. ${price}\n\n` +
                `Escribinos para renovar y seguir disfrutando del servicio 🙌`
            );
        case 'expiry_today':
            return (
                `🔴 *Tu servicio vence HOY*\n\n` +
                `Hola ${name}, tu servicio de *${displayPlatform}* vence *hoy* (${dateStr}).\n\n` +
                `💰 Renovación: Gs. ${price}\n\n` +
                `Si no renovás hoy, mañana se suspenderá tu acceso.\n` +
                `Escribinos ahora para renovar ✅`
            );
        case 'expired_yesterday':
            return (
                `⚠️ *Recordatorio de Pago*\n\n` +
                `Hola ${name}, te recordamos que el pago de tu servicio de *${displayPlatform}* se encuentra pendiente.\n\n` +
                `💰 Renovación: Gs. ${price}\n\n` +
                `si desea renovar nos decis con que metodo de pago.\n` +
                `de lo contrario si ya no necesita ignorar este mensaje`
            );
        case 'cancelled':
            return (
                `❌ *Servicio cancelado*\n\n` +
                `Hola ${name}, tu servicio de *${displayPlatform}* fue cancelado por falta de pago.\n\n` +
                `Si querés reactivar tu cuenta, escribinos y con gusto te ayudamos 🤝`
            );
        case 'manual_reminder':
            return (
                `⚠️ *Recordatorio de Pago*\n\n` +
                `Hola ${name}, te recordamos que el pago de tu servicio de *${displayPlatform}* se encuentra pendiente.\n\n` +
                `💰 Renovación: Gs. ${price}\n\n` +
                `si desea renovar nos decis con que metodo de pago.\n` +
                `de lo contrario si ya no necesita ignorar este mensaje`
            );
    }
}

/**
 * Generate idempotency key for a queue message.
 */
export function makeIdempotencyKey(
    saleId: string,
    messageType: string,
    channel: string,
    dateStr: string,
): string {
    return `${saleId}:${messageType}:${channel}:${dateStr}`;
}
