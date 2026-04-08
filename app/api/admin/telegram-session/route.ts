import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

export const dynamic = 'force-dynamic';

// In-memory store for pending auth flows (phone → { client, phoneCodeHash })
// This is safe because auth flow is short-lived and admin-only
const pendingAuths = new Map<string, {
    client: TelegramClient;
    phoneCodeHash: string;
    apiId: number;
    apiHash: string;
    resolveCode: (code: string) => void;
}>();

/**
 * GET /api/admin/telegram-session
 * Check if there's an active Telegram UserBot session
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { data: sessions } = await (admin.from('telegram_sessions') as any)
        .select('id, label, phone_number, is_active, last_used_at, created_at')
        .order('created_at', { ascending: false });

    return NextResponse.json({
        success: true,
        sessions: sessions || [],
        hasPending: pendingAuths.size > 0,
    });
}

/**
 * POST /api/admin/telegram-session
 * 
 * Actions:
 * - { action: 'init', phone, apiId, apiHash } → Start auth, sends OTP
 * - { action: 'verify', phone, code } → Verify OTP and save session
 * - { action: 'test' } → Test the active session by sending /start to a bot
 * - { action: 'delete', sessionId } → Delete a session
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { action } = body;

    // ─── INIT: Start Telegram auth ───
    if (action === 'init') {
        const { phone, apiId, apiHash } = body;
        if (!phone || !apiId || !apiHash) {
            return NextResponse.json({ error: 'Faltan parámetros (phone, apiId, apiHash)' }, { status: 400 });
        }

        // Clean up any existing pending auth for this phone
        if (pendingAuths.has(phone)) {
            try {
                const old = pendingAuths.get(phone)!;
                await old.client.disconnect();
            } catch {}
            pendingAuths.delete(phone);
        }

        try {
            const session = new StringSession('');
            const client = new TelegramClient(session, Number(apiId), String(apiHash), {
                connectionRetries: 5,
            });

            await client.connect();

            // Start the auth flow — this sends the OTP code to the user's Telegram
            // We use a Promise-based approach to handle the code callback
            let resolveCodeFn: ((code: string) => void) | null = null;
            const codePromise = new Promise<string>((resolve) => {
                resolveCodeFn = resolve;
            });

            // Start auth in the background — it will wait for the code
            const authPromise = client.start({
                phoneNumber: phone,
                phoneCode: async () => {
                    // This will be called when Telegram sends the OTP
                    // We return a promise that resolves when the user provides the code via the verify endpoint
                    return codePromise;
                },
                password: async () => {
                    // 2FA password — for now, return empty. Can be enhanced later.
                    return '';
                },
                onError: (err) => {
                    console.error('[TelegramSession] Auth error:', err);
                },
            });

            // Store the pending auth state
            pendingAuths.set(phone, {
                client,
                phoneCodeHash: '', // not used directly with GramJS
                apiId: Number(apiId),
                apiHash: String(apiHash),
                resolveCode: resolveCodeFn!,
            });

            // Handle auth completion in the background
            authPromise
                .then(async () => {
                    console.log('[TelegramSession] Auth completed for', phone);
                    // Save session to DB
                    const sessionString = (client.session as StringSession).save();
                    
                    await (admin.from('telegram_sessions') as any).insert({
                        phone_number: phone,
                        session_string: sessionString,
                        api_id: Number(apiId),
                        api_hash: String(apiHash),
                        is_active: true,
                        label: 'ClickPar',
                    });

                    pendingAuths.delete(phone);
                    console.log('[TelegramSession] Session saved for', phone);
                })
                .catch((err) => {
                    console.error('[TelegramSession] Auth failed:', err);
                    pendingAuths.delete(phone);
                });

            // Wait a moment for the OTP to be sent
            await new Promise(r => setTimeout(r, 3000));

            return NextResponse.json({
                success: true,
                message: 'Código OTP enviado a tu Telegram. Ingresalo en el siguiente paso.',
                phone,
            });
        } catch (err: any) {
            console.error('[TelegramSession] Init error:', err);
            return NextResponse.json({ error: `Error al conectar: ${err.message}` }, { status: 500 });
        }
    }

    // ─── VERIFY: Provide the OTP code ───
    if (action === 'verify') {
        const { phone, code } = body;
        if (!phone || !code) {
            return NextResponse.json({ error: 'Faltan parámetros (phone, code)' }, { status: 400 });
        }

        const pending = pendingAuths.get(phone);
        if (!pending) {
            return NextResponse.json({
                error: 'No hay una sesión pendiente para este número. Iniciá el proceso de nuevo.',
            }, { status: 400 });
        }

        // Resolve the code promise — this triggers GramJS to continue the auth
        pending.resolveCode(code);

        // Wait for auth to complete or fail
        await new Promise(r => setTimeout(r, 5000));

        // Check if session was saved (auth completed)
        const { data: savedSession } = await (admin.from('telegram_sessions') as any)
            .select('id, phone_number, is_active')
            .eq('phone_number', phone)
            .eq('is_active', true)
            .maybeSingle();

        if (savedSession) {
            return NextResponse.json({
                success: true,
                message: '✅ Telegram conectado correctamente. La sesión está activa.',
                session: savedSession,
            });
        }

        // Auth might still be in progress or failed
        if (pendingAuths.has(phone)) {
            return NextResponse.json({
                success: false,
                error: 'Verificación en proceso. Si el código es correcto, esperá unos segundos e intentá de nuevo.',
            }, { status: 202 });
        }

        return NextResponse.json({
            error: 'Verificación fallida. Comprobá el código e intentá de nuevo.',
        }, { status: 400 });
    }

    // ─── TEST: Test the active session ───
    if (action === 'test') {
        const { data: session } = await (admin.from('telegram_sessions') as any)
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) {
            return NextResponse.json({ error: 'No hay sesión activa' }, { status: 400 });
        }

        try {
            const { getClient } = await import('@/lib/telegram-userbot');
            const client = await getClient({
                apiId: session.api_id,
                apiHash: session.api_hash,
                sessionString: session.session_string,
            });

            const me = await client.getMe();
            
            // Update last_used_at
            await (admin.from('telegram_sessions') as any)
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', session.id);

            return NextResponse.json({
                success: true,
                message: `✅ Sesión activa como ${(me as any).firstName || ''} ${(me as any).lastName || ''} (@${(me as any).username || 'sin username'})`,
                user: {
                    firstName: (me as any).firstName,
                    lastName: (me as any).lastName,
                    username: (me as any).username,
                    phone: (me as any).phone,
                },
            });
        } catch (err: any) {
            return NextResponse.json({ error: `Error al probar sesión: ${err.message}` }, { status: 500 });
        }
    }

    // ─── DELETE: Remove a session ───
    if (action === 'delete') {
        const { sessionId } = body;
        if (!sessionId) {
            return NextResponse.json({ error: 'Falta sessionId' }, { status: 400 });
        }

        await (admin.from('telegram_sessions') as any)
            .delete()
            .eq('id', sessionId);

        return NextResponse.json({ success: true, message: 'Sesión eliminada' });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
