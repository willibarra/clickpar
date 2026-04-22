// @ts-nocheck — new tables (conversations, conversation_messages) not yet in Supabase types
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations
 * Lists conversations with last message preview.
 * Query params: status (open|resolved|waiting|all), limit, offset
 *
 * POST /api/conversations
 * Actions: reply, mark-resolved, mark-open, assign
 */

export async function GET(request: NextRequest) {
    const supabase = await createAdminClient();
    const status = request.nextUrl.searchParams.get('status') || 'open';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');
    const search = request.nextUrl.searchParams.get('search') || '';

    let query = (supabase
        .from('conversations' as any) as any)
        .select(`
            *,
            customer:customer_id (
                id,
                full_name,
                phone,
                sales (
                    id,
                    is_active,
                    end_date,
                    sale_slots (
                        slot_identifier,
                        mother_accounts (platform)
                    )
                )
            )
        `, { count: 'exact' })
        .order('last_message_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status !== 'all') {
        query = query.eq('status', status);
    }

    const { data: conversations, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by search term (customer name or phone)
    let filtered: any[] = (conversations as any[]) || [];
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((c: any) => {
            const name = c.customer?.full_name?.toLowerCase() || '';
            const phone = c.wa_phone || c.customer?.phone || '';
            return name.includes(s) || phone.includes(s);
        });
    }

    return NextResponse.json({ conversations: filtered });
}

export async function POST(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { action, conversationId } = body;

        if (!conversationId) {
            return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
        }

        // Fetch conversation info
        const { data: convRaw } = await supabase
            .from('conversations' as any)
            .select('*, customer:customer_id(id, full_name, phone)')
            .eq('id', conversationId)
            .single();
        const conv = convRaw as any;

        if (!conv) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        switch (action) {
            case 'reply': {
                const { message, staffName, instanceName } = body;
                if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

                const phone = conv.wa_phone || conv.customer?.phone;
                if (!phone) return NextResponse.json({ error: 'No phone number for this conversation' }, { status: 400 });

                // Send via WhatsApp
                const result = await sendText(phone, message, {
                    instanceName,
                    customerId: conv.customer?.id,
                    skipRateLimiting: true,
                    triggeredBy: 'manual',
                });

                if (!result.success) {
                    return NextResponse.json({ error: result.error || 'Failed to send' }, { status: 500 });
                }

                // Save message to conversation
                await supabase.from('conversation_messages' as any).insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    sender: 'staff',
                    sender_name: staffName || 'Staff ClickPar',
                    message,
                    wa_status: 'sent',
                    is_automated: false,
                });

                await (supabase
                    .from('conversations' as any) as any)
                    .update({
                        last_message_at: new Date().toISOString(),
                        last_message_preview: `💬 ${message.slice(0, 80)}`,
                        status: 'open',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', conversationId);

                return NextResponse.json({ success: true });
            }

            case 'mark-resolved': {
                await (supabase.from('conversations' as any) as any)
                    .update({ status: 'resolved', unread_count: 0, updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
                return NextResponse.json({ success: true });
            }

            case 'mark-open': {
                await (supabase.from('conversations' as any) as any)
                    .update({ status: 'open', updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
                return NextResponse.json({ success: true });
            }

            case 'mark-read': {
                await (supabase.from('conversations' as any) as any)
                    .update({ unread_count: 0, updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
                return NextResponse.json({ success: true });
            }

            case 'assign': {
                const { assignedTo } = body;
                await (supabase.from('conversations' as any) as any)
                    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
