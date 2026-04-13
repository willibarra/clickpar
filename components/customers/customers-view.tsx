'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Filter, Phone, RefreshCw, Clock, Monitor, X, Check, Edit3, ShieldCheck, GitMerge
} from 'lucide-react';
import { EditCustomerModal } from '@/components/customers/edit-customer-modal';
import { WalletTopupModal } from '@/components/customers/wallet-topup-modal';
import { MergeCustomersModal } from '@/components/customers/merge-customers-modal';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/* ── Types ──────────────────────────────────────────────────── */

interface CustomerService {
    platform: string;
    sale_end_date: string;
    amount: number;
}

export interface CustomerHistory {
    sale_id: string;
    platform: string;
    account_email: string;
    start_date: string;
    end_date: string;
    amount: number;
    is_active: boolean;
}

export interface CustomerRow {
    id: string;
    full_name: string;
    phone: string;
    customer_type: 'cliente' | 'creador';
    whatsapp_instance?: string | null;
    creator_slug?: string | null;
    creator_whatsapp?: string | null;
    portal_user_id?: string | null;
    panel_disabled?: boolean;
    services: CustomerService[];
    history: CustomerHistory[];
    // Computed in server
    status: 'active' | 'expired' | 'inactive';
    nextExpiry: string | null;   // earliest sale_end_date
    totalSpent: number;          // sum of ALL sales amount_gs
    totalPurchases: number;
}

interface CustomersViewProps {
    customers: CustomerRow[];
}

/* ── Helpers ─────────────────────────────────────────────────── */

