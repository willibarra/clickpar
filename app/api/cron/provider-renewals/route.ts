import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendText } from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';

// Secret to protect the cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

// Admin phone number for alerts
const ADMIN_PHONE = '+595973442773';

/**
 * GET /api/cron/provider-renewals
 *
 * Daily check for mother_accounts nearing their provider renewal_date.
 * Groups accounts expiring in 3, 7, and 15 days and sends a single
 * consolidated WhatsApp message to the admin.
 *
 * Schedule via VPS cron:
 *   0 11 * * * curl -s "https://clickpar.shop/api/cron/provider-renewals?secret=clickpar-cron-2024"
 *   (11:00 UTC = 7:00 AM Paraguay UTC-4)
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAdminClient();

    try {
        // Calculate today in Paraguay timezone (UTC-4)
        const nowPY = new Date(
            new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' })
        );
        nowPY.setHours(0, 0, 0, 0);

        const todayStr = formatDate(nowPY);
        const in3days = formatDate(addDays(nowPY, 3));
        const in7days = formatDate(addDays(nowPY, 7));
        const in15days = formatDate(addDays(nowPY, 15));

        // Query active mother_accounts expiring on each target date
        const { data: accounts, error: queryError } = await supabase
            .from('mother_accounts')
            .select(`
                id,
                platform,
                email,
                renewal_date,
                max_slots,
                sale_slots (
                    id,
                    status
                )
            `)
            .eq('status', 'active')
            .in('renewal_date', [in3days, in7days, in15days])
            .order('renewal_date', { ascending: true });

        if (queryError) {
            console.error('[Provider Renewals] Query error:', queryError);
            return NextResponse.json({ error: queryError.message }, { status: 500 });
        }

        // Group accounts by days until expiry
        const groups: Record<string, Array<{
            platform: string;
            email: string;
            renewal_date: string;
            sold_slots: number;
            max_slots: number;
        }>> = {
            '3': [],
            '7': [],
            '15': [],
        };

        for (const acct of (accounts || []) as any[]) {
            const soldSlots = (acct.sale_slots || []).filter(
                (s: any) => s.status === 'sold'
            ).length;

            const entry = {
                platform: acct.platform,
                email: acct.email,
                renewal_date: acct.renewal_date,
                sold_slots: soldSlots,
                max_slots: acct.max_slots || 5,
            };

            if (acct.renewal_date === in3days) groups['3'].push(entry);
            else if (acct.renewal_date === in7days) groups['7'].push(entry);
            else if (acct.renewal_date === in15days) groups['15'].push(entry);
        }

        const total = groups['3'].length + groups['7'].length + groups['15'].length;

        // If nothing is expiring, skip WhatsApp — avoid daily empty spam
        if (total === 0) {
            return NextResponse.json({
                success: true,
                date: todayStr,
                total: 0,
                message: 'No upcoming provider renewals',
            });
        }

        // Build consolidated WhatsApp message
        const lines: string[] = [
            '⚠️ *VENCIMIENTOS PRÓXIMOS - ClickPar*',
            `📅 Fecha: ${formatDateDisplay(nowPY)}`,
            '',
        ];

        if (groups['3'].length > 0) {
            lines.push(`🔴 *En 3 días (${formatDateDisplay(addDays(nowPY, 3))}):*`);
            for (const a of groups['3']) {
                lines.push(`  • ${a.platform} [${a.email}] - ${a.sold_slots}/${a.max_slots} perfiles vendidos`);
            }
            lines.push('');
        }

        if (groups['7'].length > 0) {
            lines.push(`🟡 *En 7 días (${formatDateDisplay(addDays(nowPY, 7))}):*`);
            for (const a of groups['7']) {
                lines.push(`  • ${a.platform} [${a.email}] - ${a.sold_slots}/${a.max_slots} perfiles vendidos`);
            }
            lines.push('');
        }

        if (groups['15'].length > 0) {
            lines.push(`🟢 *En 15 días (${formatDateDisplay(addDays(nowPY, 15))}):*`);
            for (const a of groups['15']) {
                lines.push(`  • ${a.platform} [${a.email}] - ${a.sold_slots}/${a.max_slots} perfiles vendidos`);
            }
            lines.push('');
        }

        lines.push(`📊 Total: ${total} cuenta${total !== 1 ? 's' : ''} por vencer`);

        const message = lines.join('\n');

        // Send a single WhatsApp message to admin (skip rate limiting — it's one message)
        const sendResult = await sendText(ADMIN_PHONE, message, {
            templateKey: 'provider_renewal_alert',
            skipRateLimiting: true,
        });

        // Log in notifications table for in-app visibility
        try {
            await (supabase as any).from('notifications').insert({
                type: 'provider_renewal_alert',
                message: `📬 Vencimientos proveedor: ${groups['3'].length} (3d) + ${groups['7'].length} (7d) + ${groups['15'].length} (15d) = ${total} cuentas`,
                is_read: false,
            });
        } catch {
            // Non-fatal: notification logging
        }

        return NextResponse.json({
            success: true,
            date: todayStr,
            whatsapp_sent: sendResult.success,
            whatsapp_error: sendResult.error || null,
            summary: {
                in_3_days: groups['3'].length,
                in_7_days: groups['7'].length,
                in_15_days: groups['15'].length,
                total,
            },
            details: groups,
        });
    } catch (error: any) {
        console.error('[Provider Renewals] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ==========================================
// Helpers
// ==========================================

/** YYYY-MM-DD for DB comparison */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/** DD/MM/YYYY for human-readable display */
function formatDateDisplay(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
