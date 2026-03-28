import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users, AlertTriangle, Clock } from 'lucide-react';

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function ResellerClientesPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const { data: sales } = await (supabase.from('reseller_sales') as any)
        .select('id, cliente_nombre, cliente_telefono, plataforma, slot_identifier, end_date, is_active, fecha_venta')
        .eq('reseller_id', user.id)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

    const classify = (endDate: string | null) => {
        if (!endDate) return 'normal';
        if (endDate < todayStr) return 'expired';
        if (endDate === todayStr) return 'today';
        if (endDate === tomorrowStr) return 'tomorrow';
        return 'normal';
    };

    const groups = {
        expired: sales?.filter((s: any) => classify(s.end_date) === 'expired') || [],
        today: sales?.filter((s: any) => classify(s.end_date) === 'today') || [],
        tomorrow: sales?.filter((s: any) => classify(s.end_date) === 'tomorrow') || [],
        normal: sales?.filter((s: any) => classify(s.end_date) === 'normal') || [],
    };

    const rowStyle = (status: string) => {
        if (status === 'expired') return { background: 'rgba(248,113,113,0.07)', borderLeft: '3px solid #f87171' };
        if (status === 'today') return { background: 'rgba(234,179,8,0.1)', borderLeft: '3px solid #eab308' };
        if (status === 'tomorrow') return { background: 'rgba(251,191,36,0.07)', borderLeft: '3px solid #fbbf24' };
        return {};
    };

    const statusBadge = (status: string) => {
        if (status === 'expired') return { text: 'Vencido', style: { background: 'rgba(248,113,113,0.2)', color: '#f87171' } };
        if (status === 'today') return { text: 'Vence HOY', style: { background: 'rgba(234,179,8,0.2)', color: '#eab308' } };
        if (status === 'tomorrow') return { text: 'Vence mañana', style: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' } };
        return { text: 'Activo', style: { background: 'rgba(134,239,172,0.15)', color: '#86efac' } };
    };

    const allSorted = [
        ...groups.expired,
        ...groups.today,
        ...groups.tomorrow,
        ...groups.normal,
    ];

    const urgentCount = groups.expired.length + groups.today.length + groups.tomorrow.length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Mis Clientes</h1>
                    <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                        {sales?.length || 0} clientes activos
                    </p>
                </div>
                {urgentCount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">{urgentCount} requieren atención</span>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3">
                {[
                    { label: 'Vencido', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
                    { label: 'Vence Hoy', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
                    { label: 'Vence Mañana', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
                    { label: 'Activo', color: '#86efac', bg: 'rgba(134,239,172,0.1)' },
                ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full" style={{ background: l.bg, color: l.color }}>
                        <div className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                        {l.label}
                    </div>
                ))}
            </div>

            {allSorted.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                    <Users className="h-12 w-12 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">Sin clientes activos</p>
                    <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                        Registrá una venta en <a href="/reseller/ventas" className="underline" style={{ color: '#6366f1' }}>Mis Ventas</a> para ver tus clientes acá.
                    </p>
                </div>
            ) : (
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5">
                                    {['Cliente', 'Teléfono', 'Plataforma', 'Perfil', 'Vencimiento', 'Estado'].map(h => (
                                        <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#8b8ba7' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {allSorted.map((sale: any) => {
                                    const status = classify(sale.end_date);
                                    const badge = statusBadge(status);
                                    return (
                                        <tr key={sale.id} className="border-b border-white/5" style={rowStyle(status)}>
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-white">{sale.cliente_nombre}</p>
                                            </td>
                                            <td className="px-5 py-3">
                                                {sale.cliente_telefono ? (
                                                    <a
                                                        href={`https://wa.me/${sale.cliente_telefono?.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm hover:underline"
                                                        style={{ color: '#86efac' }}
                                                    >
                                                        {sale.cliente_telefono}
                                                    </a>
                                                ) : <span style={{ color: '#8b8ba7' }}>—</span>}
                                            </td>
                                            <td className="px-5 py-3 text-white">{sale.plataforma}</td>
                                            <td className="px-5 py-3" style={{ color: '#8b8ba7' }}>{sale.slot_identifier}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {(status === 'today' || status === 'tomorrow') && <Clock className="h-3.5 w-3.5 text-yellow-400" />}
                                                    <span style={{ color: status === 'expired' ? '#f87171' : status === 'today' ? '#eab308' : status === 'tomorrow' ? '#fbbf24' : '#86efac' }}>
                                                        {formatDate(sale.end_date)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={badge.style}>
                                                    {badge.text}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
