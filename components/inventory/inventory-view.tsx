'use client';

import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, LayoutGrid, List, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, Copy, Check, Filter, Edit3, X, Tag } from 'lucide-react';
import { EditAccountModal } from '@/components/inventory/edit-account-modal';
import { SlotDetailsModal } from '@/components/inventory/slot-details-modal';
import { SlotActionsDropdown } from '@/components/inventory/slot-actions-dropdown';
import { AddAccountModal } from '@/components/inventory/add-account-modal';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { BulkEditModal } from '@/components/inventory/bulk-edit-modal';
import { BulkPriceModal } from '@/components/inventory/bulk-price-modal';
import { InventoryDataActions } from '@/components/inventory/inventory-data-actions';
import { CopySlotsModal } from '@/components/inventory/copy-slots-modal';
import { ShowInStoreToggle } from '@/components/inventory/show-in-store-toggle';

interface Slot {
    id: string;
    status: string;
    slot_identifier: string;
    pin_code: string | null;
    created_at?: string;
    sales?: Array<{
        id: string;
        start_date: string | null;
        end_date: string | null;
        is_active: boolean;
        amount_gs?: number;
        created_at?: string;
        reminders_sent?: number;
        notification_status?: { triggered_by: string; sent_at: string } | null;
        customers: { id: string; full_name: string | null; phone: string | null; portal_user_id?: string | null } | null;
    }>;
}

interface Account {
    id: string;
    platform: string;
    email: string;
    password: string;
    max_slots: number;
    renewal_date: string;
    created_at: string;
    sale_slots: Slot[];
    // Optional fields for EditAccountModal compatibility
    purchase_cost_usdt?: number;
    purchase_cost_gs?: number;
    target_billing_day?: number;
    status?: string;
    is_autopay?: boolean;
    notes?: string | null;
    supplier_name?: string | null;
    supplier_phone?: string | null;
    invitation_url?: string | null;
    invite_address?: string | null;
    sale_type?: string | null;
    show_in_store?: boolean;
    last_provider_payment_at?: string | null;
}

interface InventoryViewProps {
    accounts: Account[];
    platformColors: Record<string, { bg: string; text: string; gradient: string }>;
    statusColors: Record<string, string>;
    initialSearch?: string;
}

type SortField = 'platform' | 'email' | 'available' | 'renewal_date' | 'last_provider_payment_at';
type SortDirection = 'asc' | 'desc';

// ── Date helpers ─────────────────────────────────

function daysBetween(from: Date, to: Date) {
    const msDay = 86_400_000;
    return Math.ceil((to.getTime() - from.getTime()) / msDay);
}

/** Creative relative + absolute format: "hace 12d · 6 mar" or "en 30d · 17 abr" */
function formatRelativeDate(dateStr: string, label: 'past' | 'future') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    const diff = daysBetween(today, d);
    const abs = d.toLocaleDateString('es-PY', { day: 'numeric', month: 'short' });

    if (label === 'past') {
        if (diff === 0) return `hoy · ${abs}`;
        if (diff < 0) return `hace ${Math.abs(diff)}d · ${abs}`;
        return `en ${diff}d · ${abs}`;
    }
    // future / renewal
    if (diff < 0) return `venció hace ${Math.abs(diff)}d · ${abs}`;
    if (diff === 0) return `vence hoy · ${abs}`;
    return `en ${diff}d · ${abs}`;
}

/** Returns only the relative part: "hace 14d", "en 17d", "hoy" */
function formatRelativeOnly(dateStr: string, label: 'past' | 'future'): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    const diff = daysBetween(today, d);
    if (label === 'past') {
        if (diff === 0) return 'hoy';
        if (diff < 0) return `hace ${Math.abs(diff)}d`;
        return `en ${diff}d`;
    }
    if (diff < 0) return `venció hace ${Math.abs(diff)}d`;
    if (diff === 0) return 'vence hoy';
    return `en ${diff}d`;
}

/** Returns absolute date string: "18 abr." */
function formatAbsDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-PY', { day: 'numeric', month: 'short' });
}

/** Returns tailwind text colour class based on expiry proximity */
function expiryColor(dateStr: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    const diff = daysBetween(today, d);
    if (diff < 0) return 'text-red-400'; // expired
    if (diff === 0) return 'text-orange-400'; // today
    return 'text-[#86EFAC]'; // future – green
}

// ── Copy-to-clipboard hook ───────────────────────

function CopyableEmail({ email, supplierName }: { email: string; supplierName?: string | null }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const tooltipText = supplierName
        ? `Proveedor: ${supplierName}\nClick para copiar email`
        : 'Click para copiar email';
    return (
        <button
            onClick={handleCopy}
            className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={tooltipText}
        >
            <span className="truncate max-w-[220px]">{email}</span>
            {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
            ) : (
                <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
            )}
        </button>
    );
}

function CopyablePassword({ password }: { password: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            onClick={handleCopy}
            className="group flex items-center gap-1 text-xs text-muted-foreground/50 font-mono tracking-wide hover:text-muted-foreground/80 transition-colors cursor-pointer"
            title="Click para copiar contraseña"
        >
            <span>{password}</span>
            {copied ? (
                <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
            ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 flex-shrink-0 transition-opacity" />
            )}
        </button>
    );
}

// ── Search highlight helper ──────────────────────

/** Renders text with matching portions highlighted */
function HighlightMatch({ text, query }: { text: string; query: string }) {
    if (!query || !text) return <>{text}</>;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return <>{text}</>;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);

    return (
        <>
            {before}
            <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5 ring-1 ring-yellow-400/40">{match}</mark>
            {after}
        </>
    );
}

/** Check if a specific value contains the search query */
function isMatch(value: string | null | undefined, query: string): boolean {
    if (!value || !query) return false;
    return value.toLowerCase().includes(query.toLowerCase());
}

