import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addNoteToLead, createVentaLead, refreshKommoToken } from '@/lib/kommo';
import { sendPreExpiryReminder, sendExpiryNotification, getWhatsAppSettings } from '@/lib/whatsapp';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Secret to protect the cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

/**
 * Attempt to auto-refresh the Kommo access token.
 * Saves new tokens to a `kommo_tokens` table if available,
 * and updates process.env for the current execution.
 */
async function ensureFreshToken() {
    try {
        // Check if current token is expired by decoding JWT payload
        const token = process.env.KOMMO_ACCESS_TOKEN;
        if (token) {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const expiresAt = payload.exp * 1000;
            const now = Date.now();
            // Refresh if less than 2 hours remaining
            if (expiresAt - now > 2 * 60 * 60 * 1000) {
                return; // Token still valid
            }
        }

        console.log('[Cron] Token expiring soon, refreshing...');
        const newTokens = await refreshKommoToken();
        if (newTokens) {
            // Update process.env for this execution
            process.env.KOMMO_ACCESS_TOKEN = newTokens.access_token;
            process.env.KOMMO_REFRESH_TOKEN = newTokens.refresh_token;

            // Persist to DB so next execution uses fresh tokens
            await supabase.from('kommo_tokens' as any).upsert({
                id: 'default',
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            console.log('[Cron] Token refreshed successfully');
        }
    } catch (e) {
        console.error('[Cron] Token refresh failed:', e);
    }
}

/**
 * GET /api/cron/expiration-alerts
 * 
 * Automated endpoint that checks for expiring services and sends
 * WhatsApp notifications via Kommo.
 * 
 * Schedule (via VPS cron):
 *   - 1 day before: reminder
 *   - Day of expiration: urgent reminder
 *   - 1 day after: last chance
 *   - 2 days after: cancellation notice
 * 
 * Call with: curl "https://your-domain/api/cron/expiration-alerts?secret=clickpar-cron-2024"
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Auto-refresh Kommo token if needed
        await ensureFreshToken();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results = {
            reminder_1day: [] as string[],
            reminder_today: [] as string[],
            reminder_1day_after: [] as string[],
            cancelled_2days_after: [] as string[],
            errors: [] as string[],
        };

        // Calculate date ranges
        const todayStr = formatDate(today);
        const tomorrowStr = formatDate(addDays(today, 1));
        const yesterdayStr = formatDate(addDays(today, -1));
        const twoDaysAgoStr = formatDate(addDays(today, -2));

        // Load WhatsApp settings once
        let waSettings;
        try {
            waSettings = await getWhatsAppSettings();
        } catch { waSettings = null; }

        const batchInterval = (waSettings?.batch_send_interval_seconds || 30) * 1000;
        let messagesSentCount = 0;

        // Helper: wait between batch messages
        const batchDelay = async () => {
            if (messagesSentCount > 0) {
                await new Promise(r => setTimeout(r, batchInterval));
            }
            messagesSentCount++;
        };

        // ================================================
        // 1. Sales expiring TOMORROW (1 day before)
        // ================================================
        const { data: expTomorrow } = await supabase
            .from('sales' as any)
            .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform))')
            .eq('is_active', true)
            .eq('end_date', tomorrowStr);

        for (const sale of (expTomorrow || []) as any[]) {
            const customer = sale.customers;
            const slot = sale.sale_slots;
            const platform = slot?.mother_accounts?.platform || 'Servicio';
            const phone = customer?.phone;
            const name = customer?.full_name || 'Cliente';

            if (!phone) continue;

            try {
                await sendKommoMessage(phone, name,
                    `⏰ *Recordatorio de Vencimiento*\n\n` +
                    `Hola ${name}, tu servicio de *${platform}* vence *mañana* (${tomorrowStr}).\n\n` +
                    `💰 Renovación: Gs. ${(sale.amount_gs || 0).toLocaleString()}\n\n` +
                    `Escribinos para renovar y seguir disfrutando del servicio 🙌`
                );
                results.reminder_1day.push(`${name} - ${platform}`);
            } catch (e: any) {
                results.errors.push(`1day-kommo: ${name} - ${e.message}`);
            }

            // WhatsApp directo (pre-vencimiento)
            if (waSettings?.auto_send_pre_expiry) {
                try {
                    await batchDelay();
                    await sendPreExpiryReminder({
                        customerPhone: phone,
                        customerName: name,
                        platform,
                        expirationDate: tomorrowStr,
                        daysRemaining: 1,
                        price: (sale.amount_gs || 0).toLocaleString(),
                        customerId: sale.customer_id,
                        saleId: sale.id,
                        instanceName: sale.whatsapp_instance || undefined,
                    });
                } catch (e: any) {
                    results.errors.push(`1day-wa: ${name} - ${e.message}`);
                }
            }
        }

        // ================================================
        // 2. Sales expiring TODAY
        // ================================================
        const { data: expToday } = await supabase
            .from('sales' as any)
            .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform))')
            .eq('is_active', true)
            .eq('end_date', todayStr);

        for (const sale of (expToday || []) as any[]) {
            const customer = sale.customers;
            const slot = sale.sale_slots;
            const platform = slot?.mother_accounts?.platform || 'Servicio';
            const phone = customer?.phone;
            const name = customer?.full_name || 'Cliente';

            if (!phone) continue;

            try {
                await sendKommoMessage(phone, name,
                    `🔴 *Tu servicio vence HOY*\n\n` +
                    `Hola ${name}, tu servicio de *${platform}* vence *hoy* (${todayStr}).\n\n` +
                    `💰 Renovación: Gs. ${(sale.amount_gs || 0).toLocaleString()}\n\n` +
                    `Si no renovás hoy, mañana se suspenderá tu acceso.\n` +
                    `Escribinos ahora para renovar ✅`
                );
                results.reminder_today.push(`${name} - ${platform}`);
            } catch (e: any) {
                results.errors.push(`today-kommo: ${name} - ${e.message}`);
            }

            // WhatsApp directo (vencimiento hoy)
            if (waSettings?.auto_send_expiry) {
                try {
                    await batchDelay();
                    await sendExpiryNotification({
                        customerPhone: phone,
                        customerName: name,
                        platform,
                        price: (sale.amount_gs || 0).toLocaleString(),
                        customerId: sale.customer_id,
                        saleId: sale.id,
                        instanceName: sale.whatsapp_instance || undefined,
                    });
                } catch (e: any) {
                    results.errors.push(`today-wa: ${name} - ${e.message}`);
                }
            }
        }

        // ================================================
        // 3. Sales expired YESTERDAY (1 day after)
        // ================================================
        const { data: expYesterday } = await supabase
            .from('sales' as any)
            .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform))')
            .eq('is_active', true)
            .eq('end_date', yesterdayStr);

        for (const sale of (expYesterday || []) as any[]) {
            const customer = sale.customers;
            const slot = sale.sale_slots;
            const platform = slot?.mother_accounts?.platform || 'Servicio';
            const phone = customer?.phone;
            const name = customer?.full_name || 'Cliente';

            if (!phone) continue;

            try {
                await sendKommoMessage(phone, name,
                    `⚠️ *Servicio vencido*\n\n` +
                    `Hola ${name}, tu servicio de *${platform}* *venció ayer* (${yesterdayStr}).\n\n` +
                    `Es tu última oportunidad para renovar antes de que se cancele definitivamente.\n\n` +
                    `💰 Renovación: Gs. ${(sale.amount_gs || 0).toLocaleString()}\n` +
                    `Escribinos para renovar 📲`
                );
                results.reminder_1day_after.push(`${name} - ${platform}`);
            } catch (e: any) {
                results.errors.push(`1dayAfter: ${name} - ${e.message}`);
            }
        }

        // ================================================
        // 4. Sales expired 2 DAYS AGO → CANCEL
        // ================================================
        const { data: expTwoDays } = await supabase
            .from('sales' as any)
            .select('id, amount_gs, end_date, customer_id, slot_id, customers:customer_id(full_name, phone), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, id))')
            .eq('is_active', true)
            .eq('end_date', twoDaysAgoStr);

        for (const sale of (expTwoDays || []) as any[]) {
            const customer = sale.customers;
            const slot = sale.sale_slots;
            const platform = slot?.mother_accounts?.platform || 'Servicio';
            const phone = customer?.phone;
            const name = customer?.full_name || 'Cliente';

            // Deactivate the sale
            await supabase
                .from('sales' as any)
                .update({ is_active: false })
                .eq('id', sale.id);

            // Free up the slot
            if (sale.slot_id) {
                await supabase
                    .from('sale_slots')
                    .update({ status: 'available' })
                    .eq('id', sale.slot_id);
            }

            if (!phone) continue;

            try {
                await sendKommoMessage(phone, name,
                    `❌ *Servicio cancelado*\n\n` +
                    `Hola ${name}, tu servicio de *${platform}* fue cancelado por falta de pago.\n\n` +
                    `Si querés reactivar tu cuenta, escribinos y con gusto te ayudamos 🤝`
                );
                results.cancelled_2days_after.push(`${name} - ${platform}`);
            } catch (e: any) {
                results.errors.push(`cancel: ${name} - ${e.message}`);
            }
        }

        // Log results as notification
        const totalSent = results.reminder_1day.length + results.reminder_today.length +
            results.reminder_1day_after.length + results.cancelled_2days_after.length;

        if (totalSent > 0) {
            await supabase.from('notifications' as any).insert({
                type: 'expiration_cron',
                message: `📬 Avisos de vencimiento enviados: ${results.reminder_1day.length} (mañana) + ${results.reminder_today.length} (hoy) + ${results.reminder_1day_after.length} (ayer) + ${results.cancelled_2days_after.length} (cancelados)`,
                is_read: false,
            });
        }

        return NextResponse.json({
            success: true,
            date: todayStr,
            summary: {
                reminder_1day_before: results.reminder_1day.length,
                reminder_today: results.reminder_today.length,
                reminder_1day_after: results.reminder_1day_after.length,
                cancelled: results.cancelled_2days_after.length,
                total_sent: totalSent,
            },
            details: results,
        });
    } catch (error: any) {
        console.error('[Cron Expiration] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ==========================================
// Helpers
// ==========================================

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Send a notification via Kommo by creating a lead with the message as a note.
 * This creates a visible item in the Kommo pipeline that staff can follow up on.
 * If the contact already has a chat via WhatsApp Lite, the Salesbot can be
 * configured to send the message automatically.
 */
async function sendKommoMessage(phone: string, name: string, message: string) {
    // Create a lead in the Ventas pipeline with the renewal info
    const lead = await createVentaLead({
        platform: 'Renovación',
        customerPhone: phone,
        customerName: name,
        price: 0,
        statusKey: 'INCOMING',
    });

    if (lead.leadId) {
        await addNoteToLead(lead.leadId, message);
    } else if (lead.error) {
        throw new Error(lead.error);
    }
}