const statusConfig = {
    active: { label: 'Activo', color: '#86EFAC', bg: 'bg-[#86EFAC]/15', border: 'border-[#86EFAC]/30', text: 'text-[#86EFAC]' },
    expired: { label: 'Vencido', color: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-500' },
    inactive: { label: 'Sin Servicio', color: '#6B7280', bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400' },
};

function formatGs(n: number | null | undefined) {
    if (n == null || n === 0) return '—';
    return `Gs. ${Number(n).toLocaleString('es-PY')}`;
}

function daysBetween(from: Date, to: Date) {
    const msDay = 86_400_000;
    return Math.ceil((to.getTime() - from.getTime()) / msDay);
}

function formatRelativeDate(dateStr: string | null) {
    if (!dateStr) return '—';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    const diff = daysBetween(today, d);
    const abs = d.toLocaleDateString('es-PY', { day: 'numeric', month: 'short' });

    if (diff < 0) return `hace ${Math.abs(diff)}d · ${abs}`;
    if (diff === 0) return `hoy · ${abs}`;
    return `en ${diff}d · ${abs}`;
}

function expiryColor(dateStr: string | null): string {
    if (!dateStr) return 'text-muted-foreground';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    const diff = daysBetween(today, d);
    if (diff < 0) return 'text-red-400';
    if (diff === 0) return 'text-orange-400';
    if (diff <= 7) return 'text-yellow-400';
    return 'text-[#86EFAC]'; // future – green
}

function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
}

/* ── Sort & Filter Types ────────────────────────────────────── */

type SortField = 'name' | 'status' | 'nextExpiry' | 'totalSpent';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'expired' | 'inactive' | 'creador' | 'portal';

const statusOrder = { active: 1, expired: 2, inactive: 3 };

/* ── Component ───────────────────────────────────────────────── */

export function CustomersView({ customers }: CustomersViewProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortField, setSortField] = useState<SortField>('nextExpiry');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState(1);
    
    // UI state
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [autoEditId, setAutoEditId] = useState<string | null>(() => searchParams.get('edit'));
    // Merge modal state
    const [mergeGroup, setMergeGroup] = useState<CustomerRow[] | null>(null);

    // Clear ?edit=
    useEffect(() => {
        const editId = searchParams.get('edit');
        if (editId) {
            setAutoEditId(editId);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('edit');
            const newUrl = params.toString() ? `/customers?${params.toString()}` : '/customers';
            router.replace(newUrl, { scroll: false });
        }
    }, [searchParams]);

    function clearAutoEdit() { setAutoEditId(null); }

    // ── Detect duplicates by normalized phone ──────────────────────
    const duplicatePhoneMap = useMemo(() => {
        // Map: normalizedPhone → CustomerRow[]
        const groups = new Map<string, CustomerRow[]>();
        customers.forEach(c => {
            const norm = (c.phone || '').replace(/\D/g, '');
            if (!norm || norm.length < 6) return; // skip empty/too-short
            const arr = groups.get(norm) || [];
            arr.push(c);
            groups.set(norm, arr);
        });
        // Only keep groups with 2+ entries
        const dupMap = new Map<string, CustomerRow[]>(); // customerId → full group
        groups.forEach((group) => {
            if (group.length >= 2) {
                group.forEach(c => dupMap.set(c.id, group));
            }
        });
        return dupMap;
    }, [customers]);

    // Derive counts
    const counts = useMemo(() => {
        const c = { all: customers.length, active: 0, expired: 0, inactive: 0, creador: 0, portal: 0 };
        customers.forEach(cu => { c[cu.status]++; if (cu.customer_type === 'creador') c.creador++; if (cu.portal_user_id) c.portal++; });
        return c;
    }, [customers]);

    // Filtering
    const filteredCustomers = useMemo(() => {
        let result = customers;
        if (statusFilter === 'creador') {
            result = result.filter(c => c.customer_type === 'creador');
        } else if (statusFilter === 'portal') {
            result = result.filter(c => !!c.portal_user_id);
        } else if (statusFilter !== 'all') {
            result = result.filter(c => c.status === statusFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const qDigits = q.replace(/\D/g, '');
            const isPhoneSearch = qDigits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
            result = result.filter(c => {
                if (isPhoneSearch) {
                    const phoneDigits = (c.phone || '').replace(/\D/g, '');
                    return phoneDigits.includes(qDigits) || (c.full_name || '').toLowerCase().includes(q);
                }
                return (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
            });
        }
        return result;
    }, [customers, searchQuery, statusFilter]);

    // Sort
    const sortedCustomers = useMemo(() => {
        return [...filteredCustomers].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'name': cmp = (a.full_name || '').localeCompare(b.full_name || ''); break;
                case 'status': cmp = statusOrder[a.status] - statusOrder[b.status]; break;
                case 'nextExpiry': {
                    const da = a.nextExpiry ? new Date(a.nextExpiry).getTime() : Infinity;
                    const db = b.nextExpiry ? new Date(b.nextExpiry).getTime() : Infinity;
                    cmp = da - db;
                    break;
                }
                case 'totalSpent': cmp = a.totalSpent - b.totalSpent; break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [filteredCustomers, sortField, sortDirection]);

    // Pagination
    const totalPages = pageSize === 0 ? 1 : Math.ceil(sortedCustomers.length / pageSize);
    const paginatedCustomers = useMemo(() => {
        if (pageSize === 0) return sortedCustomers;
        const start = (currentPage - 1) * pageSize;
        return sortedCustomers.slice(start, start + pageSize);
    }, [sortedCustomers, currentPage, pageSize]);

    return (
        <>
        <div className="space-y-4">
            {/* ── Top controls bar ── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">Listado</h2>
                    <span className="text-sm text-muted-foreground">({filteredCustomers.length})</span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Nombre o teléfono..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="pl-9 w-64 bg-card border-border h-9"
                        />
                    </div>
                </div>
            </div>

            {/* ── Filters & Sort ── */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="h-4 w-4 text-muted-foreground mr-1" />
                    {([
                        { key: 'all' as StatusFilter, label: 'Todos', color: '#86EFAC' },
                        { key: 'active' as StatusFilter, label: '🟢 Activos', color: '#86EFAC' },
                        { key: 'expired' as StatusFilter, label: '🔴 Vencidos', color: '#EF4444' },
                        { key: 'inactive' as StatusFilter, label: '⚪ Sin Servicio', color: '#6B7280' },
                        { key: 'portal' as StatusFilter, label: '🛡️ Portal', color: '#38BDF8' },
                        { key: 'creador' as StatusFilter, label: '🎬 Creadores', color: '#818CF8' },
                    ]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => { setStatusFilter(f.key); setCurrentPage(1); }}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                                statusFilter === f.key
                                    ? f.key === 'all'
                                        ? 'bg-[#86EFAC]/10 border-[#86EFAC]/30 text-[#86EFAC]'
                                        : `border-[#${f.color.replace('#','')}]/30 text-[${f.color}]`
                                    : 'bg-card border-transparent text-muted-foreground hover:bg-secondary'
                            }`}
                            style={statusFilter === f.key && f.key !== 'all' ? { backgroundColor: `${f.color}15`, color: f.color, borderColor: `${f.color}40` } : undefined}
                        >
                            {f.label} <span className="opacity-70 ml-1">({counts[f.key]})</span>
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold flex items-center">
                        <ArrowUpDownIcon className="w-3 h-3 mr-1" /> Ordenar
                    </span>
                    <select
                        value={sortField}
                        onChange={e => { setSortField(e.target.value as SortField); setCurrentPage(1); }}
                        className="rounded-md px-2 py-1 text-xs bg-card border border-border text-foreground focus:outline-none cursor-pointer"
                    >
                        <option value="nextExpiry">Próx. Vencimiento</option>
                        <option value="name">Nombre</option>
                        <option value="totalSpent">Gasto Total</option>
                        <option value="status">Estado</option>
                    </select>
                    <button
                        onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                        className="rounded-md px-2 py-1 bg-card border border-border text-foreground hover:bg-secondary transition-colors"
                    >
                        {sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            {paginatedCustomers.length > 0 ? (
                /* LIST VIEW */
                <div className="flex flex-col gap-2">
                    {paginatedCustomers.map(customer => {
                        const cfg = statusConfig[customer.status];
                        return (
                            <div key={customer.id} className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-white/10 hover:bg-card">
                                {/* Left: Customer Info */}
                                <div className="flex items-center gap-3 w-full md:w-3/12 shrink-0">
                                    <Avatar className="h-10 w-10 flex-shrink-0 border border-border">
                                        <AvatarFallback className="bg-[#1a1a1a] text-[#86EFAC] text-sm font-semibold">
                                            {getInitials(customer.full_name || 'XX')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                            <h3 className="font-semibold text-foreground text-sm truncate">{customer.full_name || 'Sin nombre'}</h3>
                                            {customer.portal_user_id && (
                                                <span className="flex-shrink-0 inline-flex items-center gap-0.5 rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-400/20" title="Tiene acceso al portal">
                                                    <ShieldCheck className="h-2.5 w-2.5" /> PORTAL
                                                </span>
                                            )}
                                            {customer.customer_type === 'creador' && (
                                                <span className="flex-shrink-0 inline-flex items-center rounded bg-[#818CF8]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#818CF8]">🎬 CREADOR</span>
                                            )}
                                            {/* Duplicate badge */}
                                            {duplicatePhoneMap.has(customer.id) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setMergeGroup(duplicatePhoneMap.get(customer.id)!)}
                                                    title="Teléfono duplicado — click para fusionar"
                                                    className="flex-shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-400/25 hover:bg-amber-400/25 transition-colors cursor-pointer"
                                                >
                                                    <GitMerge className="h-2.5 w-2.5" /> DUPLICADO
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                            <Phone className="h-3 w-3" /> {customer.phone || '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Middle: Active Services */}
                                <div className="flex-1 flex flex-wrap items-center gap-2 min-h-[40px]">
                                    {customer.services.length > 0 ? (
                                        customer.services.map((svc, i) => (
                                            <a key={i} href={`/inventory?q=${encodeURIComponent(customer.phone || customer.full_name || '')}`} className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 p-1.5 pr-3 transition-colors hover:bg-secondary/80 hover:border-white/20">
                                                <PlatformIcon platform={svc.platform} size={24} />
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-1">{svc.platform}</p>
                                                    <p className={`text-xs font-medium leading-none ${expiryColor(svc.sale_end_date)}`}>
                                                        {formatRelativeDate(svc.sale_end_date)}
                                                    </p>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        <span className="text-xs text-muted-foreground/60 italic">Sin servicios activos</span>
                                    )}
                                </div>

                                {/* Right: Stats & Actions */}
                                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto shrink-0 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-border/30 md:border-t-0">
                                    <div className="text-left md:text-right">
                                        <p className="text-sm font-semibold text-[#86EFAC]">{formatGs(customer.totalSpent)}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase">{customer.totalPurchases} compras</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <WalletTopupModal
                                            customerId={customer.id}
                                            customerName={customer.full_name || 'Cliente'}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setExpandedHistoryId(expandedHistoryId === customer.id ? null : customer.id)}
                                            className={`h-8 px-2 text-xs border-border ${expandedHistoryId === customer.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <Clock className="h-3 w-3 mr-1" /> Historial
                                        </Button>
                                        
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
                                                <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-[#86EFAC]/30 text-[#86EFAC] hover:bg-[#86EFAC]/10">
                                                    <Edit3 className="h-3.5 w-3.5" />
                                                </Button>
                                            }
                                            defaultOpen={autoEditId === customer.id}
                                            onOpenChange={(open: boolean) => { if (!open && autoEditId === customer.id) clearAutoEdit(); }}
                                        />
                                    </div>
                                </div>
                                
                                {/* Expanded History */}
                                {expandedHistoryId === customer.id && (
                                    <div className="w-full mt-2 rounded-lg border border-border/50 bg-[#0a0a0a] p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Historial de Transacciones</span>
                                        </div>
                                        {customer.history.length > 0 ? (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                {customer.history.map((h, i) => (
                                                    <div key={i} className={`flex items-center gap-3 rounded-md px-3 py-2 border ${h.is_active ? 'bg-[#86EFAC]/5 border-[#86EFAC]/20' : 'bg-secondary/30 border-border/40'}`}>
                                                        <PlatformIcon platform={h.platform} size={20} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-foreground truncate">{h.platform}</span>
                                                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${h.is_active ? 'text-[#86EFAC] border-[#86EFAC]/30' : 'text-muted-foreground border-border/50'}`}>
                                                                    {h.is_active ? 'Activo' : 'Finalizado'}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground truncate">{h.account_email || 'Cuenta no disponible'}</p>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="text-sm font-semibold text-foreground">{formatGs(h.amount)}</p>
                                                            <p className="text-[10px] text-muted-foreground">{new Date(h.start_date).toLocaleDateString('es-PY', {month:'short', year:'numeric'})}</p>
                                                        </div>
                                                        <Button
                                                            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-white"
                                                            onClick={() => window.open(`/?q=${encodeURIComponent(customer.phone || customer.full_name || '')}`, '_blank')}
                                                            title="Renovar desde Cajero"
                                                        >
                                                            <RefreshCw className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic">No hay historial registrado.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                    <Search className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No se encontraron clientes.</p>
                </div>
            )}

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-4">
                    <div className="flex items-center gap-2">
                        <span>Mostrar:</span>
                        {[30, 50, 100, 0].map(n => (
                            <button
                                key={n}
                                onClick={() => { setPageSize(n); setCurrentPage(1); }}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${pageSize === n
                                    ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                    : 'bg-secondary hover:text-foreground'
                                    }`}
                            >
                                {n === 0 ? 'Todos' : n}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span>{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Merge Modal */}
        {mergeGroup && (
            <MergeCustomersModal
                open={true}
                onClose={() => setMergeGroup(null)}
                duplicates={mergeGroup.map(c => ({
                    id: c.id,
                    full_name: c.full_name,
                    phone: c.phone,
                    services: c.services,
                    totalPurchases: c.totalPurchases,
                    totalSpent: c.totalSpent,
                }))}
                suggestedPrimaryId={getSuggestedPrimaryId(mergeGroup)}
            />
        )}
    </>);
}

// ── Helpers ────────────────────────────────────────────────────

function getSuggestedPrimaryId(group: CustomerRow[]) {
    return [...group].sort((a, b) => b.totalPurchases - a.totalPurchases)[0]?.id || group[0].id;
}

// Helper icon component for inline usage
function ArrowUpDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m21 16-4 4-4-4"/>
      <path d="M17 20V4"/>
      <path d="m3 8 4-4 4 4"/>
      <path d="M7 4v16"/>
    </svg>
  );
}
