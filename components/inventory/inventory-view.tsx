'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, LayoutGrid, List, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, Users, Tv, Filter } from 'lucide-react';
import { EditAccountModal } from '@/components/inventory/edit-account-modal';
import { SlotDetailsModal } from '@/components/inventory/slot-details-modal';
import { AddAccountModal } from '@/components/inventory/add-account-modal';

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

type SortField = 'platform' | 'email' | 'available' | 'renewal_date';
type SortDirection = 'asc' | 'desc';

export function InventoryView({ accounts, platformColors, statusColors }: InventoryViewProps) {
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('platform');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState(1);

    // Extract unique platforms for filter pills
    const platforms = useMemo(() => {
        const set = new Set(accounts.map(a => a.platform));
        return Array.from(set).sort();
    }, [accounts]);

    // Filter accounts based on search + platform
    const filteredAccounts = useMemo(() => {
        let result = accounts;
        if (platformFilter !== 'all') {
            result = result.filter(a => a.platform === platformFilter);
        }
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(account =>
                account.platform.toLowerCase().includes(query) ||
                account.email.toLowerCase().includes(query)
            );
        }
        return result;
    }, [accounts, searchQuery, platformFilter]);

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

            {/* Platform Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <button
                    onClick={() => { setPlatformFilter('all'); setCurrentPage(1); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${platformFilter === 'all'
                        ? 'bg-[#86EFAC] text-black'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Todas
                </button>
                {platforms.map(p => {
                    const count = accounts.filter(a => a.platform === p).length;
                    const pColors = platformColors[p] || platformColors.default;
                    return (
                        <button
                            key={p}
                            onClick={() => { setPlatformFilter(p); setCurrentPage(1); }}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${platformFilter === p
                                ? `${pColors.bg} ${pColors.text}`
                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {p} ({count})
                        </button>
                    );
                })}
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

                            return (
                                <Card
                                    key={account.id}
                                    className={`border-border bg-gradient-to-br ${colors.gradient} to-[#1a1a1a]`}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colors.bg}`}>
                                                    <span className={`font-bold ${colors.text}`}>
                                                        {account.platform.charAt(0)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base text-foreground">
                                                        {account.platform}
                                                    </CardTitle>
                                                    <p className="text-xs text-muted-foreground">
                                                        {account.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <EditAccountModal account={account} />
                                        </div>
                                        {account.status === 'frozen' && (
                                            <div className="mx-4 mb-1">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">❄️ Cuenta Congelada</span>
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
                                                />
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between border-t border-border/50 pt-3">
                                            <div className="text-sm">
                                                <span className="text-[#86EFAC] font-medium">{available}</span>
                                                <span className="text-muted-foreground"> / {slots.length} disponibles</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {account.is_autopay
                                                    ? <span className="inline-flex items-center gap-1 text-blue-400 font-medium">🔄 Autopay</span>
                                                    : <>Vence: {new Date(account.renewal_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
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
                                    <th
                                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => handleSort('platform')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Plataforma
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
                                    const colors = platformColors[account.platform] || platformColors.default;
                                    const slots = account.sale_slots || [];
                                    const available = getAvailable(account);

                                    return (
                                        <tr key={account.id} className="bg-card hover:bg-card/80 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}
                                                    >
                                                        <span className={`text-sm font-bold ${colors.text}`}>
                                                            {account.platform.charAt(0)}
                                                        </span>
                                                    </div>
                                                    <span className="font-medium text-foreground">{account.platform}</span>
                                                    {account.status === 'frozen' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300">❄️</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {account.email}
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
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {account.is_autopay
                                                    ? <span className="inline-flex items-center gap-1 text-blue-400 font-medium">🔄 Autopay</span>
                                                    : new Date(account.renewal_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}
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
