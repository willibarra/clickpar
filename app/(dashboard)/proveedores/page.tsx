import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSuppliers } from '@/lib/actions/suppliers';
import { Building2, Package, Wallet, ChevronRight, Plus } from 'lucide-react';
import { SupplierCard } from '@/components/proveedores/supplier-card';

function formatGs(amount: number): string {
    if (amount >= 1_000_000_000) return `Gs. ${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${Math.round(amount).toLocaleString('es-PY')}`;
}

const PLATFORM_COLORS: Record<string, string> = {
    'Netflix': '#E50914',
    'Spotify': '#1DB954',
    'Disney+': '#0063E5',
    'HBO Max': '#5822B4',
    'Amazon Prime': '#00A8E1',
    'Apple TV+': '#555',
    'Paramount+': '#0064FF',
    'Crunchyroll': '#F47521',
    'YouTube Premium': '#FF0000',
    'FLUJOTV': '#7C3AED',
};

function PlatformBadge({ platform }: { platform: string }) {
    const color = PLATFORM_COLORS[platform] || '#6366f1';
    return (
        <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{
                background: `${color}22`,
                color: color,
                border: `1px solid ${color}44`,
            }}
        >
            {platform}
        </span>
    );
}

export default async function ProveedoresPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'super_admin') redirect('/');

    const suppliers = await getSuppliers();

    const totalAccounts = suppliers.reduce((s, p) => s + (p.total_accounts || 0), 0);
    const totalCostGs = suppliers.reduce((s, p) => s + (p.total_cost_gs || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Proveedores</h1>
                    <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                        {suppliers.length} proveedores · {totalAccounts} cuentas madre en total
                    </p>
                </div>
                <a
                    href="/proveedores/nuevo"
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                    style={{
                        background: 'rgba(134,239,172,0.15)',
                        border: '1px solid rgba(134,239,172,0.3)',
                        color: '#86efac',
                    }}
                >
                    <Plus className="h-4 w-4" />
                    Nuevo Proveedor
                </a>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                    className="rounded-2xl p-5"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8b8ba7' }}>
                        Proveedores
                    </p>
                    <p className="text-3xl font-bold text-white mt-1">{suppliers.length}</p>
                </div>
                <div
                    className="rounded-2xl p-5"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8b8ba7' }}>
                        Cuentas Madre
                    </p>
                    <p className="text-3xl font-bold text-white mt-1">{totalAccounts}</p>
                </div>
                <div
                    className="rounded-2xl p-5"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8b8ba7' }}>
                        Inversión Total
                    </p>
                    <p className="text-2xl font-bold mt-1" style={{ color: '#86efac' }}>
                        {formatGs(totalCostGs)}
                    </p>
                </div>
            </div>

            {/* Suppliers list */}
            {suppliers.length === 0 ? (
                <div
                    className="rounded-2xl p-12 text-center"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <Building2 className="h-12 w-12 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">Sin proveedores registrados</p>
                    <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                        Hacé clic en <strong className="text-green-400">+ Nuevo Proveedor</strong> para crear uno.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {suppliers.map((supplier) => {
                        const badges = supplier.platforms?.slice(0, 6).map(p => (
                            <PlatformBadge key={p} platform={p} />
                        )) || [];
                        
                        return (
                            <SupplierCard
                                key={supplier.id}
                                supplier={supplier}
                                platformBadges={badges}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
