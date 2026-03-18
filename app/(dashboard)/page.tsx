import { createAdminClient, createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Package, Users, DollarSign, AlertTriangle, Bell, ShoppingCart } from 'lucide-react';
import { QuickSaleWidget } from '@/components/dashboard/quick-sale';
import { ExpirationAlerts } from '@/components/dashboard/expiration-alerts';
import { PlatformStats } from '@/components/dashboard/platform-stats';
import { SearchResults } from '@/components/dashboard/search-results';
import { QuarantineAlerts } from '@/components/dashboard/quarantine-alerts';
import { OverdueClientsAlert } from '@/components/dashboard/overdue-clients-alert';
import { MessageQueueWidget } from '@/components/dashboard/message-queue-widget';

// Utilidad para formatear números en Guaraníes
function formatGs(amount: number): string {
    if (amount >= 1000000) {
        return `Gs. ${(amount / 1000000).toFixed(1)}M`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; sell?: string; platform?: string; slotId?: string }>;
}) {
    const params = await searchParams;
    const searchQuery = params.q?.trim() || '';
    const sellFromSlot = params.sell === '1' ? { platform: params.platform || '', slotId: params.slotId || '' } : null;

    // If there's a search query, render search results instead of dashboard
    if (searchQuery.length >= 2) {
        return <SearchResults query={searchQuery} />;
    }

    const supabase = await createAdminClient();

    // Obtener rol del usuario actual
    const authClient = await createClient();
    const { data: { user: currentUser } } = await authClient.auth.getUser();
    let currentRole = 'staff';
    if (currentUser) {
        const { data: profile } = await authClient
            .from('profiles')
            .select('role')
            .eq('id', currentUser.id)
            .single();
        currentRole = (profile as any)?.role || 'staff';
    }
    const isStaff = currentRole === 'staff';

    // Obtener estadísticas reales
    const [
        { count: activeAccountsCount },
        { count: totalCustomersCount },
        { count: totalSlotsCount },
        { count: availableSlotsCount },
        { count: soldSlotsCount },
        { data: salesData },
        { data: expiringAccounts },
        { data: expiringSales },
        { data: platformStats },
        { data: quarantinedRaw },
        { data: overdueRaw }
    ] = await Promise.all([
        // Cuentas activas
        supabase.from('mother_accounts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        // Total clientes
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        // Total slots
        supabase.from('sale_slots').select('*', { count: 'exact', head: true }),
        // Slots disponibles
        supabase.from('sale_slots').select('*', { count: 'exact', head: true }).eq('status', 'available'),
        // Slots vendidos
        supabase.from('sale_slots').select('*', { count: 'exact', head: true }).eq('status', 'sold'),
        // Ingresos del mes (solo para super_admin)
        isStaff
            ? Promise.resolve({ data: null })
            : supabase.from('sales')
                .select('amount_gs')
                .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        // Cuentas por vencer o ya vencidas (hasta 3 días adelante)
        supabase.from('mother_accounts')
            .select('id, platform, email, renewal_date')
            .eq('status', 'active')
            .lte('renewal_date', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('renewal_date'),
        // Ventas de clientes por vencer o ya vencidas (hasta 3 días adelante)
        (supabase.from('sales') as any)
            .select('id, end_date, amount_gs, customer_id, customers:customer_id(full_name, phone), sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, email))')
            .eq('is_active', true)
            .not('end_date', 'is', null)
            .lte('end_date', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('end_date'),
        // Stats por plataforma
        supabase.from('mother_accounts')
            .select(`
                platform,
                slot_price_gs,
                sale_slots!inner(status)
            `)
            .eq('status', 'active'),
        // Cuentas en cuarentena con sus slots (sin nested join que falla)
        (supabase.from('mother_accounts') as any)
            .select(`id, platform, email, quarantined_at, sale_slots(id, slot_identifier, status)`)
            .eq('status', 'quarantine')
            .order('quarantined_at', { ascending: true, nullsFirst: false }),
        // Ventas activas con end_date ya vencida (clientes que no renovaron)
        (supabase.from('sales') as any)
            .select(`
                id, slot_id, end_date, customer_id,
                customers:customer_id(full_name, phone),
                sale_slots:slot_id(slot_identifier, mother_accounts:mother_account_id(platform, email))
            `)
            .eq('is_active', true)
            .not('end_date', 'is', null)
            .lt('end_date', new Date().toISOString().split('T')[0])
            .order('end_date', { ascending: true })
    ]);

    // Calcular totales - salesData puede estar vacío si la tabla no existe
    const monthIncome = (salesData as { amount_gs: number }[] | null)?.reduce(
        (sum, s) => sum + (Number(s.amount_gs) || 0), 0
    ) || 0;
    const totalBalance = monthIncome; // Por ahora, balance = ingresos

    // Calcular stats por plataforma
    const platformMap = new Map<string, { available: number; total: number; price: number }>();
    platformStats?.forEach((acc: any) => {
        const platform = acc.platform;
        if (!platformMap.has(platform)) {
            platformMap.set(platform, { available: 0, total: 0, price: acc.slot_price_gs || 25000 });
        }
        const current = platformMap.get(platform)!;
        acc.sale_slots?.forEach((slot: any) => {
            current.total++;
            if (slot.status === 'available') current.available++;
        });
    });

    // Mapear cuentas en cuarentena al formato del widget
    // Fetch customer info for sold slots separately
    const quarantinedSlotIds = (quarantinedRaw || []).flatMap((acc: any) =>
        (acc.sale_slots || []).filter((s: any) => s.status === 'sold').map((s: any) => s.id)
    );
    let quarantineSlotCustomers: Record<string, { name: string; phone: string }> = {};
    if (quarantinedSlotIds.length > 0) {
        const { data: qSales } = await (supabase.from('sales') as any)
            .select('slot_id, customers:customer_id(full_name, phone)')
            .in('slot_id', quarantinedSlotIds)
            .eq('is_active', true);
        (qSales || []).forEach((s: any) => {
            quarantineSlotCustomers[s.slot_id] = {
                name: s.customers?.full_name || null,
                phone: s.customers?.phone || null,
            };
        });
    }
    const quarantinedAccounts = (quarantinedRaw || []).map((acc: any) => ({
        id: acc.id,
        platform: acc.platform,
        email: acc.email,
        quarantined_at: acc.quarantined_at,
        slots: (acc.sale_slots || []).map((slot: any) => ({
            id: slot.id,
            slot_identifier: slot.slot_identifier,
            status: slot.status,
            customer_name: quarantineSlotCustomers[slot.id]?.name || null,
            customer_phone: quarantineSlotCustomers[slot.id]?.phone || null,
        })),
    }));

    // Mapear clientes atrasados (end_date < hoy, is_active = true)
    const overdueClients = (overdueRaw || []).map((sale: any) => {
        const endDate = sale.end_date;
        const daysOverdue = endDate
            ? Math.floor((Date.now() - new Date(endDate + 'T00:00:00').getTime()) / 86400000)
            : 0;
        const slot = Array.isArray(sale.sale_slots) ? sale.sale_slots[0] : sale.sale_slots;
        const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
        const motherAccount = slot?.mother_accounts;
        return {
            saleId: sale.id,
            slotId: sale.slot_id,
            customerName: customer?.full_name || null,
            customerPhone: customer?.phone || null,
            platform: motherAccount?.platform || '—',
            accountEmail: motherAccount?.email || '—',
            slotIdentifier: slot?.slot_identifier || null,
            endDate,
            daysOverdue,
        };
    });

    // Obtener plataformas activas (con umbral de stock)
    const { data: rawPlatforms } = await supabase
        .from('platforms')
        .select('id, name, icon_color, default_slot_price_gs, stock_alert_threshold')
        .eq('is_active', true)
        .order('name');

    // Mapear a formato esperado por QuickSaleWidget
    type RawPlatform = { id: string; name: string; icon_color: string | null; default_slot_price_gs: number | null };
    const allPlatforms = (rawPlatforms as RawPlatform[] | null)?.map(p => ({
        id: p.id,
        name: p.name,
        color: p.icon_color || '#666',
        icon_letter: p.name.charAt(0).toUpperCase(),
        price: p.default_slot_price_gs || 25000
    })) || [];

    // Filter: only show platforms that have available stock
    const platforms = allPlatforms.filter(p => {
        const stats = platformMap.get(p.name);
        return stats && stats.available > 0;
    });

    // Compute stock alerts
    type PlatformWithThreshold = RawPlatform & { stock_alert_threshold: number | null };
    const stockAlerts = (rawPlatforms as PlatformWithThreshold[] | null)?.filter(p => {
        const threshold = p.stock_alert_threshold || 0;
        if (threshold <= 0) return false;
        const stats = platformMap.get(p.name);
        const available = stats?.available || 0;
        return available < threshold;
    }).map(p => ({
        name: p.name,
        available: platformMap.get(p.name)?.available || 0,
        threshold: p.stock_alert_threshold || 0,
    })) || [];


    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Bienvenido al panel de gestión de ClickPar
                    </p>
                </div>
                {/* Expiration Alert Badge */}
                {((expiringAccounts && expiringAccounts.length > 0) || (expiringSales && expiringSales.length > 0)) && (
                    <div className="flex items-center gap-2 rounded-lg bg-[#F97316]/20 px-4 py-2 text-[#F97316]">
                        <Bell className="h-5 w-5 animate-pulse" />
                        <span className="font-medium">
                            {(expiringAccounts?.length || 0) + (expiringSales?.length || 0)} vencimientos próximos
                        </span>
                    </div>
                )}
            </div>

            {/* Quick Sale + Alerts Row */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Quick Sale Widget */}
                <QuickSaleWidget platforms={platforms || []} preselect={sellFromSlot} />

                {/* Expiration Alerts */}
                <ExpirationAlerts accounts={expiringAccounts || []} expiringSales={expiringSales || []} />
            </div>

            {/* Quarantine Alerts */}
            <QuarantineAlerts accounts={quarantinedAccounts} />

            {/* Message Queue Summary */}
            <MessageQueueWidget />

            {/* Overdue Clients — falta liberar */}
            <OverdueClientsAlert clients={overdueClients} />

            {/* Stock Low Alerts */}
            {stockAlerts.length > 0 && (
                <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 to-[#1a1a1a]">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-3 mb-3">
                            <Package className="h-5 w-5 text-red-400" />
                            <span className="text-sm font-semibold text-foreground">Stock Bajo</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {stockAlerts.map(a => (
                                <div key={a.name} className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
                                    <span className="text-sm font-medium text-foreground">{a.name}</span>
                                    <span className="text-xs text-red-400 font-bold">{a.available}/{a.threshold}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Total Balance Card — solo visible para super_admin */}
            {!isStaff && (
                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <p className="text-sm text-muted-foreground">BALANCE TOTAL DEL MES</p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-foreground">{formatGs(totalBalance)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-sm text-[#86EFAC]">
                            <TrendingUp className="h-4 w-4" />
                            <span>Ingresos del mes actual</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Active Accounts */}
                <Card className="border-border bg-[#1a1a1a]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cuentas Madre
                        </CardTitle>
                        <div className="rounded-lg bg-[#86EFAC]/20 p-2">
                            <Package className="h-4 w-4 text-[#86EFAC]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{activeAccountsCount || 0}</div>
                        <p className="mt-1 text-xs text-muted-foreground">Activas en inventario</p>
                    </CardContent>
                </Card>

                {/* Total Slots */}
                <Card className="border-border bg-[#1a1a1a]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Slots
                        </CardTitle>
                        <div className="rounded-lg bg-[#0063e5]/20 p-2">
                            <ShoppingCart className="h-4 w-4 text-[#0063e5]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-[#86EFAC]">{availableSlotsCount || 0}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-lg text-muted-foreground">{totalSlotsCount || 0}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Disponibles / Total</p>
                    </CardContent>
                </Card>

                {/* Total Customers */}
                <Card className="border-border bg-[#1a1a1a]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Clientes Registrados
                        </CardTitle>
                        <div className="rounded-lg bg-[#F97316]/20 p-2">
                            <Users className="h-4 w-4 text-[#F97316]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{totalCustomersCount || 0}</div>
                        <p className="mt-1 text-xs text-muted-foreground">En la base de datos</p>
                    </CardContent>
                </Card>

                {/* Monthly Revenue — solo visible para super_admin */}
                {!isStaff && (
                    <Card className="border-border bg-[#1a1a1a]">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Ingresos del Mes
                            </CardTitle>
                            <div className="rounded-lg bg-[#86EFAC]/20 p-2">
                                <DollarSign className="h-4 w-4 text-[#86EFAC]" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground">{formatGs(monthIncome)}</div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {new Date().toLocaleDateString('es-PY', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Platform Cards */}
            <PlatformStats platforms={platforms || []} stats={Object.fromEntries(platformMap)} />
        </div>
    );
}
