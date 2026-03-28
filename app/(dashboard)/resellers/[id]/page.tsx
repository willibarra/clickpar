import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AssignStockModal } from '@/components/reseller/assign-stock-modal';
import { CommissionConfigForm } from '@/components/reseller/commission-config-form';
import { ArrowLeft, Package, TrendingUp, ShoppingCart, Users } from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function formatDate(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: resellerId } = await params;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const { data: adminProfile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!adminProfile || adminProfile.role !== 'super_admin') redirect('/');

    const [
        { data: resellerProfile },
        { data: stock },
        { data: sales },
        { data: commissions },
        { data: config },
        { data: availableSlots },
    ] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone_number, created_at').eq('id', resellerId).single(),
        (supabase.from('reseller_stock') as any)
            .select('id, platform, slot_identifier, status, sale_price_gs, assigned_at')
            .eq('reseller_id', resellerId)
            .order('status')
            .order('platform'),
        (supabase.from('reseller_sales') as any)
            .select('id, cliente_nombre, plataforma, slot_identifier, precio_venta_gs, end_date, fecha_venta, is_active')
            .eq('reseller_id', resellerId)
            .order('fecha_venta', { ascending: false })
            .limit(20),
        (supabase.from('reseller_commissions') as any)
            .select('commission_gs, status')
            .eq('reseller_id', resellerId),
        (supabase.from('reseller_config') as any)
            .select('commission_percent')
            .eq('reseller_id', resellerId)
            .single(),
        // Available slots not yet assigned to any reseller
        (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, mother_account_id, mother_accounts(platform)')
            .eq('status', 'available')
            .not('id', 'in',
                `(select slot_id from reseller_stock where status = 'available')`
            ),
    ]);

    if (!resellerProfile) redirect('/resellers');

    const totalCommissions = commissions?.reduce((s: number, c: any) => s + Number(c.commission_gs || 0), 0) || 0;
    const pendingCommissions = commissions?.filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + Number(c.commission_gs || 0), 0) || 0;
    const stockAvailable = stock?.filter((s: any) => s.status === 'available').length || 0;
    const currentPercent = (config as any)?.commission_percent ?? 10;

    // Get available slots separately (the subquery above may not work with Supabase, use simpler approach)
    const assignedSlotIds = stock?.map((s: any) => s.slot_id).filter(Boolean) || [];
    const { data: slotsForAssign } = await (supabase.from('sale_slots') as any)
        .select('id, slot_identifier, mother_account_id, mother_accounts!inner(platform)')
        .eq('status', 'available');

    const availableForAssign = (slotsForAssign || []).filter((s: any) => !assignedSlotIds.includes(s.id));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <a href="/resellers" className="rounded-xl p-2 hover:bg-white/10 transition-colors">
                    <ArrowLeft className="h-5 w-5 text-white" />
                </a>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">{(resellerProfile as any).full_name || 'Revendedor'}</h1>
                    <p className="text-sm" style={{ color: '#8b8ba7' }}>{(resellerProfile as any).phone_number || 'Sin teléfono'}</p>
                </div>
                <AssignStockModal resellerId={resellerId} availableSlots={availableForAssign} />
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Stock Disponible', val: stockAvailable, icon: Package, color: '#6366f1' },
                    { label: 'Stock Total', val: stock?.length || 0, icon: Package, color: '#8b8ba7' },
                    { label: 'Ventas Totales', val: sales?.length || 0, icon: ShoppingCart, color: '#22d3ee' },
                    { label: 'Comisiones Totales', val: formatGs(totalCommissions), icon: TrendingUp, color: '#86efac' },
                ].map(s => (
                    <div key={s.label} className="glass-card rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{s.label}</p>
                            <s.icon className="h-4 w-4" style={{ color: s.color }} />
                        </div>
                        <p className="text-2xl font-bold text-white">{s.val}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Commission Config */}
                <div className="glass-card rounded-2xl p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-white">Configuración de Comisión</h2>
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
                        <span className="text-sm" style={{ color: '#8b8ba7' }}>Comisión pendiente de pago:</span>
                        <span className="font-bold text-orange-400">{formatGs(pendingCommissions)}</span>
                    </div>
                    <CommissionConfigForm resellerId={resellerId} currentPercent={currentPercent} />
                </div>

                {/* Stock Assigned */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5">
                        <h2 className="text-sm font-semibold text-white">Stock Asignado ({stock?.length || 0})</h2>
                    </div>
                    {(!stock || stock.length === 0) ? (
                        <div className="p-8 text-center">
                            <Package className="h-8 w-8 mx-auto mb-2" style={{ color: '#8b8ba7' }} />
                            <p className="text-sm text-white">Sin stock asignado</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                            {stock.map((item: any) => (
                                <div key={item.id} className="flex items-center justify-between px-5 py-3">
                                    <div>
                                        <p className="text-sm text-white">{item.platform}</p>
                                        <p className="text-xs" style={{ color: '#8b8ba7' }}>{item.slot_identifier}</p>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded-full" style={
                                        item.status === 'available'
                                            ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
                                            : { background: 'rgba(134,239,172,0.15)', color: '#86efac' }
                                    }>
                                        {item.status === 'available' ? 'Disponible' : 'Vendido'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Recent Sales */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">Últimas Ventas</h2>
                </div>
                {(!sales || sales.length === 0) ? (
                    <div className="p-8 text-center">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2" style={{ color: '#8b8ba7' }} />
                        <p className="text-sm text-white">Sin ventas registradas</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5">
                                    {['Cliente', 'Plataforma', 'Precio', 'Vencimiento', 'Estado'].map(h => (
                                        <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {sales.map((s: any) => (
                                    <tr key={s.id} className="hover:bg-white/3 transition-colors">
                                        <td className="px-5 py-3 text-white font-medium">{s.cliente_nombre}</td>
                                        <td className="px-5 py-3 text-white">{s.plataforma}</td>
                                        <td className="px-5 py-3 text-white">{formatGs(Number(s.precio_venta_gs))}</td>
                                        <td className="px-5 py-3" style={{ color: '#8b8ba7' }}>{s.end_date ? formatDate(s.end_date) : '—'}</td>
                                        <td className="px-5 py-3">
                                            <span className="px-2 py-0.5 rounded-full text-xs" style={
                                                s.is_active
                                                    ? { background: 'rgba(134,239,172,0.15)', color: '#86efac' }
                                                    : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }
                                            }>{s.is_active ? 'Activa' : 'Inactiva'}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
