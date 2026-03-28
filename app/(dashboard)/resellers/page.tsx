import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Store, Clock } from 'lucide-react';
import { NewResellerUserModal } from '@/components/reseller/new-reseller-user-modal';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export default async function ResellersAdminPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'super_admin') redirect('/');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch all resellers
    const { data: resellers } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone_number, created_at')
        .eq('role', 'reseller')
        .order('created_at', { ascending: false });

    // Fetch commissions per reseller this month
    const { data: allCommissions } = await (supabase.from('reseller_commissions') as any)
        .select('reseller_id, commission_gs, status, created_at');

    // Fetch stock per reseller
    const { data: allStock } = await (supabase.from('reseller_stock') as any)
        .select('reseller_id, status');

    // Fetch recent sales
    const { data: allSales } = await (supabase.from('reseller_sales') as any)
        .select('reseller_id, precio_venta_gs, fecha_venta');

    // Pending stock requests
    const { data: pendingRequests } = await (supabase.from('reseller_stock_requests') as any)
        .select('id, reseller_id, platform, quantity_requested, created_at, status')
        .eq('status', 'pending')
        .order('created_at');

    // Build reseller stats map
    const resellerStats = (resellers || []).map((r: any) => {
        const commissions = allCommissions?.filter((c: any) => c.reseller_id === r.id) || [];
        const stock = allStock?.filter((s: any) => s.reseller_id === r.id) || [];
        const sales = allSales?.filter((s: any) => s.reseller_id === r.id) || [];

        const monthCommissions = commissions.filter((c: any) => c.created_at >= monthStart);
        const pendingGs = commissions.filter((c: any) => c.status === 'pending').reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0);
        const monthSalesCount = sales.filter((s: any) => s.fecha_venta >= monthStart).length;
        const stockAvailable = stock.filter((s: any) => s.status === 'available').length;
        const stockTotal = stock.length;
        const monthCommissionGs = monthCommissions.reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0);

        return {
            ...r,
            monthSalesCount,
            stockAvailable,
            stockTotal,
            monthCommissionGs,
            pendingGs,
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Revendedores</h1>
                    <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                        {resellers?.length || 0} revendedores registrados
                    </p>
                </div>
            <div className="flex items-center gap-3">
                <a
                    href="/stock-requests"
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}
                >
                    <Clock className="h-4 w-4" />
                    {pendingRequests?.length || 0} solicitudes pendientes
                </a>
                <NewResellerUserModal />
            </div>
            </div>

            {(!resellers || resellers.length === 0) ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                    <Store className="h-12 w-12 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">Sin revendedores registrados</p>
                    <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                        Hacé clic en <strong className="text-indigo-400">+ Nuevo Revendedor</strong> para crear uno.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {resellerStats.map((r: any) => (
                        <a
                            key={r.id}
                            href={`/resellers/${r.id}`}
                            className="glass-card rounded-2xl p-5 flex items-center gap-5 hover:border-indigo-500/30 transition-all block"
                        >
                            {/* Avatar */}
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                {r.full_name?.charAt(0) || 'R'}
                            </div>

                            {/* Name */}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white">{r.full_name || '(sin nombre)'}</p>
                                <p className="text-xs" style={{ color: '#8b8ba7' }}>{r.phone_number || 'Sin teléfono'}</p>
                            </div>

                            {/* Stats */}
                            <div className="hidden sm:flex items-center gap-6">
                                <div className="text-center">
                                    <p className="text-lg font-bold text-white">{r.monthSalesCount}</p>
                                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Ventas/mes</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold" style={{ color: '#6366f1' }}>{r.stockAvailable}</p>
                                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Stock dispon.</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold" style={{ color: '#86efac' }}>{formatGs(r.monthCommissionGs)}</p>
                                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Comis. mes</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold" style={{ color: r.pendingGs > 0 ? '#f97316' : '#8b8ba7' }}>{formatGs(r.pendingGs)}</p>
                                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Pendiente</p>
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="text-white/30 shrink-0">›</div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
