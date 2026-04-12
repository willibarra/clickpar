import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { testImapConnection } from '@/lib/imap-reader';

export const dynamic = 'force-dynamic';

/**
 * Admin API for managing IMAP email accounts.
 * GET  — list all accounts
 * POST — create new account
 * PUT  — update account
 * DELETE — delete account
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const admin = await createAdminClient();

    // Check admin role
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || !['super_admin', 'staff'].includes(profile.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { data: accounts, error } = await (admin.from('imap_email_accounts') as any)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get routing entries
    const { data: routing } = await (admin.from('imap_email_routing') as any)
        .select('*')
        .order('created_at', { ascending: false });

    return NextResponse.json({
        success: true,
        accounts: accounts || [],
        routing: routing || [],
    });
}

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

    // action=test: just test IMAP connection
    if (body.action === 'test') {
        const { email: testEmail, password: testPassword } = body;
        if (!testEmail || !testPassword) {
            return NextResponse.json({ success: false, error: 'email y password requeridos' }, { status: 400 });
        }
        const result = await testImapConnection({ email: testEmail, password: testPassword });
        return NextResponse.json(result);
    }

    const {
        email, password, imap_host, imap_port, imap_secure, label,
        platform, supplier_name, subject_filter, sender_filter, lookback_minutes,
    } = body;

    if (!email || !password) {
        return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
    }

    const { data, error } = await (admin.from('imap_email_accounts') as any)
        .insert({
            email,
            password,
            imap_host: imap_host || 'outlook.office365.com',
            imap_port: imap_port || 993,
            imap_secure: imap_secure ?? true,
            label: label || email,
            platform: platform || null,
            supplier_name: supplier_name || null,
            subject_filter: subject_filter || null,
            sender_filter: sender_filter || null,
            lookback_minutes: lookback_minutes || 15,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, account: data });
}

export async function PUT(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

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
    const updates: any = { updated_at: new Date().toISOString() };
    if (body.email !== undefined) updates.email = body.email;
    if (body.password !== undefined && body.password) updates.password = body.password;
    if (body.imap_host !== undefined) updates.imap_host = body.imap_host;
    if (body.imap_port !== undefined) updates.imap_port = body.imap_port;
    if (body.imap_secure !== undefined) updates.imap_secure = body.imap_secure;
    if (body.label !== undefined) updates.label = body.label;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.platform !== undefined) updates.platform = body.platform;
    if (body.supplier_name !== undefined) updates.supplier_name = body.supplier_name;
    if (body.subject_filter !== undefined) updates.subject_filter = body.subject_filter;
    if (body.sender_filter !== undefined) updates.sender_filter = body.sender_filter;
    if (body.lookback_minutes !== undefined) updates.lookback_minutes = body.lookback_minutes;

    const { error } = await (admin.from('imap_email_accounts') as any)
        .update(updates)
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

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

    const { error } = await (admin.from('imap_email_accounts') as any)
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
