import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';


const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * GET /api/n8n/chatbot-stats
 *
 * Returns aggregate data for the Chatbot dashboard page:
 * - Active conversations (with needs_human flag)
 * - Recent incoming messages
 * - Payment methods for configuration
 * - Global settings
 */
export async function GET(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        // Get conversations (active, escalated, recent)
        const { data: conversations } = await (supabase as any)
            .from('whatsapp_conversations')
            .select(`
                id, phone, last_message_at, last_message,
                turn_count, ai_handled, needs_human, status,
                customer_id, metadata, created_at, updated_at
            `)
            .order('last_message_at', { ascending: false })
            .limit(50);

        // Get conversations needing human attention
        const needsHumanCount = (conversations || []).filter((c: any) => c.needs_human).length;
        const activeCount = (conversations || []).filter((c: any) => c.status === 'active').length;
        const escalatedCount = (conversations || []).filter((c: any) => c.status === 'escalated').length;

        // Get recent incoming messages (all instances)
        const { data: recentMessages } = await (supabase as any)
            .from('whatsapp_incoming_log')
            .select('id, phone, text, received_at, instance_name, n8n_handled, intent, ai_response')
            .order('received_at', { ascending: false })
            .limit(50);

        // Get payment methods
        const { data: paymentMethods } = await (supabase as any)
            .from('payment_methods')
            .select('id, key, name, emoji, instructions, is_active, sort_order')
            .order('sort_order', { ascending: true });

        // Get WhatsApp settings (chatbot on/off, whitelist, etc.)
        const { data: settings } = await (supabase as any)
            .from('whatsapp_settings')
            .select('*')
            .limit(1)
            .single();

        // Get today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMessages = (recentMessages || []).filter(
            (m: any) => new Date(m.received_at) >= today
        ).length;
        const todayAiHandled = (recentMessages || []).filter(
            (m: any) => new Date(m.received_at) >= today && m.n8n_handled
        ).length;

        // Enrich conversations with customer names
        const customerIds = (conversations || [])
            .filter((c: any) => c.customer_id)
            .map((c: any) => c.customer_id);

        let customerMap: Record<string, string> = {};
        if (customerIds.length > 0) {
            const { data: customers } = await (supabase as any)
                .from('customers')
                .select('id, full_name, phone')
                .in('id', customerIds);
            (customers || []).forEach((c: any) => {
                customerMap[c.id] = c.full_name || c.phone;
            });
        }

        const enrichedConversations = (conversations || []).map((c: any) => ({
            ...c,
            customer_name: c.customer_id ? (customerMap[c.customer_id] || null) : null,
        }));

        // Get phone whitelist from app_config
        const { data: whitelistConfig } = await (supabase as any)
            .from('app_config')
            .select('value')
            .eq('key', 'phone_whitelist')
            .single();
        const whitelistRaw: string = (whitelistConfig as any)?.value || '';
        const whitelist_phones: string[] = whitelistRaw
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);

        // Get whitelist enabled flag
        const { data: whitelistEnabledConfig } = await (supabase as any)
            .from('app_config')
            .select('value')
            .eq('key', 'wa_whitelist_enabled')
            .single();
        const whitelist_enabled = (whitelistEnabledConfig as any)?.value === 'true';

        return NextResponse.json({
            stats: {
                total_conversations: (conversations || []).length,
                active: activeCount,
                escalated: escalatedCount,
                needs_human: needsHumanCount,
                today_messages: todayMessages,
                today_ai_handled: todayAiHandled,
            },
            conversations: enrichedConversations,
            recent_messages: recentMessages || [],
            payment_methods: paymentMethods || [],
            settings: settings || { n8n_enabled: false, whitelist_enabled: true },
            whitelist_phones,
            whitelist_enabled,
            webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop'}/api/n8n/incoming-message`,
        });

    } catch (error: any) {
        console.error('[Chatbot Stats] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/n8n/chatbot-stats
 *
 * Update a conversation status (resolve, escalate, etc.)
 * Update a payment method instructions
 */
export async function PATCH(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'resolve-conversation') {
            const { conversation_id } = body;
            if (!conversation_id) {
                return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
            }
            const { error } = await (supabase as any)
                .from('whatsapp_conversations')
                .update({
                    status: 'resolved',
                    needs_human: false,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', conversation_id);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true });
        }

        if (action === 'update-payment-method') {
            const { method_id, instructions, is_active } = body;
            if (!method_id) {
                return NextResponse.json({ error: 'Missing method_id' }, { status: 400 });
            }
            const updates: any = {};
            if (instructions !== undefined) updates.instructions = instructions;
            if (is_active !== undefined) updates.is_active = is_active;

            const { error } = await (supabase as any)
                .from('payment_methods')
                .update(updates)
                .eq('id', method_id);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true });
        }

        if (action === 'toggle-chatbot') {
            const { enabled } = body;
            const { error } = await (supabase as any)
                .from('whatsapp_settings')
                .update({ n8n_enabled: enabled })
                .not('id', 'is', null);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true });
        }

        if (action === 'set-whitelist') {
            // phones: string[] — save as CSV in app_config
            const { phones } = body as { phones: string[] };
            if (!Array.isArray(phones)) {
                return NextResponse.json({ error: 'Missing phones array' }, { status: 400 });
            }
            const csv = phones
                .map((p: string) => p.trim())
                .filter(Boolean)
                .join(',');
            const { error } = await (supabase as any)
                .from('app_config')
                .upsert({ key: 'phone_whitelist', value: csv }, { onConflict: 'key' });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, phones_saved: phones.length });
        }

        if (action === 'toggle-whitelist') {
            const { enabled } = body as { enabled: boolean };
            const { error } = await (supabase as any)
                .from('app_config')
                .upsert({ key: 'wa_whitelist_enabled', value: enabled ? 'true' : 'false' }, { onConflict: 'key' });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('[Chatbot Stats PATCH] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
