'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, LayoutGrid, List, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, Copy, Check, Filter, Edit3, X, Tag } from 'lucide-react';
import { EditAccountModal } from '@/components/inventory/edit-account-modal';
import { SlotDetailsModal } from '@/components/inventory/slot-details-modal';
import { AddAccountModal } from '@/components/inventory/add-account-modal';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { BulkEditModal } from '@/components/inventory/bulk-edit-modal';
import { BulkPriceModal } from '@/components/inventory/bulk-price-modal';

interface Slot {
    id: string;
    status: string;
    slot_identifier: string;
    pin_code: string | null;
    sales?: Array<{
        id: string;
        end_date: string | null;
        is_active: boolean;
        customers: { id: string; full_name: string | null; phone: string | null } | null;
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
}

interface InventoryViewProps {
    accounts: Account[];
    platformColors: Record<string, { bg: string; text: string; gradient: string }>;
    statusColors: Record<string, string>;
}

type SortField = 'platform' | 'email' | 'available' | 'renewal_date' | 'created_at';
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

// ── Main component ───────────────────────────────

export function InventoryView({ accounts, platformColors, statusColors }: InventoryViewProps) {
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('platform');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState(1);

    // ── Bulk selection state ──────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [bulkPriceOpen, setBulkPriceOpen] = useState(false);

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

    // Extract unique platforms for filter pills
    const platforms = useMemo(() => {
        const set = new Set(accounts.map(a => a.platform));
        return Array.from(set).sort();
    }, [accounts]);

    // Extract unique suppliers for filter pills
    const suppliers = useMemo(() => {
        const set = new Set(
            accounts
                .map(a => a.supplier_name)
                .filter((s): s is string => !!s)
        );
        return Array.from(set).sort();
    }, [accounts]);

    // Suppliers filtered by active platform selection
    const suppliersForCurrentPlatform = useMemo(() => {
        const base = platformFilter === 'all' ? accounts : accounts.filter(a => a.platform === platformFilter);
        const set = new Set(
            base.map(a => a.supplier_name).filter((s): s is string => !!s)
        );
        return Array.from(set).sort();
    }, [accounts, platformFilter]);

    // Filter accounts based on search + platform + supplier
    const filteredAccounts = useMemo(() => {
        let result = accounts;
        if (platformFilter !== 'all') {
            result = result.filter(a => a.platform === platformFilter);
        }
        if (supplierFilter !== 'all') {
            result = result.filter(a => a.supplier_name === supplierFilter);
        }
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(account =>
                account.platform.toLowerCase().includes(query) ||
                account.email.toLowerCase().includes(query)
            );
        }
        return result;
    }, [accounts, searchQuery, platformFilter, supplierFilter]);

    // Sort accounts
    const sortedAccounts = useMemo(() => {
        return [...filteredAccounts].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'platform':
                    comparison = a.platform.localeCompare(b.platform);
                    break;
                case 'email':
                    comparison = a.email.localeCompare(b.email);
                    break;
                case 'available':
                    const aAvailable = a.sale_slots?.filter(s => s.status === 'available').length || 0;
                    const bAvailable = b.sale_slots?.filter(s => s.status === 'available').length || 0;
                    comparison = aAvailable - bAvailable;
                    break;
                case 'renewal_date':
                    comparison = new Date(a.renewal_date + 'T12:00:00').getTime() - new Date(b.renewal_date + 'T12:00:00').getTime();
                    break;
                case 'created_at':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredAccounts, sortField, sortDirection]);

