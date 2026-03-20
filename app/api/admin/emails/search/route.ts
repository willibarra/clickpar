import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient, createAdminClient } from '@/lib/supabase/server';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { getValidGmailToken, searchInbox } from '@/lib/gmail';
export const dynamic = 'force-dynamic';


/**
 * GET /api/admin/emails/search?email=xxx&q=yyy
 * Searches Gmail for emails received to the specific account address.
 */
export async function GET(req: NextRequest) {
    const targetEmail = req.nextUrl.searchParams.get('email');
    const queryTerm = req.nextUrl.searchParams.get('q') || '';

    if (!targetEmail) {
        return NextResponse.json({ error: 'Falta email' }, { status: 400 });
    }

    // Auth check (must be admin or staff)
    const supabase = await createAuthClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'super_admin' && profile.role !== 'staff')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Fetch the Gmail token
    const rawAdmin = createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: gmailTokens, error: gmailError } = await rawAdmin
        .from('gmail_tokens')
        .select('email, access_token, refresh_token, expires_at')
        .limit(1);

    if (gmailError || !gmailTokens || gmailTokens.length === 0) {
        return NextResponse.json({
            error: 'Gmail no configurado en el sistema.',
        }, { status: 424 });
    }

    const token = gmailTokens[0];

    try {
        const accessToken = await getValidGmailToken(token);

        // Update stored token if refreshed
        if (accessToken !== token.access_token) {
            await rawAdmin
                .from('gmail_tokens')
                .update({
                    access_token: accessToken,
                    expires_at: new Date(Date.now() + 3500_000).toISOString(),
                })
                .eq('email', token.email);
        }

        const messages = await searchInbox(accessToken, targetEmail, queryTerm);

        return NextResponse.json({ success: true, messages });
    } catch (error: any) {
        console.error('[AdminEmailSearch]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
