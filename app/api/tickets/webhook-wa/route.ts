import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendText, sendTicketConfirmation, sendStaffTicketAlert } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

// In-memory session store for WA ticket flow (keyed by phone number)
// Structure: { phone: { step: 'menu' | 'done', timestamp: number } }
const sessions: Record<string, { step: string; timestamp: number }> = {};

// Keywords that trigger the support menu
const TRIGGER_KEYWORDS = [
    'problema', 'help', 'ayuda', 'no funciona', 'no conecta',
    'error', 'falla', 'caído', 'caido', 'soporte', 'ticket',
];

const TICKET_OPTIONS: Record<string, { tipo: string; label: string }> = {
    '1': { tipo: 'no_conecta', label: 'No conecta / No carga' },
    '2': { tipo: 'cambio_correo', label: 'Cambio de correo' },
    '3': { tipo: 'pin_olvidado', label: 'PIN olvidado' },
    '4': { tipo: 'otro', label: 'Otro problema' },
};

const MENU_MESSAGE = `🆘 *Soporte ClickPar*

¿Cuál es tu problema?

*1* - No conecta / No carga
*2* - Cambio de correo
*3* - PIN olvidado
*4* - Otro problema

Respondé con el número de tu opción.`;

// POST /api/tickets/webhook-wa — Evolution API webhook
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Evolution API webhook payload structure
        const event = body.event;
        const data = body.data;

        // Only handle incoming messages
        if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
            return NextResponse.json({ ok: true });
        }

        const message = data?.message || data?.messages?.[0];
        if (!message) return NextResponse.json({ ok: true });

        // Skip messages from self / groups / status
        if (message.key?.fromMe) return NextResponse.json({ ok: true });
        if (message.key?.remoteJid?.endsWith('@g.us')) return NextResponse.json({ ok: true });
        if (message.key?.remoteJid === 'status@broadcast') return NextResponse.json({ ok: true });

        // Extract phone number (remove @s.whatsapp.net suffix)
        const rawJid = message.key?.remoteJid || '';
        const phoneRaw = rawJid.replace('@s.whatsapp.net', '');
        const phone = normalizePhone(phoneRaw);

        // Extract message text
        const text = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            ''
        ).trim().toLowerCase();

        if (!text || !phone) return NextResponse.json({ ok: true });

        const admin = await createAdminClient();

        // Check if we have an active session for this phone
        const session = sessions[phone];
        const now = Date.now();
        const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

        // Clean expired session
        if (session && now - session.timestamp > SESSION_TTL) {
            delete sessions[phone];
        }

        const activeSession = sessions[phone];

        // ── Step 2: User is responding to the menu ──
        if (activeSession?.step === 'menu') {
            const choice = text.trim();
            const option = TICKET_OPTIONS[choice];

            if (!option) {
                // Invalid choice, remind them
                await sendText(phone, `Por favor respondé con *1*, *2*, *3* o *4* según tu problema.`, {
                    skipRateLimiting: true,
                    templateKey: 'ticket_menu',
                });
                return NextResponse.json({ ok: true });
            }

            // Find customer by phone
            const { data: profile } = await (admin.from('profiles') as any)
                .select('id, full_name, phone_number')
                .eq('phone_number', phone)
                .single();

            // Find their active subscription
            let subscription_id: string | null = null;
            let mother_account_id: string | null = null;
            let platformInfo = '';

            if (profile) {
                const { data: sub } = await (admin.from('subscriptions') as any)
                    .select('id, slot:sale_slots(slot_identifier, mother:mother_accounts(id, platform))')
                    .eq('customer_id', profile.id)
                    .eq('is_active', true)
                    .order('end_date', { ascending: false })
                    .limit(1)
                    .single();

                if (sub) {
                    subscription_id = sub.id;
                    mother_account_id = sub.slot?.mother?.id || null;
                    const platform = sub.slot?.mother?.platform || '';
                    const slot = sub.slot?.slot_identifier || '';
                    platformInfo = platform ? `${platform}${slot ? ` - ${slot}` : ''}` : '';
                }
            }

            // Create ticket
            const { data: ticket, error } = await (admin.from('support_tickets') as any)
                .insert({
                    customer_id: profile?.id || null,
                    subscription_id,
                    mother_account_id,
                    tipo: option.tipo,
                    descripcion: `Reportado vía WhatsApp (${option.label})`,
                    estado: 'abierto',
                    canal_origen: 'whatsapp',
                })
                .select()
                .single();

            if (error) {
                console.error('[WA Ticket] Error creating ticket:', error);
                await sendText(phone, `❌ Hubo un error al crear tu ticket. Intentá de nuevo más tarde.`, {
                    skipRateLimiting: true,
                });
                delete sessions[phone];
                return NextResponse.json({ ok: true });
            }

            const ticketId = ticket.id.slice(0, 8).toUpperCase();

            // Confirm to customer
            await sendTicketConfirmation({
                customerPhone: phone,
                customerName: profile?.full_name || 'Cliente',
                ticketId,
            });

            // Notify staff
            sendStaffTicketAlert({
                ticketId,
                customerName: profile?.full_name || `+${phone}`,
                customerPhone: phone,
                platform: platformInfo,
                tipo: option.tipo,
                descripcion: `Reportado vía WhatsApp: ${option.label}`,
                canal: 'whatsapp',
            }).catch(console.error);

            // Clear session
            delete sessions[phone];

            return NextResponse.json({ ok: true });
        }

        // ── Step 1: Check if message contains a trigger keyword ──
        const hasTrigger = TRIGGER_KEYWORDS.some(kw => text.includes(kw));

        if (hasTrigger) {
            // Start session
            sessions[phone] = { step: 'menu', timestamp: now };

            await sendText(phone, MENU_MESSAGE, {
                skipRateLimiting: true,
                templateKey: 'ticket_menu',
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[WA Ticket Webhook]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
