import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendStaffTicketAlert } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// GET /api/cron/account-health
// Checks all active mother_accounts for auth failures.
// Intended to be called every 30 min via a cron service.
// Protected by CRON_SECRET environment variable.
export async function GET(request: NextRequest) {
    const secret = request.headers.get('authorization')?.replace('Bearer ', '');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const admin = await createAdminClient();

        // Get all active mother accounts
        const { data: accounts, error: acctError } = await (admin.from('mother_accounts') as any)
            .select('id, platform, email, status')
            .eq('status', 'active');

        if (acctError) throw acctError;
        if (!accounts || accounts.length === 0) {
            return NextResponse.json({ message: 'No active accounts to check', checked: 0 });
        }

        const fallen: Array<{ accountId: string; platform: string; email: string; affectedCustomers: any[] }> = [];

        for (const account of accounts) {
            // Platform-specific health check
            // Currently we rely on an external signal (Evolution webhook, provider error, etc.)
            // Here we check if the account has been manually flagged externally by looking at
            // a 'health_check_failed' field or we attempt a lightweight HTTP probe.
            // For now: mark accounts that have 'review' or 'dead' as a no-op,
            // and attempt to detect issues via subscription complaints (accounts with
            // multiple tickets of type 'cuenta_caida' opened in last 24h).
            
            const { data: recentTickets } = await (admin.from('support_tickets') as any)
                .select('id')
                .eq('mother_account_id', account.id)
                .eq('tipo', 'cuenta_caida')
                .eq('canal_origen', 'sistema_automatico')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            // Skip if auto-tickets were already created in last 24h for this account
            if (recentTickets && recentTickets.length > 0) continue;

            // Check if account is flagged as failed (status changed externally)
            // We re-query to get the latest status
            const { data: freshAccount } = await (admin.from('mother_accounts') as any)
                .select('status')
                .eq('id', account.id)
                .single();

            if (!freshAccount || freshAccount.status !== 'active') {
                // This account was flagged as failing — process it
                const { data: activeSubscriptions } = await (admin.from('subscriptions') as any)
                    .select(`
                        id, customer_id,
                        customer:profiles!subscriptions_customer_id_fkey(id, full_name, phone_number),
                        slot:sale_slots(slot_identifier, mother_account_id)
                    `)
                    .eq('is_active', true)
                    .eq('slot.mother_account_id' as any, account.id);

                if (activeSubscriptions && activeSubscriptions.length > 0) {
                    // Create automatic tickets for each affected customer
                    const ticketInserts = activeSubscriptions.map((sub: any) => ({
                        customer_id: sub.customer_id,
                        subscription_id: sub.id,
                        mother_account_id: account.id,
                        tipo: 'cuenta_caida',
                        descripcion: `Detección automática: cuenta ${account.platform} (${account.email}) con problemas de acceso.`,
                        estado: 'abierto',
                        canal_origen: 'sistema_automatico',
                    }));

                    await (admin.from('support_tickets') as any).insert(ticketInserts);

                    fallen.push({
                        accountId: account.id,
                        platform: account.platform,
                        email: account.email,
                        affectedCustomers: activeSubscriptions,
                    });
                }
            }
        }

        // Send WhatsApp alert to staff if any accounts fell
        if (fallen.length > 0) {
            const { data: config } = await (admin.from('app_config') as any)
                .select('value')
                .eq('key', 'staff_alert_phone')
                .single();

            const staffPhone = (config as any)?.value || process.env.STAFF_ALERT_PHONE;

            if (staffPhone) {
                const alertLines = fallen.map(f => {
                    const customers = f.affectedCustomers.map((c: any) =>
                        `  • ${c.customer?.full_name || 'Cliente'} (${c.customer?.phone_number || 'sin tel.'})`
                    ).join('\n');
                    return `📺 *${f.platform}* (${f.email})\n${customers}`;
                });

                const alertMessage = [
                    `🚨 *ALERTA SISTEMA CLICKPAR*`,
                    ``,
                    `Se detectaron *${fallen.length} cuenta(s) caída(s)*:`,
                    ``,
                    alertLines.join('\n\n'),
                    ``,
                    `⚡ Se crearon tickets automáticos para todos los afectados.`,
                    `Revisá el panel en clickpar.shop/tickets`,
                ].join('\n');

                const { sendText } = await import('@/lib/whatsapp');
                await sendText(staffPhone, alertMessage, { skipRateLimiting: true });
            }
        }

        return NextResponse.json({
            ok: true,
            checked: accounts.length,
            fallen: fallen.length,
            details: fallen.map(f => ({
                platform: f.platform,
                email: f.email,
                affectedCount: f.affectedCustomers.length,
            })),
        });
    } catch (err: any) {
        console.error('[Account Health Cron]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST also supported for cron services that use POST
export const POST = GET;
