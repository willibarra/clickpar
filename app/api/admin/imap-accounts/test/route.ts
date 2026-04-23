import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { searchImapForCode, type ImapAccountConfig } from '@/lib/imap-client';
import { detectImapConfig } from '@/lib/imap-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/imap-accounts/test
 * Test an IMAP connection and optionally search for a code.
 * 
 * Body: { accountId?: string, email?, password?, host?, port?, secure?, searchFor?: string, platform?: string }
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const admin = await createAdminClient();
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || !['super_admin', 'staff'].includes(profile.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await req.json();

    let config: ImapAccountConfig;

    if (body.accountId) {
        // Load from database
        const { data: acct } = await (admin.from('imap_email_accounts') as any)
            .select('*')
            .eq('id', body.accountId)
            .single();

        if (!acct) {
            return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
        }

        config = {
            email: acct.email,
            password: acct.password,
            host: acct.imap_host,
            port: acct.imap_port,
            secure: acct.imap_secure,
        };
    } else {
        // Direct credentials — auto-detect host from email domain
        const detected = detectImapConfig(body.email);
        config = {
            email: body.email,
            password: body.password,
            host: body.host || detected?.host || 'outlook.office365.com',
            port: body.port || detected?.port || 993,
            secure: body.secure ?? detected?.secure ?? true,
        };
    }

    if (!config.email || !config.password) {
        return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
    }

    // Test connection and optionally search
    const searchFor = body.searchFor || config.email;
    const platform = body.platform || 'Netflix';

    const result = await searchImapForCode(config, searchFor, platform, 60); // Last 60 min

    // Update last_checked on the account if loaded from DB
    if (body.accountId) {
        await (admin.from('imap_email_accounts') as any)
            .update({
                last_checked_at: new Date().toISOString(),
                last_error: result.success ? null : result.error,
                updated_at: new Date().toISOString(),
            })
            .eq('id', body.accountId);
    }

    return NextResponse.json({
        success: true,
        connectionOk: !result.error?.includes('Error de conexión'),
        codeFound: result.success,
        result,
    });
}
