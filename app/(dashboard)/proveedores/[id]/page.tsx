import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSupplierDetail } from '@/lib/actions/suppliers';
import { DeleteSupplierButton } from '@/components/proveedores/delete-supplier-button';
import {
    ArrowLeft, Package, Wallet, CheckCircle2, XCircle,
    Calendar, Building2, AlertTriangle, Link, Edit3
} from 'lucide-react';

function formatGs(amount: number): string {
    if (amount >= 1_000_000_000) return `Gs. ${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${Math.round(amount).toLocaleString('es-PY')}`;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const PLATFORM_COLORS: Record<string, string> = {
    'Netflix': '#E50914',
    'Spotify': '#1DB954',
    'Disney+': '#0063E5',
    'HBO Max': '#5822B4',
    'Amazon Prime': '#00A8E1',
    'Paramount+': '#0064FF',
    'Crunchyroll': '#F47521',
    'FLUJOTV': '#7C3AED',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
    active:     { label: 'Activa',      color: '#86efac' },
    review:     { label: 'Revisión',    color: '#fbbf24' },
    expired:    { label: 'Vencida',     color: '#ef4444' },
    dead:       { label: 'Muerta',      color: '#6b7280' },
    quarantine: { label: 'Cuarentena',  color: '#f97316' },
};

export default async function SupplierDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'super_admin') redirect('/');

    const { id } = await params;
    const supplier = await getSupplierDetail(id);
    if (!supplier) redirect('/proveedores');

    const isSinProveedor = supplier.id === '00000000-0000-0000-0000-000000000001';

    const totalAvailable = supplier.accounts.reduce((s, a) => s + a.available_slots, 0);
    const totalSold = supplier.accounts.reduce((s, a) => s + a.sold_slots, 0);
    const totalSlots = totalAvailable + totalSold;

    // Group by platform
    const byPlatform = supplier.accounts.reduce<Record<string, typeof supplier.accounts>>((acc, a) => {
        if (!acc[a.platform]) acc[a.platform] = [];
        acc[a.platform].push(a);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* Back */}
            <a
                href="/proveedores"
                className="inline-flex items-center gap-2 text-sm transition-colors hover:text-white"
                style={{ color: '#8b8ba7' }}
            >
                <ArrowLeft className="h-4 w-4" />
                Todos los proveedores
            </a>

            {/* Header */}
            <div
                className="rounded-2xl p-6"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isSinProveedor ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.1)'}`,
                }}
            >
                <div className="flex items-start gap-5">
                    <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
                        style={{
                            background: isSinProveedor
                                ? 'linear-gradient(135deg, #f97316, #ef4444)'
                                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        }}
                    >
                        {supplier.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-white">{supplier.name}</h1>
                        {supplier.contact_info && (
                            <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                                {supplier.contact_info}
                            </p>
                        )}
                        {supplier.payment_method_preferred && (
                            <div className="flex items-center gap-1.5 mt-2">
                                <span
                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium"
                                    style={{
                                        background: 'rgba(134,239,172,0.1)',
                                        color: '#86efac',
                                        border: '1px solid rgba(134,239,172,0.2)',
                                    }}
                                >
                                    {supplier.payment_method_preferred}
                                </span>
                            </div>
                        )}
                        {isSinProveedor && (
                            <div
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium"
                                style={{
                                    background: 'rgba(249,115,22,0.1)',
                                    color: '#f97316',
                                    border: '1px solid rgba(249,115,22,0.2)',
                                }}
                            >
                                <AlertTriangle className="h-3 w-3" />
                                Cuentas sin proveedor asignado
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    {!isSinProveedor && (
                        <div className="shrink-0 flex items-center gap-2">
                            <a
                                href={`/proveedores/${supplier.id}/editar`}
                                className="rounded-xl px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#e2e8f0',
                                }}
                            >
                                <Edit3 className="h-4 w-4" />
                                Editar
                            </a>
                            <DeleteSupplierButton 
                                supplierId={supplier.id} 
                                supplierName={supplier.name} 
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Cuentas', value: supplier.accounts.length, color: '#e2e8f0' },
                    { label: 'Slots vendidos', value: totalSold, color: '#86efac' },
                    { label: 'Slots libres', value: totalAvailable, color: '#6366f1' },
                    { label: 'Inversión', value: formatGs(supplier.total_cost_gs || 0), color: '#fbbf24', isText: true },
                ].map(stat => (
                    <div
                        key={stat.label}
                        className="rounded-xl p-4"
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <p className="text-xs" style={{ color: '#8b8ba7' }}>{stat.label}</p>
                        <p
                            className={`mt-1 font-bold ${stat.isText ? 'text-base' : 'text-2xl'}`}
                            style={{ color: stat.color }}
                        >
                            {stat.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Accounts grouped by platform */}
            {supplier.accounts.length === 0 ? (
                <div
                    className="rounded-2xl p-12 text-center"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <Package className="h-10 w-10 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                    <p className="text-white font-medium">Sin cuentas asociadas</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(byPlatform).map(([platform, accounts]) => {
                        const platformColor = PLATFORM_COLORS[platform] || '#6366f1';
                        const platformTotal = accounts.reduce((s, a) => s + Number(a.purchase_cost_gs || 0), 0);
                        const platformAvail = accounts.reduce((s, a) => s + a.available_slots, 0);
                        const platformSold = accounts.reduce((s, a) => s + a.sold_slots, 0);

                        return (
                            <div key={platform}>
                                {/* Platform header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ background: platformColor }}
                                        />
                                        <h2 className="text-base font-semibold text-white">{platform}</h2>
                                        <span
                                            className="rounded-md px-2 py-0.5 text-xs font-medium"
                                            style={{
                                                background: `${platformColor}22`,
                                                color: platformColor,
                                            }}
                                        >
                                            {accounts.length} cuentas
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs" style={{ color: '#8b8ba7' }}>
                                            {platformSold} vendidos · {platformAvail} libres · {formatGs(platformTotal)}
                                        </span>
                                    </div>
                                </div>

                                {/* Account rows */}
                                <div className="space-y-1.5">
                                    {accounts.map(account => {
                                        const days = getDaysUntil(account.renewal_date);
                                        const statusInfo = STATUS_MAP[account.status] || { label: account.status, color: '#8b8ba7' };
                                        const isExpiringSoon = days !== null && days <= 7;
                                        const isExpired = days !== null && days < 0;

                                        return (
                                            <a
                                                key={account.id}
                                                href={`/inventory?search=${encodeURIComponent(account.email)}`}
                                                className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:border-white/15 group"
                                                style={{
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isExpiringSoon ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                                }}
                                            >
                                                {/* Email */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-mono text-white truncate group-hover:text-green-300 transition-colors">
                                                        {account.email}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-0.5">
                                                        <span
                                                            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                                            style={{
                                                                background: `${statusInfo.color}22`,
                                                                color: statusInfo.color,
                                                            }}
                                                        >
                                                            {statusInfo.label}
                                                        </span>
                                                        <span className="text-xs" style={{ color: '#8b8ba7' }}>
                                                            {account.max_slots} slots
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Slots bar */}
                                                <div className="hidden sm:flex items-center gap-2">
                                                    <div className="flex gap-0.5">
                                                        {Array.from({ length: account.max_slots }).map((_, i) => (
                                                            <span
                                                                key={i}
                                                                className="h-5 w-2.5 rounded-sm"
                                                                style={{
                                                                    background: i < account.sold_slots
                                                                        ? '#86efac'
                                                                        : 'rgba(255,255,255,0.1)',
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-xs" style={{ color: '#8b8ba7' }}>
                                                        {account.sold_slots}/{account.max_slots}
                                                    </span>
                                                </div>

                                                {/* Renewal date */}
                                                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                                                    <Calendar className="h-3.5 w-3.5" style={{ color: isExpiringSoon ? '#f97316' : '#8b8ba7' }} />
                                                    <span
                                                        className="text-xs font-medium"
                                                        style={{
                                                            color: isExpired ? '#ef4444' : isExpiringSoon ? '#f97316' : '#8b8ba7',
                                                        }}
                                                    >
                                                        {formatDate(account.renewal_date)}
                                                        {days !== null && (
                                                            <span className="ml-1">
                                                                ({isExpired ? `vencida hace ${Math.abs(days)}d` : `${days}d`})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>

                                                {/* Cost */}
                                                <div className="shrink-0 text-right hidden md:block">
                                                    <p className="text-sm font-medium" style={{ color: '#8b8ba7' }}>
                                                        {formatGs(Number(account.purchase_cost_gs || 0))}
                                                    </p>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