function sortSlots(a: Slot, b: Slot) {
    const getNum = (str: string | null) => {
        if (!str) return 0;
        const m1 = str.match(/^(\d+)\.\s*/);
        if (m1) return parseInt(m1[1], 10);
        const m2 = str.match(/^Perfil\s+(\d+)/i);
        if (m2) return parseInt(m2[1], 10);
        return 0;
    };
    const numA = getNum(a.slot_identifier);
    const numB = getNum(b.slot_identifier);
    
    if (numA !== 0 || numB !== 0) {
        if (numA !== numB) return numA - numB;
    }
    
    // Fallback static determinista: Ordena por ID real para que no brinquen al editarse
    return a.id.localeCompare(b.id);
}

// ── Main component ───────────────────────────────

export function InventoryView({ accounts, platformColors, statusColors, initialSearch }: InventoryViewProps) {
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState(initialSearch || '');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);

    // Sync search from URL when server re-renders the page with a new ?q= param
    useEffect(() => {
        setSearchQuery(initialSearch || '');
    }, [initialSearch]);

    // ── Filters ──────────────────────────────────
    const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
    const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
    const [saleTypeFilter, setSaleTypeFilter] = useState<Set<string>>(new Set());
    const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');
    const [renewalRangeFilter, setRenewalRangeFilter] = useState<string>('all');

    // ── Sort ─────────────────────────────────────
    const [sortField, setSortField] = useState<SortField>('platform');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // ── Pagination ───────────────────────────────
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState(1);

    // ── Bulk selection state ──────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
    const [copySlotsOpen, setCopySlotsOpen] = useState(false);

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleSelectAll() {
        const pageIds = paginatedAccounts.map(a => a.id);
        const allSelected = pageIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) { pageIds.forEach(id => next.delete(id)); }
            else { pageIds.forEach(id => next.add(id)); }
            return next;
        });
    }

    function clearSelection() { setSelectedIds(new Set()); }

    function resetAllFilters() {
        setPlatformFilter(new Set());
        setSupplierFilter(new Set());
        setStatusFilter(new Set());
        setSaleTypeFilter(new Set());
        setAvailabilityFilter('all');
        setRenewalRangeFilter('all');
        setSearchQuery('');
        setCurrentPage(1);
    }

    function toggleFilter<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
        setter(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
        setCurrentPage(1);
    }

    // ── Derived lists ─────────────────────────────
    const platforms = useMemo(() => {
        const set = new Set(accounts.map(a => a.platform));
        return Array.from(set).sort();
    }, [accounts]);

    const suppliersForCurrentPlatform = useMemo(() => {
        const base = platformFilter.size === 0 ? accounts : accounts.filter(a => platformFilter.has(a.platform));
        const set = new Set(base.map(a => a.supplier_name).filter((s): s is string => !!s));
        return Array.from(set).sort();
    }, [accounts, platformFilter]);

    const saleTypes = useMemo(() => {
        const set = new Set(accounts.map(a => a.sale_type).filter((s): s is string => !!s));
        return Array.from(set).sort();
    }, [accounts]);

    // Count of active filters (for badge)
    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (platformFilter.size > 0) n += platformFilter.size;
        if (supplierFilter.size > 0) n += supplierFilter.size;
        if (statusFilter.size > 0) n += statusFilter.size;
        if (saleTypeFilter.size > 0) n += saleTypeFilter.size;
        if (availabilityFilter !== 'all') n++;
        if (renewalRangeFilter !== 'all') n++;
        if (deferredSearchQuery.trim()) n++;
        return n;
    }, [platformFilter, supplierFilter, statusFilter, saleTypeFilter, availabilityFilter, renewalRangeFilter, deferredSearchQuery]);

    // ── Precompute Search Vector ───────────────────
    const searchableAccounts = useMemo(() => {
        return accounts.map(a => {
            const parts = [
                a.platform,
                a.email,
                ...(a.sale_slots?.map(s => {
                    const slotId = s.slot_identifier || '';
                    const customerNames = s.sales?.map(sale => sale.customers?.full_name || '').join(' ') || '';
                    const customerPhones = s.sales?.map(sale => sale.customers?.phone || '').join(' ') || '';
                    return `${slotId} ${customerNames} ${customerPhones}`;
                }) || [])
            ];
            return {
                ...a,
                _searchVector: parts.join(' ').toLowerCase()
            };
        });
    }, [accounts]);

    // ── Filtering ────────────────────────────────
    const filteredAccounts = useMemo(() => {
        let result = searchableAccounts;
        if (platformFilter.size > 0)
            result = result.filter(a => platformFilter.has(a.platform));
        if (supplierFilter.size > 0)
            result = result.filter(a => supplierFilter.has(a.supplier_name ?? ''));
        if (statusFilter.size > 0) {
            result = result.filter(a => {
                const s = a.status || 'active';
                // If 'active' is in the set, also match accounts with no status
                if (statusFilter.has('active') && (!a.status || a.status === 'active')) return true;
                return statusFilter.has(s);
            });
        }
        if (saleTypeFilter.size > 0)
            result = result.filter(a => saleTypeFilter.has(a.sale_type ?? ''));
        if (availabilityFilter === 'with_free')
            result = result.filter(a => (a.sale_slots?.filter(s => s.status === 'available').length || 0) > 0);
        else if (availabilityFilter === 'without_free')
            result = result.filter(a => (a.sale_slots?.filter(s => s.status === 'available').length || 0) === 0);
        if (renewalRangeFilter !== 'all') {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const weekAhead = new Date(today); weekAhead.setDate(today.getDate() + 7);
            const monthAhead = new Date(today); monthAhead.setDate(today.getDate() + 30);
            result = result.filter(a => {
                const renewal = new Date(a.renewal_date + 'T12:00:00');
                if (renewalRangeFilter === 'expired') return renewal < today;
                if (renewalRangeFilter === 'this_week') return renewal >= today && renewal <= weekAhead;
                if (renewalRangeFilter === 'this_month') return renewal >= today && renewal <= monthAhead;
                return true;
            });
        }
        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase();
            result = result.filter(a => a._searchVector.includes(q));
        }
        return result;
    }, [searchableAccounts, deferredSearchQuery, platformFilter, supplierFilter, statusFilter, saleTypeFilter, availabilityFilter, renewalRangeFilter]);

    // ── Sorting ──────────────────────────────────
    const sortedAccounts = useMemo(() => {
        return [...filteredAccounts].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'platform':
                    comparison = a.platform.localeCompare(b.platform); break;
                case 'email':
                    comparison = a.email.localeCompare(b.email); break;
                case 'available': {
                    const aA = a.sale_slots?.filter(s => s.status === 'available').length || 0;
                    const bA = b.sale_slots?.filter(s => s.status === 'available').length || 0;
                    comparison = aA - bA; break;
                }
                case 'renewal_date':
                    comparison = new Date(a.renewal_date + 'T12:00:00').getTime() - new Date(b.renewal_date + 'T12:00:00').getTime(); break;
                case 'last_provider_payment_at':
                    comparison = new Date(a.last_provider_payment_at || a.created_at).getTime() - new Date(b.last_provider_payment_at || b.created_at).getTime(); break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredAccounts, sortField, sortDirection]);

    // ── Pagination ───────────────────────────────
    const paginatedAccounts = useMemo(() => {
        if (pageSize === 0) return sortedAccounts;
        const start = (currentPage - 1) * pageSize;
        return sortedAccounts.slice(start, start + pageSize);
    }, [sortedAccounts, currentPage, pageSize]);

    const totalPages = pageSize === 0 ? 1 : Math.ceil(sortedAccounts.length / pageSize);

    function handleSort(field: SortField) {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
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

    function getAvailable(account: Account) {
        return account.sale_slots?.filter(s => s.status === 'available').length || 0;
    }

    // ── Status label helper ───────────────────────
    const statusLabel: Record<string, string> = {
        active: 'Activa',
        frozen: 'Congelada',
        quarantine: 'Reportada',
        possible_autopay: 'Autopay',
        no_renovar: 'No renovar',
    };

    return (
        <div className="space-y-4">
            {/* ── Top controls bar ── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">Cuentas Madre</h2>
                    <span className="text-sm text-muted-foreground">({filteredAccounts.length})</span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="pl-9 w-48 bg-card border-border"
                        />
                    </div>

                    {/* Filtros toggle */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilterPanelOpen(o => !o)}
                        className={`gap-2 transition-all duration-200 ${
                            filterPanelOpen || activeFilterCount > 0
                                ? 'border-[#86EFAC]/50 text-[#86EFAC] bg-[#86EFAC]/10 hover:bg-[#86EFAC]/20'
                                : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Filter className="h-4 w-4" />
                        Filtros
                        {activeFilterCount > 0 && (
                            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#86EFAC] text-[10px] font-bold text-black px-1">
                                {activeFilterCount}
                            </span>
                        )}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${filterPanelOpen ? 'rotate-180' : ''}`} />
                    </Button>

                    {/* Bulk price button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkPriceOpen(true)}
                        className="border-[#86EFAC]/30 text-[#86EFAC] hover:bg-[#86EFAC]/10 gap-1.5"
                        title="Actualizar precio de perfiles libres"
                    >
                        <Tag className="h-3.5 w-3.5" />
                        Precios libres
                    </Button>

                    <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
                    <InventoryDataActions accounts={filteredAccounts} />

                    {/* View Toggle */}
                    <div className="flex rounded-lg border border-border bg-card">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('cards')}
                            className={`rounded-r-none ${viewMode === 'cards' ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : ''}`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('list')}
                            className={`rounded-l-none ${viewMode === 'list' ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : ''}`}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Expandable filter panel ── */}
            {filterPanelOpen && (
                <div className="rounded-xl border border-border/60 bg-card/70 backdrop-blur-sm p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">

                    {/* Plataforma */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Plataforma</p>
                            {platformFilter.size > 0 && (
                                <button onClick={() => { setPlatformFilter(new Set()); setSupplierFilter(new Set()); setCurrentPage(1); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">limpiar</button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {platforms.map(p => {
                                const pAccounts = accounts.filter(a => a.platform === p);
                                const count = pAccounts.length;
                                const freeSlots = pAccounts.reduce((sum, a) =>
                                    sum + (a.sale_slots?.filter(s => s.status === 'available').length || 0), 0);
                                const pColors = platformColors[p] || platformColors.default;
                                const isActive = platformFilter.has(p);
                                return (
                                    <button
                                        key={p}
                                        onClick={() => toggleFilter(setPlatformFilter as any, p)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                            isActive ? `${pColors.bg} ${pColors.text} ring-1 ring-current` : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {isActive && <Check className="h-3 w-3" />}
                                        {p} ({count})
                                        {freeSlots > 0
                                            ? <span className="text-green-400 font-semibold">🟢{freeSlots}</span>
                                            : <span className="text-red-400 font-semibold">🔴0</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Proveedor — solo si hay */}
                    {suppliersForCurrentPlatform.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Proveedor</p>
                                {supplierFilter.size > 0 && (
                                    <button onClick={() => { setSupplierFilter(new Set()); setCurrentPage(1); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">limpiar</button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {suppliersForCurrentPlatform.map(s => {
                                    const count = accounts.filter(a =>
                                        a.supplier_name === s &&
                                        (platformFilter.size === 0 || platformFilter.has(a.platform))
                                    ).length;
                                    const isActive = supplierFilter.has(s);
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => toggleFilter(setSupplierFilter as any, s)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                                isActive ? 'bg-purple-500 text-white ring-1 ring-purple-400' : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isActive && <Check className="h-3 w-3" />}
                                            {s} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Grid: Estado + Disponibilidad + Vencimiento + Tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                        {/* Estado de cuenta */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Estado de cuenta</p>
                                {statusFilter.size > 0 && (
                                    <button onClick={() => { setStatusFilter(new Set()); setCurrentPage(1); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">limpiar</button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { value: 'active', label: '✅ Activa' },
                                    { value: 'frozen', label: '❄️ Congelada' },
                                    { value: 'quarantine', label: '⚠️ Reportada' },
                                    { value: 'possible_autopay', label: '💳 Posible Autopay' },
                                    { value: 'no_renovar', label: '🚫 No renovar' },
                                ].map(opt => {
                                    const isActive = statusFilter.has(opt.value);
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleFilter(setStatusFilter as any, opt.value)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                                isActive ? 'bg-sky-500 text-white ring-1 ring-sky-400' : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isActive && <Check className="h-3 w-3" />}
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Disponibilidad */}
                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Disponibilidad</p>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { value: 'all', label: 'Todas' },
                                    { value: 'with_free', label: '🟢 Con slots libres' },
                                    { value: 'without_free', label: '🔴 Sin slots libres' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setAvailabilityFilter(opt.value); setCurrentPage(1); }}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                            availabilityFilter === opt.value ? 'bg-emerald-600 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Vencimiento */}
                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Vencimiento</p>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { value: 'all', label: 'Cualquiera' },
                                    { value: 'expired', label: '🔴 Vencidas' },
                                    { value: 'this_week', label: '⚡ Esta semana' },
                                    { value: 'this_month', label: '📅 Este mes' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setRenewalRangeFilter(opt.value); setCurrentPage(1); }}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                            renewalRangeFilter === opt.value ? 'bg-orange-500 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tipo de cuenta — solo si hay más de 1 tipo */}
                        {saleTypes.length > 1 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Tipo de cuenta</p>
                                    {saleTypeFilter.size > 0 && (
                                        <button onClick={() => { setSaleTypeFilter(new Set()); setCurrentPage(1); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">limpiar</button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {saleTypes.map(t => {
                                        const isActive = saleTypeFilter.has(t);
                                        return (
                                            <button
                                                key={t}
                                                onClick={() => toggleFilter(setSaleTypeFilter as any, t)}
                                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                                    isActive ? 'bg-indigo-500 text-white ring-1 ring-indigo-400' : 'bg-secondary text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                {isActive && <Check className="h-3 w-3" />}
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ordenar por */}
                    <div className="border-t border-border/50 pt-4 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ordenar por</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={sortField}
                                onChange={e => { setSortField(e.target.value as SortField); setCurrentPage(1); }}
                                className="rounded-lg px-3 py-1.5 text-sm bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/50 cursor-pointer"
                            >
                                <option value="platform">Plataforma (A–Z)</option>
                                <option value="email">Cuenta (email)</option>
                                <option value="renewal_date">Fecha de vencimiento</option>
                                <option value="last_provider_payment_at">Último pago proveedor</option>
                                <option value="available">Slots libres</option>
                            </select>
                            <button
                                onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm bg-secondary border border-border text-foreground hover:border-[#86EFAC]/40 transition-colors"
                            >
                                {sortDirection === 'asc'
                                    ? <><ChevronUp className="h-4 w-4 text-[#86EFAC]" /> Ascendente</>
                                    : <><ChevronDown className="h-4 w-4 text-[#86EFAC]" /> Descendente</>}
                            </button>
                        </div>
                    </div>

                    {/* Reset */}
                    <div className="flex justify-end border-t border-border/50 pt-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetAllFilters}
                            className="text-muted-foreground hover:text-foreground gap-1.5"
                        >
                            <X className="h-4 w-4" />
                            Resetear todos los filtros
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Active filter chips ── */}
            {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Activos:</span>
                    {Array.from(platformFilter).map(p => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full bg-[#86EFAC]/10 border border-[#86EFAC]/30 px-2.5 py-0.5 text-xs font-medium text-[#86EFAC]">
                            {p}
                            <button onClick={() => toggleFilter(setPlatformFilter as any, p)} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    {Array.from(supplierFilter).map(s => (
                        <span key={s} className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-0.5 text-xs font-medium text-purple-300">
                            {s}
                            <button onClick={() => toggleFilter(setSupplierFilter as any, s)} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    {Array.from(statusFilter).map(sf => (
                        <span key={sf} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                            {statusLabel[sf] ?? sf}
                            <button onClick={() => toggleFilter(setStatusFilter as any, sf)} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    {availabilityFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 border border-emerald-600/30 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                            {availabilityFilter === 'with_free' ? 'Con slots libres' : 'Sin slots libres'}
                            <button onClick={() => { setAvailabilityFilter('all'); setCurrentPage(1); }} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    )}
                    {renewalRangeFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-xs font-medium text-orange-300">
                            {renewalRangeFilter === 'expired' ? 'Vencidas' : renewalRangeFilter === 'this_week' ? 'Esta semana' : 'Este mes'}
                            <button onClick={() => { setRenewalRangeFilter('all'); setCurrentPage(1); }} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    )}
                    {Array.from(saleTypeFilter).map(t => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                            {t}
                            <button onClick={() => toggleFilter(setSaleTypeFilter as any, t)} className="hover:text-white ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    {searchQuery.trim() && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            &ldquo;{searchQuery}&rdquo;
                            <button onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="hover:text-foreground ml-0.5"><X className="h-3 w-3" /></button>
                        </span>
                    )}
                    <button
                        onClick={resetAllFilters}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                        Limpiar todo
                    </button>
                </div>
            )}

            {/* Content */}
            {paginatedAccounts.length > 0 ? (
                viewMode === 'cards' ? (
                    // Cards View
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {paginatedAccounts.map((account) => {
                            const colors = platformColors[account.platform] || platformColors.default;
                            const slots = account.sale_slots || [];
                            const available = getAvailable(account);
                            const isQuarantine = account.status === 'quarantine';

                            return (
                                <Card
                                    key={account.id}
                                    className={`border-border bg-gradient-to-br ${colors.gradient} to-[#1a1a1a] ${isQuarantine ? 'opacity-70 border-purple-500/40' : ''}`}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <PlatformIcon platform={account.platform} size={36} />
                                                <div>
                                                    <CopyableEmail email={account.email} supplierName={account.supplier_name} />
                                                </div>
                                            </div>
                                            <EditAccountModal account={account} />
                                        </div>
                                        {/* Show in store toggle */}
                                        <div className="px-4 pb-2">
                                            <ShowInStoreToggle
                                                accountId={account.id}
                                                initialValue={!!account.show_in_store}
                                            />
                                        </div>
                                        {account.status === 'frozen' && (
                                            <div className="mx-4 mb-1">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">❄️ Cuenta Congelada</span>
                                            </div>
                                        )}
                                        {isQuarantine && (
                                            <div className="mx-4 mb-1">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">⚠️ Cuenta Reportada</span>
                                            </div>
                                        )}
                                        {account.status === 'possible_autopay' && (
                                            <div className="mx-4 mb-1">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">💳 Posible Autopay</span>
                                            </div>
                                        )}
                                        {account.status === 'no_renovar' && (
                                            <div className="mx-4 mb-1">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">🚫 No Renovar</span>
                                            </div>
                                        )}
                                        {account.notes && (
                                            <div className="mx-4 mb-2">
                                                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">📝 {account.notes}</p>
                                            </div>
                                        )}
                                        {(account.sale_type === 'family' || account.invitation_url || account.invite_address) && (
                                            <div className="mx-4 mb-2 bg-white/5 border border-white/10 rounded p-2 text-xs">
                                                <div className="text-white/70 mb-1"><span className="font-medium text-purple-400">🏢 Proveedor:</span> {account.supplier_name || 'No especificado'}</div>
                                                {(account.invitation_url || account.invite_address) && (
                                                    <div className="text-white/70">
                                                        <span className="font-medium text-purple-400">🔗 Invitación Familia:</span> 
                                                        {account.invitation_url && <span className="block mt-0.5 truncate text-[11px] bg-black/40 p-1 rounded font-mono" title={account.invitation_url}>{account.invitation_url}</span>}
                                                        {account.invite_address && <span className="block mt-0.5 truncate text-[11px] bg-black/40 p-1 rounded font-mono" title={account.invite_address}>{account.invite_address}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="mb-3 flex flex-wrap gap-1">
                                            {[...slots].sort(sortSlots).map((slot) => (
                                                <SlotDetailsModal
                                                    key={slot.id}
                                                    slot={slot}
                                                    account={{
                                                        platform: account.platform,
                                                        email: account.email,
                                                        password: account.password,
                                                    }}
                                                    accountStatus={account.status}
                                                />
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between border-t border-border/50 pt-3">
                                            <div className="text-sm">
                                                <span className="text-[#86EFAC] font-medium">{available}</span>
                                                <span className="text-muted-foreground"> / {slots.length} disponibles</span>
                                            </div>
                                            <div className="text-xs">
                                                {account.is_autopay
                                                    ? <span className="inline-flex items-center gap-1 text-blue-400 font-medium">🔄 Autopay</span>
                                                    : <span className={expiryColor(account.renewal_date)}>
                                                        {formatRelativeDate(account.renewal_date, 'future')}
                                                    </span>}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    // Table View — Excel-style: Cuenta Madre (left) | Clientes (right)
                    <div className="rounded-lg border border-border overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead className="bg-card/90 sticky top-0 z-10">
                                {/* Section group headers */}
                                <tr className="border-b border-border/30">
                                    <th colSpan={5} className="px-4 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-red-400/60 border-r border-border/50">
                                        Cuenta.
                                    </th>
                                    <th colSpan={8} className="px-4 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400/60">
                                        Clientes
                                    </th>
                                </tr>
                                {/* Column headers */}
                                <tr className="border-b border-border">
                                    <th className="px-3 py-2.5 w-10">
                                        <input
                                            type="checkbox"
                                            aria-label="Seleccionar todo"
                                            checked={paginatedAccounts.length > 0 && paginatedAccounts.every(a => selectedIds.has(a.id))}
                                            onChange={toggleSelectAll}
                                            className="h-4 w-4 rounded border-border accent-[#86EFAC] cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors w-12" onClick={() => handleSort('platform')}>
                                        <div className="flex items-center gap-1"><SortIcon field="platform" /></div>
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('email')}>
                                        <div className="flex items-center gap-1">Cuenta <SortIcon field="email" /></div>
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('last_provider_payment_at')}>
                                        <div className="flex items-center gap-1">Ult Pago <SortIcon field="last_provider_payment_at" /></div>
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors border-r border-border/50" onClick={() => handleSort('renewal_date')}>
                                        <div className="flex items-center gap-1">Vencimiento <SortIcon field="renewal_date" /></div>
                                    </th>
                                    {/* Client columns */}
                                    <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground w-10">#</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Nombre</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Número</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-20">Pantalla</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Pin</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Ult Pago</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Vencimiento</th>
                                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-24">Acciones</th>
                                </tr>
                            </thead>

                            {/* One <tbody> per account for clean group separation */}
                            {paginatedAccounts.map((account) => {
                                const slots = [...(account.sale_slots || [])].sort(sortSlots);
                                const isQuarantine = account.status === 'quarantine';
                                const isSelected = selectedIds.has(account.id);
                                const available = getAvailable(account);
                                const rowCount = Math.max(slots.length, 1);
                                const leftBg = isSelected ? 'bg-[#86EFAC]/10' : 'bg-card';

                                return (
                                    <tbody key={account.id} className={`border-t-2 border-border ${isQuarantine ? 'opacity-70' : ''}`}>
                                        {slots.length === 0 ? (
                                            <tr>
                                                <td className={`px-3 py-3 align-middle ${leftBg} ${isSelected ? 'border-l-2 border-l-[#86EFAC]' : ''}`}>
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(account.id)} aria-label={`Seleccionar ${account.email}`} className="h-4 w-4 rounded border-border accent-[#86EFAC] cursor-pointer" />
                                                </td>
                                                <td className={`px-4 py-3 align-middle ${leftBg}`}>
                                                    <div className="flex flex-col items-start gap-1.5">
                                                        <PlatformIcon platform={account.platform} size={28} />
                                                        {account.status === 'frozen' && <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">❄️</span>}
                                                        {isQuarantine && <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">⚠️</span>}
                                                        {account.status === 'possible_autopay' && <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">💳</span>}
                                                        {account.status === 'no_renovar' && <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">🚫</span>}
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-3 align-middle ${leftBg}`}>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <CopyableEmail email={account.email} supplierName={account.supplier_name} />
                                                        <CopyablePassword password={account.password} />
                                                        <span className="text-xs text-muted-foreground/60">
                                                            <span className="text-[#86EFAC] font-semibold">{available}</span>/{slots.length} libres
                                                        </span>
                                                        <div className="mt-1"><EditAccountModal account={account} /></div>
                                                        {account.notes && <p className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">📝 {account.notes}</p>}
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-3 align-middle text-xs text-muted-foreground ${leftBg}`}>
                                                    {account.last_provider_payment_at ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-xs text-muted-foreground">{formatRelativeOnly(account.last_provider_payment_at.split('T')[0], 'past')}</span>
                                                            <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(account.last_provider_payment_at.split('T')[0])}</span>
                                                        </div>
                                                    ) : '—'}
                                                </td>
                                                <td className={`px-4 py-3 align-middle border-r border-border/50 ${leftBg}`}>
                                                    {account.is_autopay
                                                        ? <span className="text-xs text-blue-400 font-medium">🔄 Autopay</span>
                                                        : <div className="flex flex-col gap-0.5">
                                                            <span className={`text-xs font-medium ${expiryColor(account.renewal_date)}`}>{formatRelativeOnly(account.renewal_date, 'future')}</span>
                                                            <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(account.renewal_date)}</span>
                                                          </div>
                                                    }
                                                </td>
                                                <td colSpan={7} className="px-4 py-3 text-xs text-muted-foreground/40 italic">Sin slots configurados</td>
                                            </tr>
                                        ) : (
                                            slots.map((slot, idx) => {
                                                const activeSale = slot.sales?.[0]; // already filtered to is_active=true in page.tsx
                                                const customer = activeSale?.customers;
                                                // Use end_date; if null, estimate from start_date or created_at + 30 days
                                                const rawEndDate = activeSale?.end_date;
                                                const endDate: string | null = rawEndDate
                                                    ? rawEndDate
                                                    : activeSale
                                                        ? (() => {
                                                            const base = activeSale.start_date || activeSale.created_at?.split('T')[0];
                                                            if (!base) return null;
                                                            const d = new Date(base + 'T12:00:00');
                                                            d.setDate(d.getDate() + 30);
                                                            return d.toISOString().split('T')[0];
                                                          })()
                                                        : null;
                                                const isEstimatedDate = !rawEndDate && !!endDate;
                                                const statusDotColor =
                                                    slot.status === 'available' ? '#86EFAC'
                                                    : slot.status === 'sold' ? '#F97316'
                                                    : slot.status === 'reserved' ? '#EAB308'
                                                    : '#EF4444';
                                                const isFirst = idx === 0;
                                                const rightBg = isSelected ? 'bg-[#86EFAC]/5' : idx % 2 === 0 ? 'bg-card/80' : 'bg-[#111]/40';
                                                const slotBorder = !isFirst ? 'border-t border-border/20' : '';

                                                return (
                                                    <tr key={slot.id} className="transition-colors">
                                                        {isFirst && (() => {
                                                            // Determine if any slot in this account has a direct client match
                                                            const activeQ = deferredSearchQuery.trim();
                                                            const hasSlotMatch = activeQ && slots.some(s => {
                                                                const sale = s.sales?.[0];
                                                                const c = sale?.customers;
                                                                return isMatch(c?.full_name, activeQ) || isMatch(c?.phone, activeQ) || isMatch(s.slot_identifier, activeQ) || isMatch(s.pin_code, activeQ);
                                                            });
                                                            const emailMatch = activeQ && isMatch(account.email, activeQ);
                                                            const accountHighlight = hasSlotMatch || emailMatch;
                                                            return (
                                                            <>
                                                                {/* CUENTA MADRE — left cells with rowspan */}
                                                                <td rowSpan={rowCount} className={`px-3 align-middle ${leftBg} ${isSelected ? 'border-l-2 border-l-[#86EFAC]' : accountHighlight ? 'border-l-2 border-l-yellow-400/60' : ''}`}>
                                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(account.id)} aria-label={`Seleccionar ${account.email}`} className="h-4 w-4 rounded border-border accent-[#86EFAC] cursor-pointer" />
                                                                </td>
                                                                <td rowSpan={rowCount} className={`px-4 py-3 align-middle ${leftBg}`}>
                                                                    <div className="flex flex-col items-start gap-1.5">
                                                                        <PlatformIcon platform={account.platform} size={28} />
                                                                        {account.status === 'frozen' && <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">❄️</span>}
                                                                        {isQuarantine && <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">⚠️</span>}
                                                                        {account.status === 'possible_autopay' && <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">💳</span>}
                                                                        {account.status === 'no_renovar' && <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">🚫</span>}
                                                                    </div>
                                                                </td>
                                                                <td rowSpan={rowCount} className={`px-4 py-3 align-middle ${leftBg}`}>
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        {emailMatch ? (
                                                                            <span className="text-sm text-muted-foreground">
                                                                                <HighlightMatch text={account.email} query={activeQ} />
                                                                            </span>
                                                                        ) : (
                                                                            <CopyableEmail email={account.email} supplierName={account.supplier_name} />
                                                                        )}
                                                                        <CopyablePassword password={account.password} />
                                                                        <span className="text-[11px] text-muted-foreground/60">
                                                                            <span className="text-[#86EFAC] font-semibold">{available}</span>/{slots.length} libres
                                                                        </span>
                                                                        <div className="mt-1"><EditAccountModal account={account} /></div>
                                                                        <ShowInStoreToggle
                                                                            accountId={account.id}
                                                                            initialValue={!!account.show_in_store}
                                                                        />
                                                                        {account.notes && <p className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">📝 {account.notes}</p>}
                                                                        {(account.sale_type === 'family' || account.invitation_url || account.invite_address) && (
                                                                            <div className="mt-1.5 bg-white/5 border border-white/10 rounded p-1.5 w-full text-[10px]">
                                                                                <div className="text-white/60 mb-0.5"><span className="font-medium text-purple-400">🏢 Proveedor:</span> {account.supplier_name || 'No especificado'}</div>
                                                                                {(account.invitation_url || account.invite_address) && (
                                                                                    <div className="text-white/60 mt-1">
                                                                                        <span className="font-medium text-purple-400">🔗 Invitación:</span> 
                                                                                        {account.invitation_url && <span className="block truncate max-w-[180px] bg-black/40 p-0.5 rounded mt-0.5 font-mono" title={account.invitation_url}>{account.invitation_url}</span>}
                                                                                        {account.invite_address && <span className="block truncate max-w-[180px] bg-black/40 p-0.5 rounded mt-0.5 font-mono" title={account.invite_address}>{account.invite_address}</span>}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td rowSpan={rowCount} className={`px-4 py-3 align-middle text-xs text-muted-foreground ${leftBg}`}>
                                                                    {account.last_provider_payment_at ? (
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-xs text-muted-foreground">{formatRelativeOnly(account.last_provider_payment_at.split('T')[0], 'past')}</span>
                                                                            <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(account.last_provider_payment_at.split('T')[0])}</span>
                                                                        </div>
                                                                    ) : '—'}
                                                                </td>
                                                                <td rowSpan={rowCount} className={`px-4 py-3 align-middle border-r border-border/50 ${leftBg}`}>
                                                                    {account.is_autopay
                                                                        ? <span className="text-xs text-blue-400 font-medium">🔄 Autopay</span>
                                                                        : <div className="flex flex-col gap-0.5">
                                                                            <span className={`text-xs font-medium ${expiryColor(account.renewal_date)}`}>{formatRelativeOnly(account.renewal_date, 'future')}</span>
                                                                            <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(account.renewal_date)}</span>
                                                                          </div>
                                                                    }
                                                                </td>
                                                            </>
                                                        );})()}

                                                        {/* CLIENTES — right cells: # | Nombre | Número | Pantalla | Pin | Ult Pago | Vencimiento | Acciones */}
                                                        <td className={`px-3 py-2.5 text-center ${rightBg} ${slotBorder}`}>
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusDotColor }} />
                                                                <span className="text-xs font-semibold text-foreground/70">{idx + 1}</span>
                                                            </div>
                                                        </td>
                                                        {(() => {
                                                            const activeQ = deferredSearchQuery.trim();
                                                            const nameMatch = isMatch(customer?.full_name, activeQ);
                                                            const phoneMatch = isMatch(customer?.phone, activeQ);
                                                            const slotIdMatch = isMatch(slot.slot_identifier, activeQ);
                                                            const pinMatch = isMatch(slot.pin_code, activeQ);
                                                            const rowHasMatch = activeQ && (nameMatch || phoneMatch || slotIdMatch || pinMatch);
                                                            const matchBg = rowHasMatch ? 'bg-yellow-400/[0.06]' : '';
                                                            return (
                                                                <>
                                                        <td className={`px-4 py-2.5 ${rightBg} ${matchBg} ${slotBorder}`}>
                                                            <span className={customer?.full_name ? 'text-sm text-foreground/80 inline-flex items-center gap-1.5' : 'text-xs text-muted-foreground/40 italic'}>
                                                                {customer?.full_name ? (
                                                                    <><HighlightMatch text={customer.full_name} query={activeQ} />{customer.portal_user_id && <span className="flex-shrink-0 text-sky-400" title="Portal activo">🛡️</span>}</>
                                                                ) : 'libre'}
                                                            </span>
                                                        </td>
                                                        <td className={`px-4 py-2.5 text-xs text-muted-foreground ${rightBg} ${matchBg} ${slotBorder}`}>
                                                            {customer?.phone ? (
                                                                <HighlightMatch text={customer.phone} query={activeQ} />
                                                            ) : '—'}
                                                        </td>
                                                        <td className={`px-4 py-2.5 text-xs text-muted-foreground/70 w-20 max-w-[5rem] break-words whitespace-normal ${rightBg} ${matchBg} ${slotBorder}`}>
                                                            {slot.slot_identifier ? (
                                                                <HighlightMatch text={slot.slot_identifier} query={activeQ} />
                                                            ) : '—'}
                                                        </td>
                                                        <td className={`px-4 py-2.5 text-xs font-mono text-muted-foreground/60 ${rightBg} ${matchBg} ${slotBorder}`}>
                                                            {slot.pin_code ? (
                                                                <HighlightMatch text={slot.pin_code} query={activeQ} />
                                                            ) : <span className="text-muted-foreground/30">—</span>}
                                                        </td>
                                                                </>
                                                            );
                                                        })()}
                                                        <td className={`px-4 py-2.5 ${rightBg} ${slotBorder}`}>
                                                            {(activeSale?.start_date || activeSale?.created_at) ? (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="text-xs text-muted-foreground">{formatRelativeOnly((activeSale.start_date || activeSale.created_at!.split('T')[0]), 'past')}</span>
                                                                    <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(activeSale.start_date || activeSale.created_at!.split('T')[0])}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground/30">—</span>
                                                            )}
                                                        </td>
                                                        <td className={`px-4 py-2.5 ${rightBg} ${slotBorder}`}>
                                                            {endDate ? (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1">
                                                                        <span className={`text-xs font-medium ${expiryColor(endDate)}`}>{formatRelativeOnly(endDate, 'future')}</span>
                                                                        {(() => {
                                                                            // Only show notification icon if within 7 days of expiry or expired
                                                                            const now = new Date(); now.setHours(0,0,0,0);
                                                                            const end = new Date(endDate + 'T12:00:00');
                                                                            const daysLeft = Math.round((end.getTime() - now.getTime()) / (1000*60*60*24));
                                                                            return activeSale?.notification_status && daysLeft <= 7;
                                                                        })() && (
                                                                            <span
                                                                                className="text-[10px] cursor-default"
                                                                                title={
                                                                                    activeSale!.notification_status!.triggered_by === 'copied'
                                                                                        ? 'Recordatorio copiado'
                                                                                        : activeSale!.notification_status!.triggered_by === 'manual'
                                                                                        ? 'Recordatorio enviado manualmente'
                                                                                        : 'Recordatorio automático'
                                                                                }
                                                                            >
                                                                                {activeSale!.notification_status!.triggered_by === 'copied'
                                                                                    ? '📋'
                                                                                    : activeSale!.notification_status!.triggered_by === 'manual'
                                                                                    ? '👤'
                                                                                    : '🤖'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground/50">{formatAbsDate(endDate)}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground/30">—</span>
                                                            )}
                                                        </td>
                                                        {/* Acciones — dropdown con Edit, Copy, Extend, Swap */}
                                                        <td className={`px-3 py-2.5 text-center w-28 ${rightBg} ${slotBorder}`}>
                                                            <SlotActionsDropdown
                                                                slot={{
                                                                    id: slot.id,
                                                                    slot_identifier: slot.slot_identifier,
                                                                    pin_code: slot.pin_code,
                                                                    status: slot.status,
                                                                }}
                                                                account={{
                                                                    platform: account.platform,
                                                                    email: account.email,
                                                                    password: account.password,
                                                                    sale_type: account.sale_type,
                                                                }}
                                                                customer={customer ?? null}
                                                                accountEmail={account.email}
                                                                motherAccountId={account.id}
                                                                activeSale={activeSale ? {
                                                                    id: activeSale.id,
                                                                    end_date: activeSale.end_date,
                                                                    start_date: activeSale.start_date,
                                                                    amount: activeSale.amount_gs || 0,
                                                                    reminders_sent: activeSale.reminders_sent || 0,
                                                                } : null}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                );
                            })}
                        </table>
                    </div>
                )
            ) : (
                <Card className="border-border bg-card">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">
                            {searchQuery ? 'No se encontraron cuentas' : 'No hay cuentas madre registradas'}
                        </p>
                        {!searchQuery && (
                            <div className="mt-4">
                                <AddAccountModal />
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Floating bulk action bar ─────────────────── */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-[#86EFAC]/30 bg-[#0d1117]/95 px-5 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
                    <span className="text-sm font-medium text-[#86EFAC]">
                        {selectedIds.size} cuenta{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <Button
                        size="sm"
                        className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 font-medium"
                        onClick={() => setBulkEditOpen(true)}
                    >
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        Editar selección
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-[#86EFAC] text-[#86EFAC] hover:bg-[#86EFAC]/10 font-medium"
                        onClick={() => setCopySlotsOpen(true)}
                    >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copiar Slots
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={clearSelection}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <BulkEditModal
                open={bulkEditOpen}
                onClose={() => setBulkEditOpen(false)}
                selectedIds={Array.from(selectedIds)}
                onSuccess={() => { clearSelection(); }}
            />

            {/* CopySlots Modal */}
            <CopySlotsModal
                open={copySlotsOpen}
                onClose={() => setCopySlotsOpen(false)}
                accounts={sortedAccounts}
                selectedIds={Array.from(selectedIds)}
            />

            {/* BulkPrice Modal */}
            <BulkPriceModal
                open={bulkPriceOpen}
                onClose={() => setBulkPriceOpen(false)}
                platforms={platforms}
            />

            {/* Pagination */}
            {sortedAccounts.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Mostrar:</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}
                        >
                            <SelectTrigger className="w-24 bg-card border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">30</SelectItem>
                                <SelectItem value="90">90</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="0">Todos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {pageSize !== 0 && totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="border-border"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                                {currentPage} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="border-border"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    <span className="text-sm text-muted-foreground">
                        {sortedAccounts.length} cuenta(s) en total
                    </span>
                </div>
            )}
        </div>
    );
}
