import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CheckCircle, Circle, Package } from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export default async function ResellerStockPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();

    const { data: stock } = await (supabase.from('reseller_stock') as any)
        .select('id, platform, slot_identifier, status, sale_price_gs, assigned_at')
        .eq('reseller_id', user.id)
        .order('platform')
        .order('assigned_at', { ascending: false });

    const available = stock?.filter((s: any) => s.status === 'available') || [];
    const sold = stock?.filter((s: any) => s.status === 'sold') || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Mi Stock</h1>
                    <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                        Perfiles asignados por ClickPar
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                        <Circle className="h-3 w-3" style={{ color: '#6366f1' }} />
                        <span className="text-sm text-white">{available.length} disponibles</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.3)' }}>
                        <CheckCircle className="h-3 w-3 text-green-400" />
                        <span className="text-sm text-white">{sold.length} vendidos</span>
                    </div>
                </div>
            </div>

            {(!stock || stock.length === 0) ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                    <Package className="h-12 w-12 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">No tenés stock asignado</p>
                    <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                        Solicitá perfiles a ClickPar desde{' '}
                        <a href="/reseller/pedir-stock" className="underline" style={{ color: '#6366f1' }}>Pedir Stock</a>.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Available Stock */}
                    {available.length > 0 && (
                        <div className="glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-white/5">
                                <h2 className="text-sm font-semibold text-white">Disponibles para vender</h2>
                            </div>
                            <div className="divide-y divide-white/5">
                                {available.map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                                {item.platform?.charAt(0) || '?'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{item.platform}</p>
                                                <p className="text-xs" style={{ color: '#8b8ba7' }}>Perfil: {item.slot_identifier}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-white">{item.sale_price_gs ? formatGs(Number(item.sale_price_gs)) : '—'}</p>
                                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                                                Disponible
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sold Stock */}
                    {sold.length > 0 && (
                        <div className="glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-white/5">
                                <h2 className="text-sm font-semibold" style={{ color: '#8b8ba7' }}>Vendidos</h2>
                            </div>
                            <div className="divide-y divide-white/5">
                                {sold.map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between px-5 py-4 opacity-60">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: 'rgba(134,239,172,0.2)' }}>
                                                {item.platform?.charAt(0) || '?'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{item.platform}</p>
                                                <p className="text-xs" style={{ color: '#8b8ba7' }}>Perfil: {item.slot_identifier}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(134,239,172,0.15)', color: '#86efac' }}>
                                            Vendido
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