    // Paginate accounts
    const paginatedAccounts = useMemo(() => {
        if (pageSize === 0) return sortedAccounts; // "All"
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

    return (
        <div className="space-y-4">
            {/* Controls */}
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

            {/* Platform Filter Pills + Mostrar por (proveedor) */}
            <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <button
                    onClick={() => { setPlatformFilter('all'); setSupplierFilter('all'); setCurrentPage(1); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${platformFilter === 'all'
                        ? 'bg-[#86EFAC] text-black'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Todas
                </button>
                {platforms.map(p => {
                    const platformAccounts = accounts.filter(a => a.platform === p);
                    const count = platformAccounts.length;
                    const freeSlots = platformAccounts.reduce((sum, a) =>
                        sum + (a.sale_slots?.filter(s => s.status === 'available').length || 0), 0
                    );
                    const pColors = platformColors[p] || platformColors.default;
                    return (
                        <button
                            key={p}
                            onClick={() => { setPlatformFilter(p); setSupplierFilter('all'); setCurrentPage(1); }}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${platformFilter === p
                                ? `${pColors.bg} ${pColors.text}`
                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {p} ({count})
                            {freeSlots > 0 ? (
                                <span className="text-green-400 font-semibold">🟢{freeSlots}</span>
                            ) : (
                                <span className="text-red-400 font-semibold">🔴0</span>
                            )}
                        </button>
                    );
                })}

                {/* Mostrar por proveedor — solo si hay proveedores disponibles */}
                {suppliersForCurrentPlatform.length > 0 && (
                    <>
                        <span className="text-muted-foreground/40 text-xs">|</span>
                        <span className="text-xs text-muted-foreground font-medium">Mostrar por:</span>
                        <select
                            value={supplierFilter}
                            onChange={e => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
                            className="rounded-full px-3 py-1 text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer transition-colors"
                        >
                            <option value="all">Todos los proveedores</option>
                            {suppliersForCurrentPlatform.map(s => {
                                const count = accounts.filter(a =>
                                    a.supplier_name === s &&
                                    (platformFilter === 'all' || a.platform === platformFilter)
                                ).length;
                                return (
                                    <option key={s} value={s}>{s} ({count})</option>
                                );
                            })}
                        </select>
                    </>
                )}
            </div>

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
                                        {account.notes && (
                                            <div className="mx-4 mb-2">
                                                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">📝 {account.notes}</p>
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="mb-3 flex flex-wrap gap-1">
                                            {[...slots].sort((a, b) => {
                                                const numA = parseInt(a.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                                                const numB = parseInt(b.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                                                return numA - numB;
                                            }).map((slot) => (
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
                    // Table View
                    <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-card/80">
                                <tr>
                                    {/* Select-all checkbox */}
                                    <th className="px-3 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            aria-label="Seleccionar todo"
                                            checked={paginatedAccounts.length > 0 && paginatedAccounts.every(a => selectedIds.has(a.id))}
                                            onChange={toggleSelectAll}
                                            className="h-4 w-4 rounded border-border accent-[#86EFAC] cursor-pointer"
                                        />
                                    </th>
                                    <th
                                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors w-12"
                                        onClick={() => handleSort('platform')}
                                    >
                                        <div className="flex items-center gap-1">
                                            <SortIcon field="platform" />
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => handleSort('email')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Email
                                            <SortIcon field="email" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                        Perfiles
                                    </th>
                                    <th
                                        className="px-4 py-3 text-center text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => handleSort('available')}
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            Slots
                                            <SortIcon field="available" />
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Compra
                                            <SortIcon field="created_at" />
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => handleSort('renewal_date')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Vencimiento
                                            <SortIcon field="renewal_date" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {paginatedAccounts.map((account) => {
                                    const slots = account.sale_slots || [];
                                    const available = getAvailable(account);
                                    const isQuarantine = account.status === 'quarantine';
                                    const isSelected = selectedIds.has(account.id);

                                    return (
                                        <tr key={account.id} className={`transition-colors ${isSelected ? 'bg-[#86EFAC]/10 border-l-2 border-l-[#86EFAC]' : 'bg-card hover:bg-card/80'} ${isQuarantine ? 'opacity-70' : ''}`}>
                                            {/* Row checkbox */}
                                            <td className="px-3 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(account.id)}
                                                    aria-label={`Seleccionar ${account.email}`}
                                                    className="h-4 w-4 rounded border-border accent-[#86EFAC] cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <PlatformIcon platform={account.platform} size={28} />
                                                    {account.status === 'frozen' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300">❄️</span>
                                                    )}
                                                    {isQuarantine && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-xs font-medium text-purple-300">⚠️</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <CopyableEmail email={account.email} supplierName={account.supplier_name} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {[...slots].sort((a, b) => {
                                                        const numA = parseInt(a.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                                                        const numB = parseInt(b.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                                                        return numA - numB;
                                                    }).map((slot) => (
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
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center gap-1 text-sm">
                                                    <span className="text-[#86EFAC] font-medium">{available}</span>
                                                    <span className="text-muted-foreground">/ {slots.length}</span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {account.created_at
                                                    ? formatRelativeDate(account.created_at.split('T')[0], 'past')
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {account.is_autopay
                                                    ? <span className="inline-flex items-center gap-1 text-blue-400 font-medium text-xs">🔄 Autopay</span>
                                                    : <span className={`text-xs font-medium ${expiryColor(account.renewal_date)}`}>
                                                        {formatRelativeDate(account.renewal_date, 'future')}
                                                    </span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <EditAccountModal account={account} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
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
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={clearSelection}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* BulkEdit Modal */}
            <BulkEditModal
                open={bulkEditOpen}
                onClose={() => setBulkEditOpen(false)}
                selectedIds={Array.from(selectedIds)}
                onSuccess={() => { clearSelection(); }}
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
