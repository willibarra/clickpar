import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TrendingUp, CheckCircle, Clock, DollarSign } from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function formatDateShort(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function ResellerComisionesPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: commissions }, { data: config }] = await Promise.all([
        (supabase.from('reseller_commissions') as any)
            .select('id, commission_percent, base_amount_gs, commission_gs, status, paid_at, created_at, reseller_sale_id')
            .eq('reseller_id', user.id)
            .order('created_at', { ascending: false }),
        (supabase.from('reseller_config') as any)
            .select('commission_percent')
            .eq('reseller_id', user.id)
            .single(),
    ]);

    const totalEarned = commissions?.reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;
    const pendingAmount = commissions?.filter((c: any) => c.status === 'pending').reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;
    const paidAmount = commissions?.filter((c: any) => c.status === 'paid').reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;
    const monthAmount = commissions?.filter((c: any) => c.created_at >= monthStart).reduce((sum: number, c: any) => sum + Number(c.commission_gs || 0), 0) || 0;

    const commissionPercent = (config as any)?.commission_percent || 10;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Mis Comisiones</h1>
                <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                    Tu porcentaje de comisión: <span style={{ color: '#6366f1' }} className="font-semibold">{commissionPercent}%</span> por venta
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Total Acumulado', val: formatGs(totalEarned), icon: TrendingUp, color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
                    { label: 'Pendiente de Cobro', val: formatGs(pendingAmount), icon: Clock, color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
                    { label: 'Ya Cobrado', val: formatGs(paidAmount), icon: CheckCircle, color: '#86efac', bg: 'rgba(134,239,172,0.15)' },
                    { label: 'Este Mes', val: formatGs(monthAmount), icon: DollarSign, color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{stat.label}</p>
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: stat.bg }}>
                                <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-white">{stat.val}</p>
                    </div>
                ))}
            </div>

            {/* Pending alert */}
            {pendingAmount > 0 && (
                <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}>
                    <Clock className="h-5 w-5 text-orange-400 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-orange-300">Tenés {formatGs(pendingAmount)} pendiente de cobro</p>
                        <p className="text-xs" style={{ color: '#8b8ba7' }}>Contactá a ClickPar para coordinar el pago.</p>
                    </div>
                </div>
            )}

            {/* History */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">Historial de Comisiones</h2>
                </div>
                {(!commissions || commissions.length === 0) ? (
                    <div className="p-12 text-center">
                        <TrendingUp className="h-10 w-10 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                        <p className="text-white font-medium">Sin comisiones aún</p>
                        <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>Las comisiones se generan automáticamente con cada venta registrada.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5">
                                    {['Fecha', 'Venta', 'Precio Venta', 'Comisión %', 'Comisión Gs.', 'Estado'].map(h => (
                                        <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {commissions.map((c: any) => (
                                    <tr key={c.id} className="hover:bg-white/3 transition-colors">
                                        <td className="px-5 py-3" style={{ color: '#8b8ba7' }}>{formatDateShort(c.created_at)}</td>
                                        <td className="px-5 py-3">
                                            <span className="text-xs font-mono" style={{ color: '#8b8ba7' }}>#{c.reseller_sale_id?.slice(0, 8)}</span>
                                        </td>
                                        <td className="px-5 py-3 text-white">{formatGs(Number(c.base_amount_gs))}</td>
                                        <td className="px-5 py-3" style={{ color: '#6366f1' }}>{c.commission_percent}%</td>
                                        <td className="px-5 py-3 font-semibold text-white">{formatGs(Number(c.commission_gs))}</td>
                                        <td className="px-5 py-3">
                                            <span className="px-2 py-0.5 rounded-full text-xs" style={
                                                c.status === 'paid'
                                                    ? { background: 'rgba(134,239,172,0.15)', color: '#86efac' }
                                                    : { background: 'rgba(249,115,22,0.15)', color: '#f97316' }
                                            }>
                                                {c.status === 'paid' ? 'Cobrado' : 'Pendiente'}
                                            </span>
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
