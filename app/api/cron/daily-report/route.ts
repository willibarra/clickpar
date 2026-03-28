import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendMessage, formatGs, formatDate } from '@/lib/telegram';
export const dynamic = 'force-dynamic';

// Secret to protect the cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

// Telegram admin chat IDs (from TELEGRAM_ALLOWED_IDS)
const TELEGRAM_IDS = (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Boolean);

/**
 * GET /api/cron/daily-report
 *
 * Sends a comprehensive daily business report to Telegram every morning.
 * Schedule via VPS cron:
 *   0 11 * * * curl -s "https://clickpar.shop/api/cron/daily-report?secret=clickpar-cron-2024"
 *   (11:00 UTC = 7:00 AM Paraguay UTC-4)
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (TELEGRAM_IDS.length === 0) {
        return NextResponse.json({ error: 'No TELEGRAM_ALLOWED_IDS configured' }, { status: 500 });
    }

    const supabase = await createAdminClient();

    try {
        // ==========================================
        // Calculate dates in Paraguay timezone (UTC-4)
        // ==========================================
        const nowPY = new Date(
            new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' })
        );
        nowPY.setHours(0, 0, 0, 0);

        const todayStr = toDateStr(nowPY);
        const yesterdayStr = toDateStr(addDays(nowPY, -1));
        const tomorrowStr = toDateStr(addDays(nowPY, 1));
        const in7daysStr = toDateStr(addDays(nowPY, 7));

        // ==========================================
        // Run all queries in parallel
        // ==========================================
        const [
            salesYesterday,
            newCustomers,
            expiringToday,
            expiringTomorrow,
            overdueResult,
            stockResult,
            providerAlertsResult,
        ] = await Promise.all([

            // 1. Sales from yesterday (income + count)
            (supabase.from('sales') as any)
                .select('id, amount_gs, customer_id, slot_id')
                .eq('start_date', yesterdayStr)
                .eq('is_active', true),

            // 2. New customers created yesterday
            (supabase.from('customers') as any)
                .select('id, full_name', { count: 'exact' })
                .gte('created_at', yesterdayStr + 'T00:00:00')
                .lt('created_at', todayStr + 'T00:00:00'),

            // 3. Subscriptions expiring TODAY
            (supabase.from('sales') as any)
                .select('id, customer_id, slot_id')
                .eq('end_date', todayStr)
                .eq('is_active', true),

            // 4. Subscriptions expiring TOMORROW
            (supabase.from('sales') as any)
                .select('id, customer_id, slot_id')
                .eq('end_date', tomorrowStr)
                .eq('is_active', true),

            // 5. Overdue: is_active=false AND end_date < today
            (supabase.from('sales') as any)
                .select('id, customer_id, slot_id, end_date')
                .eq('is_active', false)
                .lt('end_date', todayStr)
                .order('end_date', { ascending: false })
                .limit(10),

            // 6. Stock available by platform (via sale_slots → mother_accounts)
            (supabase.from('sale_slots') as any)
                .select('id, status, mother_accounts:mother_account_id(platform, status)')
                .eq('status', 'available'),

            // 7. Provider alerts: mother_accounts renewing in next 7 days
            (supabase.from('mother_accounts') as any)
                .select('id, platform, email, renewal_date, status')
                .eq('status', 'active')
                .gte('renewal_date', todayStr)
                .lte('renewal_date', in7daysStr)
                .order('renewal_date', { ascending: true }),
        ]);

        // ==========================================
        // Process: Income yesterday
        // ==========================================
        const ySales = salesYesterday.data || [];
        const incomeYesterday = ySales.reduce((sum: number, s: any) => sum + (s.amount_gs || 0), 0);
        const salesCountYesterday = ySales.length;

        // ==========================================
        // Process: New customers
        // ==========================================
        const newCustomerCount = newCustomers.count ?? (newCustomers.data || []).length;

        // ==========================================
        // Process: Expiring today/tomorrow (need customer & platform names)
        // ==========================================
        async function enrichSales(salesData: any[]): Promise<Array<{ customerName: string; platform: string }>> {
            if (!salesData?.length) return [];
            const customerIds = [...new Set(salesData.map((s: any) => s.customer_id).filter(Boolean))] as string[];
            const slotIds = [...new Set(salesData.map((s: any) => s.slot_id).filter(Boolean))] as string[];

            const [custRes, slotRes] = await Promise.all([
                customerIds.length > 0
                    ? (supabase.from('customers') as any).select('id, full_name').in('id', customerIds)
                    : Promise.resolve({ data: [] }),
                slotIds.length > 0
                    ? (supabase.from('sale_slots') as any)
                        .select('id, mother_accounts:mother_account_id(platform)')
                        .in('id', slotIds)
                    : Promise.resolve({ data: [] }),
            ]);

            const custMap = new Map<string, string>((custRes.data || []).map((c: any) => [String(c.id), String(c.full_name || 'Sin nombre')]));
            const slotMap = new Map<string, string>((slotRes.data || []).map((s: any) => [String(s.id), String(s.mother_accounts?.platform || '?')]));

            return salesData.map((s: any) => ({
                customerName: custMap.get(s.customer_id) || 'Sin nombre',
                platform: slotMap.get(s.slot_id) || '?',
            }));
        }

        const [todayList, tomorrowList, overdueList] = await Promise.all([
            enrichSales(expiringToday.data || []),
            enrichSales(expiringTomorrow.data || []),
            enrichSales(overdueResult.data || []),
        ]);

        const overdueCount = overdueResult.data?.length ?? 0;

        // ==========================================
        // Process: Stock by platform
        // ==========================================
        const availableSlots = (stockResult.data || []).filter(
            (s: any) => s.mother_accounts?.status === 'active'
        );
        const stockByPlatform: Record<string, number> = {};
        for (const slot of availableSlots) {
            const platform = slot.mother_accounts?.platform || 'Desconocida';
            stockByPlatform[platform] = (stockByPlatform[platform] || 0) + 1;
        }
        const totalStock = availableSlots.length;

        // ==========================================
        // Process: Provider alerts
        // ==========================================
        const providerAlerts = (providerAlertsResult.data || []) as Array<{
            platform: string;
            email: string;
            renewal_date: string;
        }>;

        // ==========================================
        // Build Telegram message
        // ==========================================
        const todayDisplay = displayDate(nowPY);
        const yesterdayDisplay = displayDate(addDays(nowPY, -1));

        const lines: string[] = [
            `📊 *INFORME DIARIO — ClickPar*`,
            `📅 ${todayDisplay}`,
            ``,
        ];

        // --- Income ---
        lines.push(`💰 *INGRESOS DE AYER*`);
        if (salesCountYesterday === 0) {
            lines.push(`   Sin ventas registradas el ${yesterdayDisplay}`);
        } else {
            lines.push(`   Total: *${formatGs(incomeYesterday)}*`);
            lines.push(`   Ventas: *${salesCountYesterday}*`);
        }
        lines.push(`   Clientes nuevos: *${newCustomerCount}*`);
        lines.push(``);

        // --- Expiring today ---
        lines.push(`🔴 *VENCEN HOY (${todayList.length})*`);
        if (todayList.length === 0) {
            lines.push(`   ✅ Ninguno vence hoy`);
        } else {
            for (const item of todayList) {
                lines.push(`   • ${safeMd(item.customerName)} — ${safeMd(item.platform)}`);
            }
        }
        lines.push(``);

        // --- Expiring tomorrow ---
        lines.push(`🟡 *VENCEN MAÑANA (${tomorrowList.length})*`);
        if (tomorrowList.length === 0) {
            lines.push(`   ✅ Ninguno vence mañana`);
        } else {
            for (const item of tomorrowList) {
                lines.push(`   • ${safeMd(item.customerName)} — ${safeMd(item.platform)}`);
            }
        }
        lines.push(``);

        // --- Overdue ---
        lines.push(`⚠️ *VENCIDOS SIN PAGAR (${overdueCount}${overdueCount >= 10 ? '+' : ''})*`);
        if (overdueCount === 0) {
            lines.push(`   ✅ Sin cuentas vencidas`);
        } else {
            for (const item of overdueList.slice(0, 5)) {
                lines.push(`   • ${safeMd(item.customerName)} — ${safeMd(item.platform)}`);
            }
            if (overdueCount > 5) {
                lines.push(`   _...y ${overdueCount - 5} más_`);
            }
        }
        lines.push(``);

        // --- Stock ---
        lines.push(`📦 *STOCK DISPONIBLE (${totalStock} slots)*`);
        if (totalStock === 0) {
            lines.push(`   ❌ Sin stock disponible`);
        } else {
            for (const [platform, count] of Object.entries(stockByPlatform).sort((a, b) => b[1] - a[1])) {
                lines.push(`   • ${safeMd(platform)}: *${count}* slot${count > 1 ? 's' : ''}`);
            }
        }
        lines.push(``);

        // --- Provider alerts ---
        lines.push(`🏭 *ALERTAS PROVEEDOR (próx. 7 días)*`);
        if (providerAlerts.length === 0) {
            lines.push(`   ✅ Sin vencimientos próximos`);
        } else {
            for (const acct of providerAlerts) {
                const daysLeft = Math.round(
                    (new Date(acct.renewal_date + 'T12:00:00').getTime() - nowPY.getTime()) / 86400000
                );
                const emoji = daysLeft <= 2 ? '🔴' : daysLeft <= 4 ? '🟠' : '🟡';
                lines.push(`   ${emoji} *${safeMd(acct.platform)}* — vence ${formatDate(acct.renewal_date)} (${daysLeft}d)`);
            }
        }

        const message = lines.join('\n');

        // ==========================================
        // Send to all admin Telegram IDs
        // ==========================================
        const sendResults = await Promise.all(
            TELEGRAM_IDS.map(chatId => sendMessage(chatId, message))
        );

        const allSent = sendResults.every(Boolean);

        return NextResponse.json({
            success: true,
            date: todayStr,
            telegram_sent: allSent,
            telegram_recipients: TELEGRAM_IDS.length,
            summary: {
                income_yesterday: incomeYesterday,
                sales_yesterday: salesCountYesterday,
                new_customers: newCustomerCount,
                expiring_today: todayList.length,
                expiring_tomorrow: tomorrowList.length,
                overdue_count: overdueCount,
                total_stock: totalStock,
                provider_alerts: providerAlerts.length,
            },
        });
    } catch (error: any) {
        console.error('[Daily Report] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ==========================================
// Helpers
// ==========================================

/** YYYY-MM-DD for DB queries */
function toDateStr(date: Date): string {
    return date.toISOString().split('T')[0];
}

/** DD/MM/YYYY for display */
function displayDate(date: Date): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = days[date.getDay()];
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${dayName} ${d}/${m}/${y}`;
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/** Escape legacy Markdown special chars for Telegram */
function safeMd(text: string): string {
    return text.replace(/([_*`\[\]])/g, '\\$1');
}
