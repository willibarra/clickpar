import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * POST /api/portal/code-request
 * Client requests a verification code for one of their services.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { saleId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { saleId } = body;
    if (!saleId) {
        return NextResponse.json({ error: 'Falta saleId' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // 1. Resolve customer from auth user
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    let resolvedPhone: string | null = profile?.phone_number || null;
    if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
        const extracted = user.email.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    if (!resolvedPhone) {
        return NextResponse.json({ error: 'Perfil sin teléfono' }, { status: 400 });
    }

    // Find customer
    let customer: any = null;
    const phonesToTry = [
        normalizePhone(resolvedPhone),
        resolvedPhone,
        resolvedPhone.replace(/^\+/, ''),
    ];
    for (const phone of phonesToTry) {
        const { data } = await (admin.from('customers') as any)
            .select('id, full_name, phone')
            .eq('phone', phone)
            .maybeSingle();
        if (data) { customer = data; break; }
    }

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 2. Verify sale belongs to this customer
    const { data: sale } = await (admin.from('sales') as any)
        .select('id, slot_id, customer_id')
        .eq('id', saleId)
        .eq('customer_id', customer.id)
        .eq('is_active', true)
        .single();

    if (!sale) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }

    // 3. Rate limit: max 1 pending request per customer per platform every 2 minutes
    const { data: recentRequests } = await (admin.from('code_requests') as any)
        .select('id, created_at')
        .eq('customer_id', customer.id)
        .eq('sale_id', saleId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);

    if (recentRequests && recentRequests.length > 0) {
        const lastAt = new Date(recentRequests[0].created_at).getTime();
        const diffMs = Date.now() - lastAt;
        if (diffMs < 2 * 60 * 1000) {
            return NextResponse.json({
                error: 'Ya tenés una solicitud pendiente. Esperá un momento.',
                existingRequestId: recentRequests[0].id,
            }, { status: 429 });
        }
    }

    // 4. Get slot → mother account details
    const { data: slot } = await (admin.from('sale_slots') as any)
        .select('mother_account_id')
        .eq('id', sale.slot_id)
        .single();

    if (!slot) {
        return NextResponse.json({ error: 'Slot no encontrado' }, { status: 404 });
    }

    const { data: account } = await admin
        .from('mother_accounts')
        .select('email, platform, supplier_name')
        .eq('id', slot.mother_account_id)
        .single();

    if (!account) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    // 5. Get provider config (optional — for telegram bot info)
    const { data: providerConfig } = await (admin.from('provider_support_config') as any)
        .select('*')
        .eq('platform', (account as any).platform)
        .eq('supplier_name', (account as any).supplier_name)
        .maybeSingle();

    // 6. Create code_request
    const { data: codeRequest, error: insertError } = await (admin.from('code_requests') as any)
        .insert({
            sale_id: saleId,
            customer_id: customer.id,
            platform: (account as any).platform,
            account_email: (account as any).email,
            supplier_name: (account as any).supplier_name,
            auto_source: providerConfig?.code_source || 'manual',
            telegram_bot_username: providerConfig?.telegram_bot_username || null,
            telegram_user_identifier: providerConfig?.telegram_user_identifier || null,
        })
        .select('id')
        .single();

    if (insertError) {
        console.error('[CodeRequest] Insert error:', insertError);
        return NextResponse.json({ error: 'Error al crear solicitud' }, { status: 500 });
    }

    // 7. Send Telegram notification to admin
    try {
        const adminPanelUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';
        const message = [
            '🔔 *Solicitud de Código*',
            '',
            `👤 Cliente: ${customer.full_name}`,
            `📺 Plataforma: ${(account as any).platform}`,
            `📧 Cuenta: ${(account as any).email}`,
            `⏰ Solicitado: ahora`,
            '',
            providerConfig?.telegram_bot_username
                ? `🤖 Bot Proveedor: ${providerConfig.telegram_bot_username}`
                : '',
            providerConfig?.telegram_user_identifier
                ? `👤 Usuario: ${providerConfig.telegram_user_identifier}`
                : '',
            '',
            `👉 Ingresá el código en: ${adminPanelUrl}/code-requests`,
        ].filter(Boolean).join('\n');

        for (const chatId of ALLOWED_IDS) {
            await sendMessage(Number(chatId), message);
        }
    } catch (tgErr) {
        console.warn('[CodeRequest] Telegram notification failed:', tgErr);
        // Non-blocking: continue even if notification fails
    }

    // 8. Auto-trigger the code processor (fire-and-forget)
    // If provider has telegram bot config OR imap source, try to resolve automatically
    const autoSource = providerConfig?.code_source || 'manual';
    const hasTelegramConfig = providerConfig?.telegram_bot_username && providerConfig?.telegram_user_identifier;
    const hasImapSource = autoSource === 'imap';

    if (hasTelegramConfig || hasImapSource) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        fetch(`${appUrl}/api/cron/process-code-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: codeRequest.id }),
        }).catch((err) => {
            console.warn('[CodeRequest] Auto-processor trigger failed:', err);
        });
    }

    return NextResponse.json({
        success: true,
        requestId: codeRequest.id,
        message: 'Tu solicitud fue recibida. El código llegará en breve.',
    });
}

/**
 * GET /api/portal/code-request?id=xxx
 * Poll the status of a code request.
 */
export async function GET(req: NextRequest) {
    const requestId = req.nextUrl.searchParams.get('id');
    if (!requestId) {
        return NextResponse.json({ error: 'Falta id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Resolve customer
    const { data: profile } = await (admin.from('profiles') as any)
        .select('phone_number')
        .eq('id', user.id)
        .single();

    let resolvedPhone: string | null = profile?.phone_number || null;
    if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
        const extracted = user.email.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    if (!resolvedPhone) {
        return NextResponse.json({ error: 'Perfil sin teléfono' }, { status: 400 });
    }

    let customer: any = null;
    const phonesToTry = [
        normalizePhone(resolvedPhone),
        resolvedPhone,
        resolvedPhone.replace(/^\+/, ''),
    ];
    for (const phone of phonesToTry) {
        const { data } = await (admin.from('customers') as any)
            .select('id')
            .eq('phone', phone)
            .maybeSingle();
        if (data) { customer = data; break; }
    }

    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Get request — only if it belongs to this customer
    const { data: codeRequest } = await (admin.from('code_requests') as any)
        .select('id, status, code, platform, expires_at, created_at')
        .eq('id', requestId)
        .eq('customer_id', customer.id)
        .single();

    if (!codeRequest) {
        return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    // Check if expired
    if (codeRequest.status === 'pending' && new Date(codeRequest.expires_at) < new Date()) {
        // Auto-expire
        await (admin.from('code_requests') as any)
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', requestId);
        codeRequest.status = 'expired';
    }

    return NextResponse.json({
        success: true,
        status: codeRequest.status,
        code: codeRequest.status === 'completed' ? codeRequest.code : null,
        platform: codeRequest.platform,
        expiresAt: codeRequest.expires_at,
        createdAt: codeRequest.created_at,
    });
}
