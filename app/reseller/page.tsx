import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Package, ShoppingCart, Users, TrendingUp, AlertTriangle } from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export default async function ResellerDashboardPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    // Fetch all reseller data in parallel
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
        { data: stockData },
        { data: salesData },
        { data: commissionsData },
        { data: profile },
    ] = await Promise.all([
        (supabase.from('reseller_stock') as any)
            .select('id, status')
            .eq('reseller_id', user.id),
        (supabase.from('reseller_sales') as any)
            .select('id, is_active, end_date, plataforma, cliente_nombre')
            .eq('reseller_id', user.id),
        (supabase.from('reseller_commissions') as any)
            .select('commission_gs, status, created_at')
            .eq('reseller_id', user.id),
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    ]);

    const stockAvailable = stockData?.filter((s: any) => s.status === 'available').length || 0;
    const stockSold = stockData?.filter((s: any) => s.status === 'sold').length || 0;

    const activeClients = salesData?.filter((s: any) => s.is_active).length || 0;

    // Clients expiring today or tomorrow
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    const urgentClients = salesData?.filter((s: any) => {
        const d = s.end_date;
        return d === todayStr || d === tomorrowStr;
    }).length || 0;

    // Commissions this month
    const monthCommissions = commissionsData?.filter((c: any) => c.created_at >= monthStart)
        .reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;

    const pendingCommissions = commissionsData?.filter((c: any) => c.status === 'pending')
        .reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;

    const resellerName = (profile as any)?.full_name || 'Revendedor';
    const firstName = resellerName.split(' ')[0];

    const cards = [
        {
            label: 'Stock Disponible',
            value: stockAvailable,
            sub: `${stockSold} vendidos`,
            icon: Package,
            color: '#6366f1',
            bg: 'rgba(99,102,241,0.15)',
            border: 'rgba(99,102,241,0.3)',
        },
        {
            label: 'Clientes Activos',
            value: activeClients,
            sub: urgentClients > 0 ? `⚠️ ${urgentClients} vencen hoy/mañana` : 'Al día',
            icon: Users,
            color: '#22d3ee',
            bg: 'rgba(34,211,238,0.15)',
            border: 'rgba(34,211,238,0.3)',
        },
        {
            label: 'Comisiones del Mes',
            value: formatGs(monthCommissions),
            sub: `${formatGs(pendingCommissions)} pendiente de cobro`,
            icon: TrendingUp,
            color: '#86efac',
            bg: 'rgba(134,239,172,0.15)',
            border: 'rgba(134,239,172,0.3)',
        },
        {
            label: 'Ventas Totales',
            value: salesData?.length || 0,
            sub: 'Todas las ventas registradas',
            icon: ShoppingCart,
            color: '#f97316',
            bg: 'rgba(249,115,22,0.15)',
            border: 'rgba(249,115,22,0.3)',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">
                    Hola, {firstName} 👋
                </h1>
                <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                    Panel de Revendedor · ClickPar
                </p>
            </div>

            {/* Urgent Alert */}
            {urgentClients > 0 && (
                <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)' }}>
                    <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-yellow-300">
                            {urgentClients} cliente{urgentClients > 1 ? 's' : ''} vencen hoy o mañana
                        </p>
                        <p className="text-xs" style={{ color: '#8b8ba7' }}>
                            Revisá <a href="/reseller/clientes" className="underline text-yellow-400">Mis Clientes</a> para contactarlos.
                        </p>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className="glass-card rounded-2xl p-5 relative overflow-hidden group transition-all duration-300"
                        style={{ borderColor: card.border }}
                    >
                        <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full opacity-15 blur-xl" style={{ background: `radial-gradient(circle, ${card.color}, transparent)` }} />
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{card.label}</p>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                                <card.icon className="h-4 w-4" style={{ color: card.color }} />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-white">{card.value}</div>
                        <p className="mt-1 text-xs" style={{ color: '#8b8ba7' }}>{card.sub}</p>
                    </div>
                ))}
            </div>

            {/* Quick Links */}
            <div className="glass-card rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Acciones Rápidas</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                        { href: '/reseller/ventas', label: '+ Registrar Venta', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
                        { href: '/reseller/clientes', label: 'Ver Clientes', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
                        { href: '/reseller/pedir-stock', label: 'Pedir Stock', color: '#86efac', bg: 'rgba(134,239,172,0.1)' },
                    ].map(link => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-all hover:opacity-80"
                            style={{ background: link.bg, color: link.color, border: `1px solid ${link.color}30` }}
                        >
                            {link.label}
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
