'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Filter, Phone, RefreshCw, Pencil, Clock, Monitor
} from 'lucide-react';
import { EditCustomerModal } from '@/components/customers/edit-customer-modal';

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

const platformColors: Record<string, string> = {
    Netflix: '#E50914', Spotify: '#1DB954', HBO: '#5c16c5', 'HBO Max': '#5c16c5',
    'Disney+': '#0063e5', 'Amazon Prime': '#00a8e1', 'YouTube Premium': '#ff0000',
    'Apple TV+': '#555', Crunchyroll: '#F47521', 'Paramount+': '#0064FF',
    'Star+': '#C724B1', Tidal: '#000',
};

const statusConfig = {
    active: { label: 'Activo', color: '#86EFAC', bg: 'bg-[#86EFAC]/15', border: 'border-[#86EFAC]/30', text: 'text-[#86EFAC]' },
    expired: { label: 'Vencido', color: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-500' },
    inactive: { label: 'Sin Servicio', color: '#6B7280', bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400' },
};

function formatGs(n: number | null | undefined) {
    if (n == null || n === 0) return '—';
    return `Gs. ${Number(n).toLocaleString('es-PY')}`;
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysRemaining(dateStr: string | null): number {
    if (!dateStr) return -9999;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function daysBadge(dateStr: string | null) {
    if (!dateStr) return <span className="text-xs text-muted-foreground">—</span>;
    const days = daysRemaining(dateStr);
    let cls = 'text-[#86EFAC]';
    if (days <= 0) cls = 'text-red-500';
    else if (days <= 3) cls = 'text-red-400';
    else if (days <= 7) cls = 'text-yellow-500';
    const label = days <= 0 ? `${Math.abs(days)}d atrás` : `${days}d`;
    return <span className={`font-mono font-semibold text-sm ${cls}`}>{label}</span>;
}

/* ── Sort ─────────────────────────────────────────────────────── */

type SortField = 'name' | 'status' | 'nextExpiry' | 'totalSpent';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'expired' | 'inactive' | 'creador';

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
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    // Customer ID to auto-open for editing (comes from ?edit= URL param)
    const [autoEditId, setAutoEditId] = useState<string | null>(() => searchParams.get('edit'));

    // Clear the ?edit= param from the URL once we've consumed it
    // (to avoid re-triggering on re-renders)
    useEffect(() => {
        const editId = searchParams.get('edit');
        if (editId) {
            setAutoEditId(editId);
            // Remove the edit param from the URL without a page reload
            const params = new URLSearchParams(searchParams.toString());
            params.delete('edit');
            const newUrl = params.toString() ? `/customers?${params.toString()}` : '/customers';
            router.replace(newUrl, { scroll: false });
        }
    }, [searchParams]);

    // Reset autoEditId after modal has been opened once
    function clearAutoEdit() {
        setAutoEditId(null);
    }

    // Counts per status
    const counts = useMemo(() => {
        const c = { all: customers.length, active: 0, expired: 0, inactive: 0, creador: 0 };
        customers.forEach(cu => { c[cu.status]++; if (cu.customer_type === 'creador') c.creador++; });
        return c;
    }, [customers]);

    const filteredCustomers = useMemo(() => {
        let result = customers;
        if (statusFilter === 'creador') {
            result = result.filter(c => c.customer_type === 'creador');
        } else if (statusFilter !== 'all') {
            result = result.filter(c => c.status === statusFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            // Strip non-digits for phone comparison so "+595 994 480158" matches "595994480158"
            const qDigits = q.replace(/\D/g, '');
            const isPhoneSearch = qDigits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
            result = result.filter(c => {
                if (isPhoneSearch) {
                    // Compare digits-only version of stored phone with digits-only query
                    const phoneDigits = (c.phone || '').replace(/\D/g, '');
                    return phoneDigits.includes(qDigits) ||
                        (c.full_name || '').toLowerCase().includes(q);
                }
                return (c.full_name || '').toLowerCase().includes(q) ||
                    (c.phone || '').includes(q);
            });
        }
        return result;
    }, [customers, searchQuery, statusFilter]);

    // Sort
    const sortedCustomers = useMemo(() => {
        return [...filteredCustomers].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'name':
                    cmp = (a.full_name || '').localeCompare(b.full_name || '');
                    break;
                case 'status':
                    cmp = statusOrder[a.status] - statusOrder[b.status];
                    break;
                case 'nextExpiry': {
                    // null (no expiry) goes last
                    const da = a.nextExpiry ? new Date(a.nextExpiry).getTime() : Infinity;
                    const db = b.nextExpiry ? new Date(b.nextExpiry).getTime() : Infinity;
                    cmp = da - db;
                    break;
                }
                case 'totalSpent':
                    cmp = a.totalSpent - b.totalSpent;
                    break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [filteredCustomers, sortField, sortDirection]);

    // Paginate
    const totalPages = pageSize === 0 ? 1 : Math.ceil(sortedCustomers.length / pageSize);
    const paginatedCustomers = useMemo(() => {
        if (pageSize === 0) return sortedCustomers;
        const start = (currentPage - 1) * pageSize;
        return sortedCustomers.slice(start, start + pageSize);
    }, [sortedCustomers, currentPage, pageSize]);

    function handleSort(field: SortField) {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }

    function SortIcon({ field }: { field: SortField }) {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ?
            <ChevronUp className="h-4 w-4" /> :
            <ChevronDown className="h-4 w-4" />;
    }

    function getInitials(name: string) {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || '??';
    }

    // Unique platforms in services
    function getUniquePlatforms(services: CustomerService[]) {
        const seen = new Set<string>();
        return services.filter(s => {
            if (seen.has(s.platform)) return false;
            seen.add(s.platform);
            return true;
        });
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">Clientes</h2>
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
                            className="pl-9 w-52 bg-card border-border"
                        />
                    </div>
                </div>
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {([
                    { key: 'all' as StatusFilter, label: 'Todos', color: '#86EFAC' },
                    { key: 'active' as StatusFilter, label: '🟢 Activos', color: '#86EFAC' },
                    { key: 'expired' as StatusFilter, label: '🔴 Vencidos', color: '#EF4444' },
                    { key: 'inactive' as StatusFilter, label: '⚪ Sin Servicio', color: '#6B7280' },
                    { key: 'creador' as StatusFilter, label: '🎬 Creadores', color: '#818CF8' },
                ]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => { setStatusFilter(f.key); setCurrentPage(1); }}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${statusFilter === f.key
                            ? f.key === 'all'
                                ? 'bg-[#86EFAC] text-black'
                                : `text-white`
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                            }`}
                        style={statusFilter === f.key && f.key !== 'all' ? { backgroundColor: f.color } : undefined}
                    >
                        {f.label} ({counts[f.key]})
                    </button>
                ))}
            </div>

            {/* Table */}
            {paginatedCustomers.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-card/80">
                            <tr>
                                <th
                                    className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Cliente
                                        <SortIcon field="name" />
                                    </div>
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-1">
                                        Estado
                                        <SortIcon field="status" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                    Servicios
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                    onClick={() => handleSort('nextExpiry')}
                                >
                                    <div className="flex items-center gap-1">
                                        Próx. Vencimiento
                                        <SortIcon field="nextExpiry" />
                                    </div>
                                </th>
                                <th
                                    className="px-4 py-3 text-right text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                    onClick={() => handleSort('totalSpent')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Gasto Total
                                        <SortIcon field="totalSpent" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedCustomers.map(customer => {
                                const cfg = statusConfig[customer.status];
                                const uniquePlatforms = getUniquePlatforms(customer.services);

                                return (
                                    <React.Fragment key={customer.id}>
                                        <tr className={`bg-card hover:bg-card/80 transition-colors cursor-pointer ${expandedRow === customer.id ? 'bg-card/60' : ''}`} onClick={() => setExpandedRow(expandedRow === customer.id ? null : customer.id)}>
                                            {/* Cliente */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8 flex-shrink-0">
                                                        <AvatarFallback className="bg-[#1a1a1a] text-[#86EFAC] text-xs font-semibold">
                                                            {getInitials(customer.full_name || 'XX')}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-medium text-foreground truncate">
                                                                {customer.full_name || 'Sin nombre'}
                                                            </p>
                                                            {customer.customer_type === 'creador' ? (
                                                                <span className="inline-flex items-center rounded-full bg-[#818CF8]/15 border border-[#818CF8]/30 px-1.5 py-0.5 text-[9px] font-semibold text-[#818CF8]">
                                                                    🎬 Creador
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/25 px-1.5 py-0.5 text-[9px] font-semibold text-[#3B82F6]">
                                                                    👤 Cliente
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Phone className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{customer.phone || '—'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Estado */}
                                            <td className="px-4 py-3">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[11px] font-semibold ${cfg.bg} ${cfg.border} ${cfg.text}`}
                                                >
                                                    {cfg.label}
                                                </Badge>
                                            </td>

                                            {/* Servicios */}
                                            <td className="px-4 py-3">
                                                {uniquePlatforms.length > 0 ? (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {uniquePlatforms.map((svc, i) => (
                                                            <div
                                                                key={`${svc.platform}-${i}`}
                                                                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                                                                style={{
                                                                    backgroundColor: `${platformColors[svc.platform] || '#555'}20`,
                                                                    color: platformColors[svc.platform] || '#999',
                                                                    border: `1px solid ${platformColors[svc.platform] || '#555'}40`,
                                                                }}
                                                                title={svc.platform}
                                                            >
                                                                <div
                                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                                    style={{ backgroundColor: platformColors[svc.platform] || '#555' }}
                                                                />
                                                                {svc.platform}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/50">—</span>
                                                )}
                                            </td>

                                            {/* Próx. Vencimiento */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-foreground">{formatDate(customer.nextExpiry)}</span>
                                                    {customer.nextExpiry && daysBadge(customer.nextExpiry)}
                                                </div>
                                            </td>

                                            {/* Gasto Total */}
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm font-semibold text-[#86EFAC]">
                                                    {formatGs(customer.totalSpent)}
                                                </span>
                                                {customer.totalPurchases > 0 && (
                                                    <span className="text-[10px] text-muted-foreground block">
                                                        {customer.totalPurchases} compra{customer.totalPurchases !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Acciones */}
                                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <a
                                                        href={`/?q=${encodeURIComponent(customer.phone || customer.full_name || '')}`}
                                                        className="flex items-center gap-1 rounded-md bg-[#F97316]/10 px-2.5 py-1 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20 transition-colors"
                                                        title="Buscar / Renovar"
                                                    >
                                                        <RefreshCw className="h-3 w-3" />
                                                        Gestionar
                                                    </a>
                                                    <EditCustomerModal
                                                        customer={{
                                                            id: customer.id,
                                                            full_name: customer.full_name,
                                                            phone_number: customer.phone,
                                                            customer_type: customer.customer_type,
                                                            whatsapp_instance: customer.whatsapp_instance,
                                                            creator_slug: customer.creator_slug,
                                                            panel_disabled: customer.panel_disabled ?? false,
                                                        }}
                                                        defaultOpen={autoEditId === customer.id}
                                                        onOpenChange={(open: boolean) => { if (!open && autoEditId === customer.id) clearAutoEdit(); }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                        {/* ── Expanded History Row ── */}
                                        {expandedRow === customer.id && (
                                            <tr className="bg-[#0d0d0d]">
                                                <td colSpan={6} className="px-6 py-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Clock className="h-4 w-4 text-[#86EFAC]" />
                                                        <span className="text-sm font-semibold text-foreground">Historial de Servicios</span>
                                                        <span className="text-xs text-muted-foreground">({customer.history.length} registro{customer.history.length !== 1 ? 's' : ''})</span>
                                                    </div>
                                                    {customer.history.length > 0 ? (
                                                        <div className="space-y-1.5">
                                                            {customer.history.map((h, i) => (
                                                                <div key={`${h.sale_id}-${i}`} className={`flex items-center gap-3 rounded-md px-3 py-2 border ${h.is_active ? 'bg-[#86EFAC]/5 border-[#86EFAC]/20' : 'bg-[#111] border-border/30'}`}>
                                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.is_active ? '#86EFAC' : platformColors[h.platform] || '#555' }} />
                                                                    <div className="flex items-center gap-1.5 min-w-[100px]">
                                                                        <span className="text-sm font-medium text-foreground">{h.platform}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                                                        <Monitor className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                                                        <span className="text-xs text-muted-foreground truncate">{h.account_email || '—'}</span>
                                                                    </div>
                                                                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(h.start_date)} → {formatDate(h.end_date)}</span>
                                                                    <span className="text-sm font-semibold text-[#86EFAC] flex-shrink-0 min-w-[80px] text-right">{formatGs(h.amount)}</span>
                                                                    <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${h.is_active ? 'border-[#86EFAC]/40 text-[#86EFAC]' : 'border-border text-muted-foreground'}`}>
                                                                        {h.is_active ? 'Activo' : 'Finalizado'}
                                                                    </Badge>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground/50">Sin historial de servicios</p>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                    <Search className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No se encontraron clientes{statusFilter !== 'all' && statusFilter !== 'creador' ? ` con estado "${statusConfig[statusFilter].label}"` : statusFilter === 'creador' ? ' creadores' : ''}.</p>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span>{currentPage} / {totalPages}</span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
