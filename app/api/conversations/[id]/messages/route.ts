import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/[id]/messages
 * Returns all messages for a conversation, marks it as read.
 */

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await createAdminClient();

    const { data: messages, error } = await (supabase
        .from('conversation_messages' as any) as any)
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark conversation as read
    await (supabase
        .from('conversations' as any) as any)
        .update({ unread_count: 0 })
        .eq('id', id);

    return NextResponse.json({ messages: messages || [] });
}
