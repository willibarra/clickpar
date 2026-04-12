import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
    getClient,
    requestCodeFromBot,
    buildGenericBotFlow,
    buildAutocodeStreamFlow,
    type TelegramSessionConfig,
} from '@/lib/telegram-userbot';
import {
    fetchCodeFromImap,
    type ImapAccountConfig,
} from '@/lib/imap-reader';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for this endpoint

/**
 * POST /api/cron/process-code-requests
 * 
 * Processes pending code requests using available auto-resolution sources:
 * - telegram_bot: Interacts with provider Telegram bots via UserBot
 * - imap: Searches IMAP mailboxes for verification code emails
 * - manual: No auto-resolution (admin must enter code manually)
 * 
 * Called periodically via cron or triggered directly after a client request.
 * Can also be called with { requestId } to process a specific request immediately.
 */
export async function POST(req: Request) {
    let body: any = {};
    try {
        body = await req.json();
    } catch {}

    const specificRequestId = body?.requestId;

    const admin = await createAdminClient();

    // 1. Get pending code requests
    let query = (admin.from('code_requests') as any)
        .select('*')
        .in('status', ['pending'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

    if (specificRequestId) {
        query = query.eq('id', specificRequestId);
    } else {
        query = query.limit(5);
    }

    const { data: pendingRequests, error: fetchError } = await query;

    if (fetchError) {
        console.error('[ProcessCodeRequests] Fetch error:', fetchError);
        return NextResponse.json({ error: 'Error al obtener solicitudes' }, { status: 500 });
    }

    if (!pendingRequests || pendingRequests.length === 0) {
        return NextResponse.json({ success: true, message: 'No hay solicitudes pendientes', processed: 0 });
    }

    // 2. Separate requests by auto_source
    const telegramRequests = pendingRequests.filter((r: any) => r.auto_source === 'telegram_userbot' || r.auto_source === 'telegram_bot');
    const imapRequests = pendingRequests.filter((r: any) => r.auto_source === 'imap');
    const manualRequests = pendingRequests.filter((r: any) => !['telegram_userbot', 'telegram_bot', 'imap'].includes(r.auto_source));

    const results: Array<{ id: string; source: string; success: boolean; code?: string; error?: string }> = [];

    // ─── Process IMAP requests ─────────────────────────────────────────────
    if (imapRequests.length > 0) {
        console.log(`[ProcessCodeRequests] Processing ${imapRequests.length} IMAP request(s)`);

        for (const req of imapRequests) {
            // Mark as processing
            await (admin.from('code_requests') as any)
                .update({ status: 'processing', updated_at: new Date().toISOString() })
                .eq('id', req.id);

            try {
                // Find IMAP accounts for this account_email via routing table
                const { data: routes } = await (admin.from('imap_email_routing') as any)
                    .select('imap_account_id')
                    .or(`account_email.eq.${req.account_email},is_catchall.eq.true`)
                    .limit(10);

                let imapAccountIds: string[] = [];
                if (routes && routes.length > 0) {
                    imapAccountIds = routes.map((r: any) => r.imap_account_id);
                }

                // If no routing found, try to find by matching email domain
                if (imapAccountIds.length === 0) {
                    const domain = req.account_email.split('@')[1];
                    if (domain) {
                        const { data: domainAccounts } = await (admin.from('imap_email_accounts') as any)
                            .select('id')
                            .eq('is_active', true)
                            .ilike('email', `%@${domain}`);
                        if (domainAccounts) {
                            imapAccountIds = domainAccounts.map((a: any) => a.id);
                        }
                    }
                }

                // Also check provider_support_config for imap_account_ids
                if (imapAccountIds.length === 0) {
                    const { data: cfg } = await (admin.from('provider_support_config') as any)
                        .select('imap_account_ids')
                        .eq('platform', req.platform)
                        .eq('supplier_name', req.supplier_name)
                        .maybeSingle();
                    if (cfg?.imap_account_ids?.length > 0) {
                        imapAccountIds = cfg.imap_account_ids;
                    }
                }

                // Fallback: use all active IMAP accounts (catchall search)
                if (imapAccountIds.length === 0) {
                    const { data: allAccounts } = await (admin.from('imap_email_accounts') as any)
                        .select('id')
                        .eq('is_active', true)
                        .limit(20);
                    if (allAccounts) {
                        imapAccountIds = allAccounts.map((a: any) => a.id);
                    }
                }

                if (imapAccountIds.length === 0) {
                    await (admin.from('code_requests') as any)
                        .update({
                            status: 'pending',
                            notes: 'Sin cuentas IMAP configuradas. Requiere resolución manual.',
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', req.id);
                    results.push({ id: req.id, source: 'imap', success: false, error: 'No IMAP accounts configured' });
                    continue;
                }

                // Load IMAP account details (including subject/sender filters)
                const { data: imapAccounts } = await (admin.from('imap_email_accounts') as any)
                    .select('*')
                    .in('id', imapAccountIds)
                    .eq('is_active', true);

                if (!imapAccounts || imapAccounts.length === 0) {
                    await (admin.from('code_requests') as any)
                        .update({ status: 'pending', notes: 'Cuentas IMAP inactivas', updated_at: new Date().toISOString() })
                        .eq('id', req.id);
                    results.push({ id: req.id, source: 'imap', success: false, error: 'All IMAP accounts inactive' });
                    continue;
                }

                // Try each IMAP account until we find the code
                let found = false;
                for (const account of imapAccounts) {
                    const config: ImapAccountConfig = {
                        email: account.email,
                        password: account.password,
                        host: account.imap_host,
                        port: account.imap_port,
                        secure: account.imap_secure,
                    };

                    const result = await fetchCodeFromImap(config, {
                        subjectFilter: account.subject_filter || req.platform || '',
                        senderFilter: account.sender_filter || undefined,
                        lookbackMinutes: account.lookback_minutes || 15,
                    });

                    if (result.success && result.code) {
                        await (admin.from('imap_email_accounts') as any)
                            .update({ last_checked_at: new Date().toISOString(), last_error: null })
                            .eq('id', account.id);

                        await (admin.from('code_requests') as any)
                            .update({
                                status: 'completed',
                                code: result.code,
                                resolved_at: new Date().toISOString(),
                                auto_source: 'imap',
                                notes: `Auto-resuelto via IMAP. Asunto: ${result.subject || 'N/A'}`,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', req.id);

                        console.log(`[ProcessCodeRequests] ✅ IMAP Code ${result.code} for request ${req.id}`);
                        results.push({ id: req.id, source: 'imap', success: true, code: result.code });
                        found = true;
                        break;
                    } else {
                        // Update last_error for this account
                        await (admin.from('imap_email_accounts') as any)
                            .update({ last_checked_at: new Date().toISOString(), last_error: result.error })
                            .eq('id', account.id);
                    }
                }

                if (!found) {
                    await (admin.from('code_requests') as any)
                        .update({
                            status: 'pending',
                            notes: `IMAP: No se encontró código en ${imapAccounts.length} cuenta(s)`,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', req.id);

                    console.warn(`[ProcessCodeRequests] ❌ IMAP: no code found for ${req.id}`);
                    results.push({ id: req.id, source: 'imap', success: false, error: 'No code found in any IMAP account' });
                }
            } catch (err: any) {
                console.error(`[ProcessCodeRequests] IMAP error for ${req.id}:`, err);
                await (admin.from('code_requests') as any)
                    .update({ status: 'pending', notes: `IMAP Excepción: ${err.message}`, updated_at: new Date().toISOString() })
                    .eq('id', req.id);
                results.push({ id: req.id, source: 'imap', success: false, error: err.message });
            }
        }
    }

    // ─── Process Telegram requests ─────────────────────────────────────────
    if (telegramRequests.length > 0) {
        console.log(`[ProcessCodeRequests] Processing ${telegramRequests.length} Telegram request(s)`);

        // Get active Telegram session
        const { data: session } = await (admin.from('telegram_sessions') as any)
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) {
            console.warn('[ProcessCodeRequests] No active Telegram session');
            for (const req of telegramRequests) {
                await (admin.from('code_requests') as any)
                    .update({
                        status: 'pending',
                        notes: 'Sin sesión de Telegram activa.',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', req.id);
                results.push({ id: req.id, source: 'telegram', success: false, error: 'No Telegram session' });
            }
        } else {
            let client;
            try {
                const config: TelegramSessionConfig = {
                    apiId: session.api_id,
                    apiHash: session.api_hash,
                    sessionString: session.session_string,
                };
                client = await getClient(config);
            } catch (err: any) {
                console.error('[ProcessCodeRequests] Telegram connect error:', err);
                for (const req of telegramRequests) {
                    results.push({ id: req.id, source: 'telegram', success: false, error: err.message });
                }
                client = null;
            }

            if (client) {
                for (const req of telegramRequests) {
                    console.log(`[ProcessCodeRequests] Processing Telegram request ${req.id} for ${req.platform}`);

                    await (admin.from('code_requests') as any)
                        .update({ status: 'processing', updated_at: new Date().toISOString() })
                        .eq('id', req.id);

                    const botUsername = req.telegram_bot_username;
                    const userIdentifier = req.telegram_user_identifier;

                    if (!botUsername || !userIdentifier) {
                        await (admin.from('code_requests') as any)
                            .update({
                                status: 'pending',
                                notes: 'Sin configuración de bot Telegram. Requiere resolución manual.',
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', req.id);
                        results.push({ id: req.id, source: 'telegram', success: false, error: 'Missing bot config' });
                        continue;
                    }

                    try {
                        // Use the specific flow for autocodestream_bot, generic for others
                        const cleanBotUsername = botUsername.replace('@', '').toLowerCase();
                        const steps = cleanBotUsername === 'autocodestream_bot'
                            ? buildAutocodeStreamFlow(userIdentifier, req.account_email)
                            : buildGenericBotFlow(userIdentifier, req.account_email);
                        
                        const result = await requestCodeFromBot(
                            client,
                            cleanBotUsername,
                            steps,
                            120_000,
                        );

                        if (result.success && result.code) {
                            await (admin.from('code_requests') as any)
                                .update({
                                    status: 'completed',
                                    code: result.code,
                                    resolved_at: new Date().toISOString(),
                                    auto_source: 'telegram_userbot',
                                    notes: `Auto-resuelto. Mensajes: ${(result.rawMessages || []).length}`,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('id', req.id);

                            console.log(`[ProcessCodeRequests] ✅ Telegram Code ${result.code} for request ${req.id}`);
                            results.push({ id: req.id, source: 'telegram', success: true, code: result.code });
                        } else {
                            await (admin.from('code_requests') as any)
                                .update({
                                    status: 'pending',
                                    notes: `Auto-resolución falló: ${result.error}. Raw: ${(result.rawMessages || []).join(' | ').substring(0, 500)}`,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('id', req.id);

                            results.push({ id: req.id, source: 'telegram', success: false, error: result.error });
                        }
                    } catch (err: any) {
                        console.error(`[ProcessCodeRequests] Telegram error for ${req.id}:`, err);
                        await (admin.from('code_requests') as any)
                            .update({ status: 'pending', notes: `Excepción: ${err.message}`, updated_at: new Date().toISOString() })
                            .eq('id', req.id);
                        results.push({ id: req.id, source: 'telegram', success: false, error: err.message });
                    }

                    // Small delay between requests
                    if (telegramRequests.indexOf(req) < telegramRequests.length - 1) {
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }

                // Update session last_used_at
                await (admin.from('telegram_sessions') as any)
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('id', session.id);
            }
        }
    }

    // ─── Manual requests — just log them ───────────────────────────────────
    for (const req of manualRequests) {
        results.push({ id: req.id, source: 'manual', success: false, error: 'Requires manual resolution' });
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[ProcessCodeRequests] Done: ${successCount}/${results.length} resolved`);

    return NextResponse.json({
        success: true,
        processed: results.length,
        resolved: successCount,
        results,
    });
}
