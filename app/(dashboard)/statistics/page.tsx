import { createAdminClient } from '@/lib/supabase/server';
import { SalesVelocityTable } from '@/components/statistics/sales-velocity-table';
import { StockForecast } from '@/components/statistics/stock-forecast';
import { WeeklyTrendChart } from '@/components/statistics/weekly-trend-chart';
import { TopCustomers } from '@/components/statistics/top-customers';
import { SmartRecommendations } from '@/components/statistics/smart-recommendations';

// ── Helpers ──────────────────────────────────────────────────────────────────
function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.getFullYear(), d.getMonth(), diff);
}

function weeksAgo(n: number) {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() - n * 7);
    return d;
}

function weekLabel(d: Date) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function StatisticsPage() {
    const supabase = await createAdminClient();
    const now = new Date();
    const today = startOfDay(now);
    const thisWeekStart = startOfWeek(now);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // ── Fetch platforms ─────────────────────────────────────────────────────
    const { data: rawPlatforms } = await (supabase
        .from('platforms') as any)
        .select('id, name, icon_color, default_slot_price_gs')
        .eq('is_active', true)
        .order('name');

    const platforms = ((rawPlatforms || []) as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        color: p.icon_color || '#666',
        price: p.default_slot_price_gs || 25000,
    }));
    const platformColors = new Map(platforms.map(p => [p.name, p.color]));

    // ── Fetch all sales from last 30 days with slot/platform info ───────────
    const { data: recentSalesRaw } = await (supabase.from('sales') as any)
        .select('id, amount_gs, created_at, customer_id, slot_id, is_active, end_date')
        .gte('created_at', thirtyDaysAgo.toISOString());

    const recentSales = (recentSalesRaw || []) as any[];

    // Build slotId -> platform mapping
    const slotIds = [...new Set(recentSales.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotPlatformMap = new Map<string, { platform: string; motherAccountId: string }>();

    if (slotIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < slotIds.length; i += 200) chunks.push(slotIds.slice(i, i + 200));
        for (const chunk of chunks) {
            const { data: slots } = await (supabase.from('sale_slots') as any)
                .select('id, mother_account_id, mother_accounts:mother_account_id(platform)')
                .in('id', chunk);
            (slots || []).forEach((s: any) => {
                slotPlatformMap.set(s.id, {
                    platform: s.mother_accounts?.platform || 'Otros',
                    motherAccountId: s.mother_account_id,
                });
            });
        }
    }

    // Enrich sales with platform
    const enrichedSales = recentSales.map(s => ({
        ...s,
        platform: slotPlatformMap.get(s.slot_id)?.platform || 'Otros',
        createdDate: new Date(s.created_at),
    }));

    // ── Fetch stock info ────────────────────────────────────────────────────
    const { data: stockRaw } = await (supabase.from('mother_accounts') as any)
        .select('platform, sale_slots!inner(status)')
        .eq('status', 'active');

    const stockMap = new Map<string, { available: number; total: number }>();
    (stockRaw || []).forEach((acc: any) => {
        const platform = acc.platform;
        if (!stockMap.has(platform)) stockMap.set(platform, { available: 0, total: 0 });
        const s = stockMap.get(platform)!;
        (acc.sale_slots || []).forEach((slot: any) => {
            s.total++;
            if (slot.status === 'available') s.available++;
        });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION A: Sales Velocity
    // ══════════════════════════════════════════════════════════════════════════
    const prevWeekStart = weeksAgo(1);
    const prevWeekEnd = new Date(thisWeekStart.getTime() - 1);

    const velocityMap = new Map<string, {
        today: number;
        thisWeek: number;
        thisMonth: number;
        last30: number;
        prevWeek: number;
    }>();

    for (const sale of enrichedSales) {
        if (!velocityMap.has(sale.platform)) {
            velocityMap.set(sale.platform, { today: 0, thisWeek: 0, thisMonth: 0, last30: 0, prevWeek: 0 });
        }
        const v = velocityMap.get(sale.platform)!;
        v.last30++;
        if (sale.createdDate >= today) v.today++;
        if (sale.createdDate >= thisWeekStart) v.thisWeek++;
        if (sale.createdDate >= thisMonthStart) v.thisMonth++;
        if (sale.createdDate >= prevWeekStart && sale.createdDate < thisWeekStart) v.prevWeek++;
    }

    const velocityData = platforms
        .filter(p => velocityMap.has(p.name) || stockMap.has(p.name))
        .map(p => {
            const v = velocityMap.get(p.name) || { today: 0, thisWeek: 0, thisMonth: 0, last30: 0, prevWeek: 0 };
            return {
                platform: p.name,
                color: p.color,
                today: v.today,
                thisWeek: v.thisWeek,
                thisMonth: v.thisMonth,
                avgPerDay: v.last30 / 30,
                prevWeek: v.prevWeek,
            };
        })
        .sort((a, b) => b.thisMonth - a.thisMonth);

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION B: Stock Forecast
    // ══════════════════════════════════════════════════════════════════════════
    const stockForecastData = platforms
        .filter(p => stockMap.has(p.name))
        .map(p => {
            const stock = stockMap.get(p.name)!;
            const v = velocityMap.get(p.name);
            const avgPerDay = v ? v.last30 / 30 : 0;
            const daysLeft = avgPerDay > 0 ? Math.round(stock.available / avgPerDay) : Infinity;
            const twoWeeksNeed = Math.ceil(avgPerDay * 14);
            const recommendBuy = Math.max(0, twoWeeksNeed - stock.available);

            return {
                platform: p.name,
                color: p.color,
                available: stock.available,
                avgPerDay,
                daysLeft,
                recommendBuy,
            };
        })
        .filter(item => item.available > 0 || item.avgPerDay > 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION C: Weekly Trends (last 4 weeks)
    // ══════════════════════════════════════════════════════════════════════════
    const weekBoundaries = Array.from({ length: 5 }, (_, i) => weeksAgo(4 - i));

    const weeklyPlatformCounts = new Map<string, number[]>();
    for (const p of platforms) {
        weeklyPlatformCounts.set(p.name, [0, 0, 0, 0]);
    }

    for (const sale of enrichedSales) {
        const counts = weeklyPlatformCounts.get(sale.platform);
        if (!counts) continue;
        for (let w = 0; w < 4; w++) {
            if (sale.createdDate >= weekBoundaries[w] && sale.createdDate < weekBoundaries[w + 1]) {
                counts[w]++;
                break;
            }
        }
    }

    const weeklyTrendData = platforms
        .filter(p => {
            const counts = weeklyPlatformCounts.get(p.name);
            return counts && counts.some(c => c > 0);
        })
        .map(p => ({
            platform: p.name,
            color: p.color,
            weeks: (weeklyPlatformCounts.get(p.name) || [0, 0, 0, 0]).map((count, i) => ({
                label: weekLabel(weekBoundaries[i]),
                count,
            })),
        }))
        .sort((a, b) => {
            const totalA = a.weeks.reduce((s, w) => s + w.count, 0);
            const totalB = b.weeks.reduce((s, w) => s + w.count, 0);
            return totalB - totalA;
        });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION D: Top Customers
    // ══════════════════════════════════════════════════════════════════════════
    // Get all sales (not just recent) for customer stats
    const { data: allSalesRaw } = await (supabase.from('sales') as any)
        .select('id, customer_id, amount_gs, slot_id, is_active, end_date, created_at');

    const allSales = (allSalesRaw || []) as any[];

    // Build customer metrics
    const customerMetrics = new Map<string, {
        totalSales: number;
        totalAmount: number;
        renewals: number; // sales marked active that previously had an end_date
        expired: number;  // sales with end_date < now and !is_active
        platforms: Set<string>;
    }>();

    for (const sale of allSales) {
        const cid = sale.customer_id;
        if (!cid) continue;
        if (!customerMetrics.has(cid)) {
            customerMetrics.set(cid, { totalSales: 0, totalAmount: 0, renewals: 0, expired: 0, platforms: new Set() });
        }
        const m = customerMetrics.get(cid)!;
        m.totalSales++;
        m.totalAmount += Number(sale.amount_gs) || 0;

        const platform = slotPlatformMap.get(sale.slot_id)?.platform;
        if (platform) m.platforms.add(platform);

        if (sale.end_date) {
            const endDate = new Date(sale.end_date + 'T00:00:00');
            if (!sale.is_active && endDate < now) m.expired++;
        }
    }

    // Count renewals: customers with >1 sale to the same platform
    const customerPlatformSales = new Map<string, Map<string, number>>();
    for (const sale of allSales) {
        const cid = sale.customer_id;
        if (!cid) continue;
        const platform = slotPlatformMap.get(sale.slot_id)?.platform || 'Otros';
        if (!customerPlatformSales.has(cid)) customerPlatformSales.set(cid, new Map());
        const pm = customerPlatformSales.get(cid)!;
        pm.set(platform, (pm.get(platform) || 0) + 1);
    }
    for (const [cid, pm] of customerPlatformSales) {
        const m = customerMetrics.get(cid);
        if (!m) continue;
        for (const [, count] of pm) {
            if (count > 1) m.renewals += count - 1;
        }
    }

    // Get top 10 customer IDs
    const topCustomerIds = Array.from(customerMetrics.entries())
        .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
        .slice(0, 10)
        .map(([id]) => id);

    // Fetch names
    const customerNameMap = new Map<string, { name: string; phone: string | null }>();
    if (topCustomerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone')
            .in('id', topCustomerIds);
        (customers || []).forEach((c: any) => {
            customerNameMap.set(c.id, { name: c.full_name || 'Sin nombre', phone: c.phone });
        });
    }

    const topCustomersData = topCustomerIds.map(id => {
        const m = customerMetrics.get(id)!;
        const info = customerNameMap.get(id) || { name: 'Sin nombre', phone: null };
        const totalCompleted = m.renewals + m.expired;
        const renewalRate = totalCompleted > 0 ? Math.round((m.renewals / totalCompleted) * 100) : (m.totalSales > 1 ? 100 : 0);
        return {
            name: info.name,
            phone: info.phone,
            totalSales: m.totalSales,
            totalAmount: m.totalAmount,
            renewals: m.renewals,
            expired: m.expired,
            renewalRate,
            platforms: [...m.platforms],
        };
    });

    // Global renewal/churn rates
    let globalRenewals = 0;
    let globalExpired = 0;
    for (const [, m] of customerMetrics) {
        globalRenewals += m.renewals;
        globalExpired += m.expired;
    }
    const globalTotal = globalRenewals + globalExpired;
    const globalRenewalRate = globalTotal > 0 ? Math.round((globalRenewals / globalTotal) * 100) : 0;
    const globalChurnRate = globalTotal > 0 ? Math.round((globalExpired / globalTotal) * 100) : 0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION E: Smart Recommendations
    // ══════════════════════════════════════════════════════════════════════════
    type Priority = 'high' | 'medium' | 'info';
    type IconType = 'trending_up' | 'trending_down' | 'alert' | 'dollar' | 'users' | 'package';

    const recommendations: {
        id: string; title: string; description: string;
        priority: Priority; icon: IconType; category: string;
    }[] = [];

    // 1. Stock alerts
    for (const item of stockForecastData) {
        if (item.daysLeft <= 3 && isFinite(item.daysLeft)) {
            recommendations.push({
                id: `stock-critical-${item.platform}`,
                title: `Stock crítico: ${item.platform}`,
                description: `Solo quedan ${item.available} slots (≈${item.daysLeft} días). Comprar ${item.recommendBuy} unidades urgente.`,
                priority: 'high',
                icon: 'alert',
                category: 'Stock',
            });
        } else if (item.daysLeft <= 7 && isFinite(item.daysLeft)) {
            recommendations.push({
                id: `stock-low-${item.platform}`,
                title: `Stock bajo: ${item.platform}`,
                description: `Quedan ${item.available} slots (≈${item.daysLeft} días). Recomendado comprar ${item.recommendBuy} más.`,
                priority: 'medium',
                icon: 'package',
                category: 'Stock',
            });
        }
    }

    // 2. High-demand platform comparison
    const sortedByVelocity = [...velocityData].sort((a, b) => b.avgPerDay - a.avgPerDay);
    if (sortedByVelocity.length >= 2) {
        const top = sortedByVelocity[0];
        const second = sortedByVelocity[1];
        if (top.avgPerDay > 0 && second.avgPerDay > 0 && top.avgPerDay / second.avgPerDay >= 2) {
            recommendations.push({
                id: 'high-demand-platform',
                title: `${top.platform} se vende ${(top.avgPerDay / second.avgPerDay).toFixed(1)}x más que ${second.platform}`,
                description: `${top.platform} tiene ${top.avgPerDay.toFixed(1)} ventas/día vs ${second.avgPerDay.toFixed(1)} de ${second.platform}. Considerar aumentar stock o ajustar precios.`,
                priority: 'info',
                icon: 'trending_up',
                category: 'Demanda',
            });
        }
    }

    // 3. Platforms with no sales in the last week
    for (const p of platforms) {
        const v = velocityMap.get(p.name);
        const stock = stockMap.get(p.name);
        if (stock && stock.available > 5 && (!v || v.thisWeek === 0) && v?.last30 && v.last30 > 0) {
            recommendations.push({
                id: `stale-${p.name}`,
                title: `${p.name}: sin ventas esta semana`,
                description: `Hay ${stock.available} slots disponibles pero 0 ventas esta semana. Considerar promoción o bajar precio.`,
                priority: 'medium',
                icon: 'trending_down',
                category: 'Ventas',
            });
        }
    }

    // 4. Top customer concentration
    if (topCustomersData.length >= 3) {
        const top3Amount = topCustomersData.slice(0, 3).reduce((s, c) => s + c.totalAmount, 0);
        const totalAllCustomers = Array.from(customerMetrics.values()).reduce((s, m) => s + m.totalAmount, 0);
        if (totalAllCustomers > 0) {
            const concentration = Math.round((top3Amount / totalAllCustomers) * 100);
            if (concentration > 30) {
                recommendations.push({
                    id: 'customer-concentration',
                    title: `Top 3 clientes = ${concentration}% de ingresos`,
                    description: `${topCustomersData[0].name}, ${topCustomersData[1].name} y ${topCustomersData[2].name} representan casi un tercio de tus ingresos. Diversificar base de clientes.`,
                    priority: concentration > 50 ? 'high' : 'info',
                    icon: 'users',
                    category: 'Clientes',
                });
            }
        }
    }

    // 5. Low margin alert per platform
    const { data: accountsWithCost } = await (supabase.from('mother_accounts') as any)
        .select('id, platform, purchase_cost_gs, max_slots, slot_price_gs')
        .eq('status', 'active')
        .gt('purchase_cost_gs', 0);

    const platformMargins = new Map<string, { cost: number; revenue: number }>();
    for (const acc of (accountsWithCost || [])) {
        const p = acc.platform;
        if (!platformMargins.has(p)) platformMargins.set(p, { cost: 0, revenue: 0 });
        const m = platformMargins.get(p)!;
        m.cost += Number(acc.purchase_cost_gs) || 0;
        m.revenue += (Number(acc.slot_price_gs) || 0) * (Number(acc.max_slots) || 1);
    }

    for (const [platform, m] of platformMargins) {
        if (m.cost > 0 && m.revenue > 0) {
            const margin = ((m.revenue - m.cost) / m.revenue) * 100;
            if (margin < 20 && margin > 0) {
                recommendations.push({
                    id: `low-margin-${platform}`,
                    title: `Margen bajo en ${platform}: ${Math.round(margin)}%`,
                    description: `El margen de ganancia es bajo. Considerar subir precio de venta o buscar un proveedor más económico.`,
                    priority: 'medium',
                    icon: 'dollar',
                    category: 'Rentabilidad',
                });
            }
        }
    }

    // Sort recommendations: high first
    const priorityOrder = { high: 0, medium: 1, info: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Estadísticas</h1>
                <p className="text-muted-foreground text-sm">
                    Análisis de ventas, stock y comportamiento de clientes
                </p>
            </div>

            {/* Quick KPIs row */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/40 bg-[#1a1a1a] p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ventas Hoy</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
                        {enrichedSales.filter(s => s.createdDate >= today).length}
                    </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-[#1a1a1a] p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Esta Semana</p>
                    <p className="text-2xl font-bold text-[#86EFAC] tabular-nums mt-0.5">
                        {enrichedSales.filter(s => s.createdDate >= thisWeekStart).length}
                    </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-[#1a1a1a] p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Este Mes</p>
                    <p className="text-2xl font-bold text-blue-400 tabular-nums mt-0.5">
                        {enrichedSales.filter(s => s.createdDate >= thisMonthStart).length}
                    </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-[#1a1a1a] p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Prom. Diario (30d)</p>
                    <p className="text-2xl font-bold text-purple-400 tabular-nums mt-0.5">
                        {(enrichedSales.length / 30).toFixed(1)}
                    </p>
                </div>
            </div>

            {/* Sales Velocity + Stock Forecast */}
            <div className="grid gap-4 lg:grid-cols-2">
                <SalesVelocityTable data={velocityData} />
                <StockForecast data={stockForecastData} />
            </div>

            {/* Weekly Trends */}
            <WeeklyTrendChart data={weeklyTrendData} />

            {/* Top Customers */}
            <TopCustomers
                data={topCustomersData}
                globalRenewalRate={globalRenewalRate}
                globalChurnRate={globalChurnRate}
            />

            {/* Smart Recommendations */}
            <SmartRecommendations recommendations={recommendations} />
        </div>
    );
}
