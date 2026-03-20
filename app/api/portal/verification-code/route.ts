import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient, createAdminClient } from '@/lib/supabase/server';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { getValidGmailToken, searchVerificationEmails, extractVerificationCode } from '@/lib/gmail';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


/**
 * GET /api/portal/verification-code?saleId=xxx
 * Searches Gmail for verification codes related to the customer's service.
 */
export async function GET(req: NextRequest) {
    const saleId = req.nextUrl.searchParams.get('saleId');
    if (!saleId) {
        return NextResponse.json({ error: 'Falta saleId' }, { status: 400 });
    }

    // Auth check
    const supabase = await createAuthClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Verify this sale belongs to the user
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    if (!profile?.phone_number) {
        return NextResponse.json({ error: 'Perfil sin teléfono' }, { status: 400 });
    }

    const { data: customer } = await (admin.from('customers') as any)
        .select('id')
        .eq('phone', normalizePhone(profile.phone_number))
        .single();

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Get sale details
    const { data: sale } = await (admin.from('sales') as any)
        .select('id, slot_id, customer_id')
        .eq('id', saleId)
        .eq('customer_id', customer.id)
        .single();

    if (!sale) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }

    // Get slot → mother account
    const { data: slot } = await (admin.from('sale_slots') as any)
        .select('mother_account_id')
        .eq('id', sale.slot_id)
        .single();

    if (!slot) {
        return NextResponse.json({ error: 'Slot no encontrado' }, { status: 404 });
    }

    const { data: account } = await admin
        .from('mother_accounts')
        .select('email, platform')
        .eq('id', slot.mother_account_id)
        .single();

    if (!account) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    // Find Gmail token — check if account email has a redirect to a Gmail
    // Or find any stored Gmail token (most setups have one central Gmail)
    // Use raw supabase-js client (not SSR) to bypass RLS properly
    const rawAdmin = createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: gmailTokens, error: gmailError } = await rawAdmin
        .from('gmail_tokens')
        .select('email, access_token, refresh_token, expires_at')
        .limit(1);

    console.log('[VerCode] gmail_tokens query result:', { data: gmailTokens?.length, error: gmailError?.message });

    if (gmailError || !gmailTokens || gmailTokens.length === 0) {
        console.error('[VerCode] Gmail tokens not found:', gmailError);
        return NextResponse.json({
            error: 'Gmail no configurado. Ve a Ajustes → Conectar Gmail.',
            needsSetup: true,
        }, { status: 424 });
    }

    const token = gmailTokens[0];

    try {
        // Get valid access token
        const accessToken = await getValidGmailToken(token);

        // Update stored access token if refreshed
        if (accessToken !== token.access_token) {
            await rawAdmin
                .from('gmail_tokens')
                .update({
                    access_token: accessToken,
                    expires_at: new Date(Date.now() + 3500_000).toISOString(),
                })
                .eq('email', token.email);
        }

        // Search for verification code emails
        const emails = await searchVerificationEmails(
            accessToken,
            (account as any).email,
            (account as any).platform,
        );

        if (emails.length === 0) {
            return NextResponse.json({
                success: true,
                found: false,
                message: 'No se encontraron emails con códigos recientes (últimas 2 horas).',
            });
        }

        // Try to extract code from each email
        for (const email of emails) {
            const code = extractVerificationCode((email as any).body || '', email.snippet);
            if (code) {
                return NextResponse.json({
                    success: true,
                    found: true,
                    code,
                    from: email.snippet.substring(0, 100),
                    receivedAt: email.date,
                    platform: (account as any).platform,
                });
            }
        }

        // Couldn't extract code but found emails
        return NextResponse.json({
            success: true,
            found: false,
            message: 'Se encontraron emails pero no se pudo extraer el código automáticamente.',
            hint: emails[0].snippet.substring(0, 200),
        });
    } catch (error: any) {
        console.error('[VerificationCode] Gmail error:', error);
        return NextResponse.json({
            error: `Error al buscar código: ${error.message}`,
        }, { status: 500 });
    }
}
