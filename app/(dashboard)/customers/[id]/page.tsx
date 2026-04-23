import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Phone, Mail, FileText, Calendar, TrendingUp,
    ShoppingBag, Clock, CheckCircle2, XCircle, AlertTriangle,
    ShieldCheck, UserX, Edit3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { EditCustomerModal } from '@/components/customers/edit-customer-modal';

/* ── Helpers ─────────────────────────────────────── */

function formatGs(n: number | null | undefined) {
    if (!n) return '—';
    return `Gs. ${Number(n).toLocaleString('es-PY')}`;
}

function formatDate(str: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('es-PY', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
    return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

function expiryLabel(end: string | null) {
    if (!end) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(end + 'T12:00:00');
    const diff = daysBetween(today, d);
    if (diff < 0) return { label: `Venció hace ${Math.abs(diff)}d`, color: 'text-red-400' };
    if (diff === 0) return { label: 'Vence hoy', color: 'text-orange-400' };
    if (diff <= 7) return { label: `Vence en ${diff}d`, color: 'text-yellow-400' };
    return { label: `Vence en ${diff}d`, color: 'text-[#86EFAC]' };
}

/* ── Page ───────────────────────────────────────── */

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createAdminClient();

    // Fetch customer
    const { data: customer } = await (supabase.from('customers') as any)
        .select('id, full_name, phone, email, notes, created_at, customer_type, whatsapp_instance, creator_slug, creator_whatsapp, panel_disabled, portal_user_id')
        .eq('id', id)
        .single();

    if (!customer) notFound();

    // Fetch ALL sales for this customer
    const { data: sales } = await (supabase.from('sales') as any)
        .select('id, slot_id, amount_gs, start_date, end_date, is_active, created_at, payment_method')
        .eq('customer_id', id)
        .order('start_date', { ascending: false });

    const allSales = (sales || []) as any[];

    // Fetch slot info for each sale
    const slotIds = [...new Set(allSales.filter((s: any) => s.slot_id).map((s: any) => s.slot_id))];
    const slotInfoMap = new Map<string, { platform: string; account_email: string; slot_identifier: string }>();

    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, mother_accounts:mother_account_id(platform, email)')
            .in('id', slotIds);
        (slots || []).forEach((s: any) => {
            slotInfoMap.set(s.id, {
                platform: s.mother_accounts?.platform || 'Servicio',
                account_email: s.mother_accounts?.email || '',
                slot_identifier: s.slot_identifier || '',
            });
        });
    }

    // Compute stats
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const activeSales = allSales.filter((s: any) => s.is_active);
    const pastSales = allSales.filter((s: any) => !s.is_active);
    const totalSpent = allSales.reduce((sum: number, s: any) => sum + (s.amount_gs || 0), 0);
    const firstPurchase = allSales.length > 0 ? allSales[allSales.length - 1].start_date : null;
    const lastPurchase = allSales.length > 0 ? allSales[0].start_date : null;

    // Customer lifetime in days
    const memberSince = customer.created_at ? new Date(customer.created_at) : null;
    const memberDays = memberSince ? daysBetween(memberSince, today) : 0;

    // Status
    const hasValidActive = activeSales.some((s: any) => {
        const rawEnd = s.end_date || (() => { const d = new Date(s.start_date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
        return new Date(rawEnd + 'T12:00:00') >= today;
    });
    const status: 'active' | 'expired' | 'inactive' = activeSales.length > 0
        ? (hasValidActive ? 'active' : 'expired')
        : (allSales.length > 0 ? 'expired' : 'inactive');

    const statusConfig = {
        active: { label: 'Activo', color: '#86EFAC', icon: CheckCircle2 },
        expired: { label: 'Vencido / Ex-cliente', color: '#EF4444', icon: AlertTriangle },
        inactive: { label: 'Sin historial', color: '#6B7280', icon: UserX },
    };
    const statusInfo = statusConfig[status];

    // Payment method labels
    const paymentLabels: Record<string, string> = {
        bank_transfer: 'Transferencia',
        tigo_money: 'Tigo Money',
        binance: 'Binance',
        cash: 'Efectivo',
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* ── Back + Header ── */}
            <div className="flex items-center gap-3">
                <Link href="/customers">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        Clientes
                    </Button>
                </Link>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm font-medium text-foreground truncate">{customer.full_name || 'Sin nombre'}</span>
            </div>

            {/* ── Customer Hero Card ── */}
            <Card className="border-border bg-card overflow-hidden">
                {/* Accent bar */}
                <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${statusInfo.color}80, transparent)` }} />
                <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                            <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold border border-border"
                                style={{ background: `${statusInfo.color}15`, color: statusInfo.color }}>
                                {(customer.full_name || '??').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h1 className="text-2xl font-bold text-foreground">{customer.full_name || 'Sin nombre'}</h1>
                                {/* Status badge */}
                                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border"
                                    style={{ background: `${statusInfo.color}15`, color: statusInfo.color, borderColor: `${statusInfo.color}40` }}>
                                    <statusInfo.icon className="h-3 w-3" />
                                    {statusInfo.label}
                                </span>
                                {customer.portal_user_id && (
                                    <span className="inline-flex items-center gap-1 rounded bg-sky-400/15 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-400/20">
                                        <ShieldCheck className="h-3 w-3" /> PORTAL
                                    </span>
                                )}
                                {customer.panel_disabled && (
                                    <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20">
                                        <UserX className="h-3 w-3" /> PANEL BLOQUEADO
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
                                {customer.phone && (
                                    <span className="flex items-center gap-1.5">
                                        <Phone className="h-3.5 w-3.5" /> {customer.phone}
                                    </span>
                                )}
                                {customer.email && (
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5" /> {customer.email}
                                    </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5" />
                                    Cliente desde {formatDate(customer.created_at)}
                                    {memberDays > 0 && <span className="text-xs opacity-60">({memberDays}d)</span>}
                                </span>
                            </div>

                            {customer.notes && (
                                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                                    <FileText className="h-3.5 w-3.5 mt-0.5 text-amber-400 flex-shrink-0" />
                                    <p className="text-sm text-amber-300/90">{customer.notes}</p>
                                </div>
                            )}
                        </div>

                        {/* Edit button */}
                        <div className="flex-shrink-0">
                            <EditCustomerModal
                                customer={{
                                    id: customer.id,
                                    full_name: customer.full_name,
                                    phone_number: customer.phone,
                                    customer_type: customer.customer_type,
                                    whatsapp_instance: customer.whatsapp_instance,
                                    creator_slug: customer.creator_slug,
                                    creator_whatsapp: customer.creator_whatsapp,
                                    portal_user_id: customer.portal_user_id,
                                    panel_disabled: customer.panel_disabled ?? false,
                                }}
                                trigger={
                                    <Button variant="outline" size="sm" className="gap-1.5 border-[#86EFAC]/30 text-[#86EFAC] hover:bg-[#86EFAC]/10">
                                        <Edit3 className="h-3.5 w-3.5" /> Editar
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Stats Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border bg-card">
                    <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5" /> LTV Total
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <p className="text-xl font-bold text-[#86EFAC]">{formatGs(totalSpent)}</p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <ShoppingBag className="h-3.5 w-3.5" /> Compras
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <p className="text-xl font-bold text-foreground">{allSales.length}</p>
                        <p className="text-xs text-muted-foreground">{activeSales.length} activas · {pastSales.length} pasadas</p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" /> Primera compra
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <p className="text-sm font-semibold text-foreground">{formatDate(firstPurchase, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> Último servicio
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <p className="text-sm font-semibold text-foreground">{formatDate(lastPurchase, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </CardContent>
                </Card>
            </div>

            {/* ── Active Services ── */}
            {activeSales.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-[#86EFAC]" />
                        Servicios Activos ({activeSales.length})
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {activeSales.map((s: any) => {
                            const rawEnd = s.end_date || (() => { const d = new Date(s.start_date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
                            const info = s.slot_id ? slotInfoMap.get(s.slot_id) : null;
                            const expiry = expiryLabel(rawEnd);
                            return (
                                <Link key={s.id} href={`/inventory?q=${encodeURIComponent(customer.phone || customer.full_name || '')}`}
                                    className="flex items-center gap-3 rounded-xl border border-[#86EFAC]/20 bg-[#86EFAC]/5 p-4 hover:bg-[#86EFAC]/10 hover:border-[#86EFAC]/30 transition-colors">
                                    <PlatformIcon platform={info?.platform || 'Servicio'} size={36} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-foreground text-sm">{info?.platform || 'Servicio'}</p>
                                        {info?.account_email && (
                                            <p className="text-xs text-muted-foreground truncate">{info.account_email}</p>
                                        )}
                                        {info?.slot_identifier && (
                                            <p className="text-xs text-muted-foreground">{info.slot_identifier}</p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-bold text-[#86EFAC]">{formatGs(s.amount_gs)}</p>
                                        {expiry && <p className={`text-xs font-medium ${expiry.color}`}>{expiry.label}</p>}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Full Purchase History ── */}
            <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Historial Completo ({allSales.length} transacciones)
                </h2>

                {allSales.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                        <ShoppingBag className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Este cliente no tiene compras registradas.</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicio</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Período</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Pago</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monto</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {allSales.map((s: any, idx: number) => {
                                    const rawEnd = s.end_date || (() => { const d = new Date(s.start_date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
                                    const info = s.slot_id ? slotInfoMap.get(s.slot_id) : null;
                                    return (
                                        <tr key={s.id} className={`transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? 'bg-card' : 'bg-muted/10'}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <PlatformIcon platform={info?.platform || 'Servicio'} size={24} />
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-foreground">{info?.platform || 'Servicio'}</p>
                                                        {info?.account_email && (
                                                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{info.account_email}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">
                                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                                    {formatDate(s.start_date, { day: 'numeric', month: 'short' })}
                                                    {' → '}
                                                    {formatDate(rawEnd, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="text-xs text-muted-foreground">
                                                    {paymentLabels[s.payment_method] || s.payment_method || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-semibold text-foreground">{formatGs(s.amount_gs)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {s.is_active ? (
                                                    <Badge variant="outline" className="text-[#86EFAC] border-[#86EFAC]/30 bg-[#86EFAC]/10 text-[10px] px-1.5 gap-1">
                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Activo
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground border-border/50 text-[10px] px-1.5 gap-1">
                                                        <XCircle className="h-2.5 w-2.5" /> Finalizado
                                                    </Badge>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {/* Total footer */}
                            <tfoot>
                                <tr className="border-t border-border bg-muted/30">
                                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-muted-foreground">
                                        Total gastado ({allSales.length} compras)
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="text-base font-bold text-[#86EFAC]">{formatGs(totalSpent)}</span>
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Quick Actions ── */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border/40">
                <Link href={`/sales?customer=${encodeURIComponent(customer.phone || customer.full_name || '')}`}>
                    <Button className="gap-2 bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90">
                        <ShoppingBag className="h-4 w-4" />
                        Nueva Venta
                    </Button>
                </Link>
                <Link href={`/inventory?q=${encodeURIComponent(customer.phone || customer.full_name || '')}`}>
                    <Button variant="outline" className="gap-2 border-border text-muted-foreground hover:text-foreground">
                        <ShoppingBag className="h-4 w-4" />
                        Ver en Inventario
                    </Button>
                </Link>
                <Link href="/customers">
                    <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        Volver a Clientes
                    </Button>
                </Link>
            </div>
        </div>
    );
}
