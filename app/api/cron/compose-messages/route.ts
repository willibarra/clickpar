import { NextRequest, NextResponse } from 'next/server';
import {
    verifyCronSecret,
    getQueueSupabase,
    getMessageTypeConfig,
    formatDate,
    todayMidnight,
    MessageQueueRow,
} from '@/lib/queue-helpers';
import {
    getWhatsAppSettings,
    getRenderedTemplate,
    sendRenewalToN8N,
    isPhoneWhitelisted,
} from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';



/**
 * POST /api/cron/compose-messages
 *
 * Phase 2 of the message queue pipeline.
 * Reads pending messages and generates message bodies.
 * For WhatsApp: tries N8N AI first, falls back to static template.
 * For Kommo: builds the message text inline.
 */
export async function POST(request: NextRequest) {
    const authError = verifyCronSecret(request);
    if (authError) return authError;

    const supabase = getQueueSupabase();
    const todayStr = formatDate(todayMidnight());

    // Check if AI messages via N8N are enabled
    let useAiMessages = false;
    try {
        const { data: aiConfig } = await supabase
            .from('app_config' as any)
            .select('value')
            .eq('key', 'use_n8n_ai')
            .single();
        useAiMessages = aiConfig?.value === 'true';
    } catch { /* default false */ }

    // Load WhatsApp settings for checking auto-send flags
    let waSettings;
    try {
        waSettings = await getWhatsAppSettings();
    } catch { waSettings = null; }

    // Fetch pending messages
    const { data: pendingRows, error: fetchErr } = await supabase
        .from('message_queue' as any)
        .select('*')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(50);

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const messages = (pendingRows || []) as MessageQueueRow[];
    const results = { composed: 0, sent_via_ai: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const msg of messages) {
        try {
            // Whitelist filter — skip phones not in test list
            if (msg.phone && !await isPhoneWhitelisted(msg.phone)) {
                await supabase
                    .from('message_queue' as any)
                    .update({ status: 'skipped', error: 'Phone not in test whitelist' })
                    .eq('id', msg.id);
                results.skipped++;
                continue;
            }

            if (msg.channel === 'whatsapp') {
                await composeWhatsApp(msg, supabase, useAiMessages, waSettings, results);
            } else if (msg.channel === 'kommo') {
                // Canal kommo desactivado: marcar como skipped
                await supabase
                    .from('message_queue' as any)
                    .update({ status: 'skipped', error: 'Kommo desactivado temporalmente' })
                    .eq('id', msg.id);
                results.skipped++;
            }
        } catch (e: any) {
            results.errors.push(`${msg.id}: ${e.message}`);
            results.failed++;
            await supabase
                .from('message_queue' as any)
                .update({ status: 'failed', error: e.message })
                .eq('id', msg.id);
        }
    }

    return NextResponse.json({
        success: true,
        date: todayStr,
        processed: messages.length,
        results,
    });
}

// =============================================
// WhatsApp compose logic
// =============================================

