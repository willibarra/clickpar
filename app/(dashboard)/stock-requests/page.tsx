import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { StockRequestActions } from '@/components/reseller/stock-request-actions';

function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default async function StockRequestsPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'super_admin') redirect('/');

    // Fetch all requests with reseller info
    const { data: requests } = await (supabase.from('reseller_stock_requests') as any)
        .select('id, platform, quantity_requested, notes, status, admin_notes, created_at, reseller_id')
        .order('status')
        .order('created_at', { ascending: true });

    // Get reseller names
    const resellerIds = [...new Set(requests?.map((r: any) => r.reseller_id).filter(Boolean))];
    const { data: resellerProfiles } = await (supabase.from('profiles') as any).select('id, full_name, phone_number').in('id', resellerIds as string[]);
    const resellerMap = Object.fromEntries((resellerProfiles || []).map((p: any) => [p.id, p]));

    const pending = requests?.filter((r: any) => r.status === 'pending') || [];
    const resolved = requests?.filter((r: any) => r.status !== 'pending') || [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Solicitudes de Stock</h1>
                <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                    {pending.length} pendientes · {resolved.length} resueltas
                </p>
            </div>

            {pending.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">⏳ Pendientes</h2>
                    {pending.map((req: any) => {
                        const reseller = resellerMap[req.reseller_id];
                        return (
                            <div key={req.id} className="glass-card rounded-2xl p-5" style={{ borderColor: 'rgba(234,179,8,0.3)' }}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-white">{reseller?.full_name || 'Revendedor'}</span>
                                            {reseller?.phone_number && (
                                                <span className="text-xs" style={{ color: '#8b8ba7' }}>· {reseller.phone_number}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-white">
                                            Solicita <strong>{req.quantity_requested}</strong> perfiles de{' '}
                                            <span style={{ color: '#6366f1' }}>{req.platform}</span>
                                        </p>
                                        {req.notes && (
                                            <p className="text-sm" style={{ color: '#8b8ba7' }}>📝 {req.notes}</p>
                                        )}
                                        <p className="text-xs" style={{ color: '#8b8ba7' }}>Solicitado el {formatDate(req.created_at)}</p>
                                    </div>
                                    <StockRequestActions requestId={req.id} resellerId={req.reseller_id} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {resolved.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wide">Resueltas</h2>
                    {resolved.map((req: any) => {
                        const reseller = resellerMap[req.reseller_id];
                        return (
                            <div key={req.id} className="glass-card rounded-2xl p-4 opacity-60">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-white">{reseller?.full_name} — {req.quantity_requested}x {req.platform}</p>
                                        {req.admin_notes && <p className="text-xs mt-0.5" style={{ color: '#8b8ba7' }}>Admin: {req.admin_notes}</p>}
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-xs" style={
                                        req.status === 'approved'
                                            ? { background: 'rgba(134,239,172,0.15)', color: '#86efac' }
                                            : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }
                                    }>
                                        {req.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {(!requests || requests.length === 0) && (
                <div className="glass-card rounded-2xl p-12 text-center">
                    <Inbox className="h-12 w-12 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">Sin solicitudes de stock</p>
                    <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>Cuando un revendedor solicite stock, aparecerá acá.</p>
                </div>
            )}
        </div>
    );
}
