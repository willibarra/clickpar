import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewResellerSaleModal } from '@/components/reseller/new-reseller-sale-modal';
import { ShoppingCart, Calendar, Clock, TrendingUp } from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function ResellerVentasPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const [{ data: sales }, { data: availableStock }] = await Promise.all([
        (supabase.from('reseller_sales') as any)
            .select('id, cliente_nombre, cliente_telefono, plataforma, slot_identifier, fecha_venta, precio_venta_gs, end_date, is_active')
            .eq('reseller_id', user.id)
            .order('fecha_venta', { ascending: false }),
        (supabase.from('reseller_stock') as any)
            .select('id, platform, slot_identifier, sale_price_gs')
            .eq('reseller_id', user.id)
            .eq('status', 'available'),
    ]);

    const now = new Date();
    const activeSales = sales?.filter((s: any) => s.is_active).length || 0;
    const todayStr = now.toISOString().split('T')[0];
    const todaySales = sales?.filter((s: any) => s.fecha_venta?.startsWith(todayStr)).length || 0;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthSales = sales?.filter((s: any) => s.fecha_venta >= monthStart).length || 0;
    const monthRevenue = sales?.filter((s: any) => s.fecha_venta >= monthStart)
        .reduce((sum: number, s: any) => sum + Number(s.precio_venta_gs || 0), 0) || 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Mis Ventas</h1>
                    <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>Historial y registro de ventas</p>
                </div>
                <NewResellerSaleModal availableStock={availableStock || []} resellerId={user.id} />
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Ventas Activas', val: activeSales, icon: ShoppingCart, color: '#6366f1' },
                    { label: 'Ventas Hoy', val: todaySales, icon: Clock, color: '#f97316' },
                    { label: 'Ventas del Mes', val: monthSales, icon: Calendar, color: '#22d3ee' },
                    { label: 'Ingresos del Mes', val: formatGs(monthRevenue), icon: TrendingUp, color: '#86efac' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{stat.label}</p>
                            <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                        </div>
                        <p className="text-2xl font-bold text-white">{stat.val}</p>
                    </div>
                ))}
            </div>

            {/* Sales Table */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Historial de Ventas</h2>
                    <span className="text-xs" style={{ color: '#8b8ba7' }}>{sales?.length || 0} ventas registradas</span>
                </div>
                {(!sales || sales.length === 0) ? (
                    <div className="p-12 text-center">
                        <ShoppingCart className="h-10 w-10 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                        <p className="text-white font-medium">Sin ventas registradas</p>
                        <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>Registrá tu primera venta con el botón de arriba.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Cliente</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Plataforma</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Perfil</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Precio</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Vencimiento</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {sales.map((sale: any) => {
                                    const endDate = sale.end_date;
                                    const isExpired = endDate && endDate < todayStr;
                                    const isUrgent = endDate && (endDate === todayStr || endDate === new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                                    return (
                                        <tr key={sale.id} className="hover:bg-white/3 transition-colors">
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-white">{sale.cliente_nombre}</p>
                                                {sale.cliente_telefono && <p className="text-xs" style={{ color: '#8b8ba7' }}>{sale.cliente_telefono}</p>}
                                            </td>
                                            <td className="px-5 py-3 text-white">{sale.plataforma}</td>
                                            <td className="px-5 py-3" style={{ color: '#8b8ba7' }}>{sale.slot_identifier}</td>
                                            <td className="px-5 py-3 font-medium text-white">{formatGs(Number(sale.precio_venta_gs))}</td>
                                            <td className="px-5 py-3">
                                                <span
                                                    className="text-xs font-medium"
                                                    style={{ color: isExpired ? '#f87171' : isUrgent ? '#fbbf24' : '#86efac' }}
                                                >
                                                    {formatDate(endDate)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 rounded-full text-xs" style={
                                                    sale.is_active
                                                        ? { background: 'rgba(134,239,172,0.15)', color: '#86efac' }
                                                        : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }
                                                }>
                                                    {sale.is_active ? 'Activa' : 'Inactiva'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