async function composeWhatsApp(
    msg: MessageQueueRow,
    supabase: ReturnType<typeof getQueueSupabase>,
    useAiMessages: boolean,
    waSettings: any,
    results: { composed: number; sent_via_ai: number; skipped: number; failed: number; errors: string[] },
) {
    const config = getMessageTypeConfig(msg.message_type);

    // Check if auto-send is enabled for this message type
    if (config && waSettings) {
        const flag = config.settingsFlag;
        if (!waSettings[flag]) {
            // Auto-send disabled, skip
            await supabase
                .from('message_queue' as any)
                .update({ status: 'skipped', error: `Auto-send disabled (${flag})` })
                .eq('id', msg.id);
            results.skipped++;
            return;
        }
    }

    // For cancelled messages, there's no static template — compose inline
    if (msg.message_type === 'cancelled') {
        const name = msg.customer_name || 'Cliente';
        const platform = msg.platform || 'Servicio';
        const body = `❌ *Servicio cancelado*\n\nHola ${name}, tu servicio de *${platform}* fue cancelado por falta de pago.\n\nSi querés reactivar tu cuenta, escribinos y con gusto te ayudamos 🤝`;
        await supabase
            .from('message_queue' as any)
            .update({ status: 'composed', message_body: body, compose_method: 'template' })
            .eq('id', msg.id);
        results.composed++;
        return;
    }

    // Try AI via N8N first
    if (useAiMessages && config) {
        try {
            // Fetch sale data for N8N
            const { data: saleData } = await supabase
                .from('sales' as any)
                .select('id, amount_gs, end_date')
                .eq('id', msg.sale_id)
                .single();

            const sent = await sendRenewalToN8N({
                customer: {
                    id: msg.customer_id || '',
                    name: msg.customer_name || 'Cliente',
                    phone: msg.phone || '',
                    whatsapp_instance: msg.instance_name || undefined,
                },
                sale: {
                    id: msg.sale_id || '',
                    platform: msg.platform || 'Servicio',
                    platform_display: msg.platform || 'Servicio',
                    amount_gs: saleData?.amount_gs || 0,
                    end_date: saleData?.end_date || '',
                },
                type: config.n8nType,
                instanceName: msg.instance_name || undefined,
            });

            if (sent) {
                // N8N sends the message itself, mark as sent
                await supabase
                    .from('message_queue' as any)
                    .update({
                        status: 'sent',
                        compose_method: 'ai_n8n',
                        message_body: '[AI via N8N — sent directly]',
                        sent_at: new Date().toISOString(),
                    })
                    .eq('id', msg.id);
                results.sent_via_ai++;
                return;
            }
        } catch (e: any) {
            // Fallback silently to template
            console.warn(`[Compose] N8N failed for ${msg.id}, falling back to template: ${e.message}`);
        }
    }

    // Fallback: static template
    if (config?.templateKey) {
        // We need sale data for template variables
        const { data: saleData } = await supabase
            .from('sales' as any)
            .select('amount_gs, end_date')
            .eq('id', msg.sale_id)
            .single();

        const templateVars: Record<string, string> = {
            nombre: msg.customer_name || 'Cliente',
            plataforma: msg.platform || 'Servicio',
            precio: (saleData?.amount_gs || 0).toLocaleString(),
            fecha_vencimiento: saleData?.end_date || '',
            dias_restantes: msg.message_type === 'pre_expiry' ? '1' : '0',
        };

        const body = await getRenderedTemplate(config.templateKey, templateVars);
        if (body) {
            await supabase
                .from('message_queue' as any)
                .update({ status: 'composed', message_body: body, compose_method: 'template' })
                .eq('id', msg.id);
            results.composed++;
            return;
        }
    }

    // Template not found or rendering failed — build inline
    const { data: saleData } = await supabase
        .from('sales' as any)
        .select('amount_gs, end_date')
        .eq('id', msg.sale_id)
        .single();

    // Fallback: build message inline
    const name = msg.customer_name || 'Cliente';
    const platform = msg.platform || 'Servicio';
    const expDate = saleData?.end_date || '';
    const price = (saleData?.amount_gs || 0).toLocaleString();

    let body = '';
    if (msg.message_type === 'pre_expiry') {
        body = `⏰ *Recordatorio de Vencimiento*\n\nHola ${name}, tu servicio de *${platform}* vence mañana (${expDate}).\n\n💰 Renovación: Gs. ${price}\n\nEscribinos para renovar 🙌`;
    } else if (msg.message_type === 'expiry_today') {
        body = `🔴 *Tu servicio vence HOY*\n\nHola ${name}, tu servicio de *${platform}* vence hoy (${expDate}).\n\n💰 Renovación: Gs. ${price}\n\nEscribinos ahora para renovar ✅`;
    } else if (msg.message_type === 'expired_yesterday') {
        body = `⚠️ *Servicio vencido*\n\nHola ${name}, tu servicio de *${platform}* venció ayer.\n\nÚltima oportunidad para renovar antes de cancelar definitivamente.\n\n💰 Gs. ${price} | Escribinos 📲`;
    } else {
        body = `Hola ${name}, hay una novedad con tu servicio de *${platform}*. Escribinos para más info.`;
    }

    await supabase
        .from('message_queue' as any)
        .update({ status: 'composed', message_body: body, compose_method: 'template' })
        .eq('id', msg.id);
    results.composed++;
}

