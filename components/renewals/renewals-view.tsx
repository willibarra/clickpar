'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
    CalendarClock, RefreshCw, Check, AlertTriangle, Clock,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users, Package, Filter, Loader2, Unlock, Copy, Search,
    MessageSquare, MessageSquareOff
} from 'lucide-react';
import { toast } from 'sonner';
import { bulkRenewAccounts, bulkRenewSubscriptions, bulkReleaseSubscriptions } from '@/lib/actions/renewals';

type FilterType = 'all' | 'expired' | 'today' | 'week';
type ClientFilterType = 'all' | 'expired' | 'today' | 'week';

function getDaysUntil(dateStr: string | null): number {
    if (!dateStr) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Calculate expiry date from a sale's start_date (start + 30 days) */
function getExpiryDate(startDate: string | null): string | null {
    if (!startDate) return null;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
}

function getStatusBadge(days: number) {
    if (days < 0) return { label: `Vencido (${Math.abs(days)}d)`, color: 'bg-red-500/20 text-red-400', dot: 'bg-red-500' };
    if (days === 0) return { label: 'Hoy', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-500 animate-pulse' };
    if (days <= 3) return { label: `${days}d`, color: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-500' };
    if (days <= 7) return { label: `${days}d`, color: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-500' };
    return { label: `${days}d`, color: 'bg-green-500/20 text-green-400', dot: 'bg-green-500' };
}

interface RenewalsViewProps {
    accounts: any[];
    subscriptions: any[];
}

export function RenewalsView({ accounts, subscriptions }: RenewalsViewProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Provider tab state
    const [provFilter, setProvFilter] = useState<FilterType>('all');
    const [provSearch, setProvSearch] = useState('');
    const [provSelected, setProvSelected] = useState<Set<string>>(new Set());
    const [showProvModal, setShowProvModal] = useState(false);
    const [provCost, setProvCost] = useState('');
    const [provDays, setProvDays] = useState('30');
    const [provPageSize, setProvPageSize] = useState<number>(30);
    const [provCurrentPage, setProvCurrentPage] = useState(1);

    // Client tab state
    const [clientFilter, setClientFilter] = useState<ClientFilterType>('all');
    const [clientSearch, setClientSearch] = useState('');
    const [clientSelected, setClientSelected] = useState<Set<string>>(new Set());
    const [showClientModal, setShowClientModal] = useState(false);
    const [clientAmount, setClientAmount] = useState('');
    const [clientDays, setClientDays] = useState('30');
    const [clientPageSize, setClientPageSize] = useState<number>(30);
    const [clientCurrentPage, setClientCurrentPage] = useState(1);
    const [showReleaseModal, setShowReleaseModal] = useState(false);

    // Enrich subscriptions with expiry info
    const enrichedSubs = useMemo(() => {
        return subscriptions.map((sub: any) => {
            // Usar end_date real de la venta; calcular start+30d solo como respaldo
            const expiryDate = sub.end_date || getExpiryDate(sub.start_date);
            const daysUntilExpiry = getDaysUntil(expiryDate);
            return { ...sub, expiryDate, daysUntilExpiry };
        }).sort((a: any, b: any) => a.daysUntilExpiry - b.daysUntilExpiry);
    }, [subscriptions]);

    // Filter client subscriptions
    const filteredSubs = useMemo(() => {
        return enrichedSubs.filter((sub: any) => {
            if (clientFilter === 'expired') { if (sub.daysUntilExpiry >= 0) return false; }
            else if (clientFilter === 'today') { if (sub.daysUntilExpiry !== 0) return false; }
            else if (clientFilter === 'week') { if (sub.daysUntilExpiry < 0 || sub.daysUntilExpiry > 7) return false; }
            if (clientSearch.trim()) {
                const q = clientSearch.toLowerCase();
                const c = sub.customer;
                return c?.full_name?.toLowerCase().includes(q) || c?.phone?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [enrichedSubs, clientFilter, clientSearch]);

    // Client stats
    const clientExpiredCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry < 0).length;
    const clientTodayCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry === 0).length;
    const clientWeekCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry >= 0 && s.daysUntilExpiry <= 7).length;

    // Filter accounts
    const filteredAccounts = useMemo(() => {
        return accounts.filter(a => {
            const days = getDaysUntil(a.renewal_date);
            if (provFilter === 'expired') { if (days >= 0) return false; }
            else if (provFilter === 'today') { if (days !== 0) return false; }
            else if (provFilter === 'week') { if (days < 0 || days > 7) return false; }
            if (provSearch.trim()) {
                const q = provSearch.toLowerCase();
                return a.platform?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [accounts, provFilter, provSearch]);

    // Paginate providers
    const paginatedAccounts = useMemo(() => {
        if (provPageSize === 0) return filteredAccounts;
        const start = (provCurrentPage - 1) * provPageSize;
        return filteredAccounts.slice(start, start + provPageSize);
    }, [filteredAccounts, provCurrentPage, provPageSize]);
    const provTotalPages = provPageSize === 0 ? 1 : Math.ceil(filteredAccounts.length / provPageSize);

    // Paginate clients
    const paginatedSubs = useMemo(() => {
        if (clientPageSize === 0) return filteredSubs;
        const start = (clientCurrentPage - 1) * clientPageSize;
        return filteredSubs.slice(start, start + clientPageSize);
    }, [filteredSubs, clientCurrentPage, clientPageSize]);
    const clientTotalPages = clientPageSize === 0 ? 1 : Math.ceil(filteredSubs.length / clientPageSize);

    // Stats
    const expiredCount = accounts.filter(a => getDaysUntil(a.renewal_date) < 0).length;
    const todayCount = accounts.filter(a => getDaysUntil(a.renewal_date) === 0).length;
    const weekCount = accounts.filter(a => getDaysUntil(a.renewal_date) >= 0 && getDaysUntil(a.renewal_date) <= 7).length;

    // Toggle selection
    const toggleProv = (id: string) => {
        setProvSelected(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const toggleAllProv = () => {
        if (provSelected.size === filteredAccounts.length) {
            setProvSelected(new Set());
        } else {
            setProvSelected(new Set(filteredAccounts.map((a: any) => a.id)));
        }
    };

    const handleCopyProviders = () => {
        const selectedAccounts = filteredAccounts.filter((a: any) => provSelected.has(a.id));
        if (selectedAccounts.length === 0) return;

        const emailsStr = selectedAccounts.map((a: any) => a.email).join('\n');
        const totalUsdt = selectedAccounts.reduce((sum: number, a: any) => sum + (Number(a.purchase_cost_usdt) || 0), 0);

        const textToCopy = `CUENTAS: (${selectedAccounts.length})
${emailsStr}

TOTAL A PAGAR: ${totalUsdt} USDT`;

        navigator.clipboard.writeText(textToCopy);
        toast.success('Copiado al portapapeles', { description: 'Correos y total a pagar copiados.' });
    };

    const toggleClient = (id: string) => {
        setClientSelected(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const toggleAllClients = () => {
        if (clientSelected.size === filteredSubs.length) {
            setClientSelected(new Set());
        } else {
            setClientSelected(new Set(filteredSubs.map((s: any) => s.id)));
        }
    };

    // Bulk renew providers
    const handleBulkRenewProviders = () => {
        const cost = parseFloat(provCost);
        const days = parseInt(provDays);
        if (isNaN(cost) || cost <= 0 || isNaN(days) || days <= 0) return;

        startTransition(async () => {
            const result = await bulkRenewAccounts(Array.from(provSelected), cost, days);
            if (result.success) {
                setShowProvModal(false);
                setProvSelected(new Set());
                setProvCost('');
                router.refresh();
            }
        });
    };

    // Bulk renew clients
    const handleBulkRenewClients = () => {
        const amount = parseFloat(clientAmount);
        const days = parseInt(clientDays);
        if (isNaN(amount) || amount <= 0 || isNaN(days) || days <= 0) return;

        startTransition(async () => {
            const result = await bulkRenewSubscriptions(Array.from(clientSelected), amount, days);
            if (result.success) {
                setShowClientModal(false);
                setClientSelected(new Set());
                setClientAmount('');
                router.refresh();
            }
        });
    };

    // Bulk release (liberar) unpaid clients
    const handleBulkRelease = () => {
        startTransition(async () => {
            const result = await bulkReleaseSubscriptions(Array.from(clientSelected));
            if (result.success) {
                setShowReleaseModal(false);
                setClientSelected(new Set());
                router.refresh();
            }
        });
    };

    const filterButtons: { key: FilterType; label: string; count?: number }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'expired', label: 'Vencidos', count: expiredCount },
        { key: 'today', label: 'Hoy', count: todayCount },
        { key: 'week', label: 'Próx. 7d', count: weekCount },
    ];

    const clientFilterButtons: { key: ClientFilterType; label: string; count?: number }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'expired', label: 'Vencidos', count: clientExpiredCount },
        { key: 'today', label: 'Hoy', count: clientTodayCount },
        { key: 'week', label: 'Próx. 7d', count: clientWeekCount },
    ];

    return (
        <>
            <Tabs defaultValue="providers" className="space-y-4">
                <TabsList className="bg-[#1a1a1a] border border-border">
                    <TabsTrigger value="providers" className="gap-2 data-[state=active]:bg-[#86EFAC] data-[state=active]:text-black">
                        <Package className="h-4 w-4" />
                        Proveedores ({accounts.length})
                    </TabsTrigger>
                    <TabsTrigger value="clients" className="gap-2 data-[state=active]:bg-[#86EFAC] data-[state=active]:text-black">
                        <Users className="h-4 w-4" />
                        Clientes ({subscriptions.length})
                    </TabsTrigger>
                </TabsList>

                {/* ─── PROVIDERS TAB ─── */}
                <TabsContent value="providers" className="space-y-4">
                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl border border-border bg-[#1a1a1a] p-4">
                            <p className="text-xs text-muted-foreground">Total Cuentas</p>
                            <p className="text-2xl font-bold">{accounts.length}</p>
                        </div>
                        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                            <p className="text-xs text-red-400">🔴 Vencidas</p>
                            <p className="text-2xl font-bold text-red-400">{expiredCount}</p>
                        </div>
                        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                            <p className="text-xs text-orange-400">🟠 Vencen Hoy</p>
                            <p className="text-2xl font-bold text-orange-400">{todayCount}</p>
                        </div>
                        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                            <p className="text-xs text-blue-400">🔵 Próx. 7 días</p>
                            <p className="text-2xl font-bold text-blue-400">{weekCount}</p>
                        </div>
                    </div>

                    {/* Search + Filters + Bulk Action */}
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por plataforma o email..."
                                value={provSearch}
                                onChange={(e) => { setProvSearch(e.target.value); setProvCurrentPage(1); }}
                                className="pl-9 bg-[#1a1a1a] border-border"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                {filterButtons.map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => { setProvFilter(f.key); setProvSelected(new Set()); setProvCurrentPage(1); }}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${provFilter === f.key
                                            ? 'bg-[#86EFAC] text-black'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {f.label}{f.count !== undefined ? ` (${f.count})` : ''}
                                    </button>
                                ))}
                            </div>
                            {provSelected.size > 0 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyProviders}
                                        className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-2 h-9 px-3 text-xs"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        COPIAR seleccionados
                                    </Button>
                                    <Button
                                        onClick={() => setShowProvModal(true)}
                                        className="bg-[#F97316] hover:bg-[#F97316]/90 text-white gap-2 h-9"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Renovar a Proveedor ({provSelected.size})
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Table */}
                        <div className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-[40px_1fr_1fr_120px_100px_80px] gap-2 px-4 py-3 text-xs font-medium text-muted-foreground border-b border-border bg-[#0d0d0d]">
                                <div className="flex items-center">
                                    <Checkbox
                                        checked={provSelected.size === filteredAccounts.length && filteredAccounts.length > 0}
                                        onCheckedChange={toggleAllProv}
                                    />
                                </div>
                                <div>Plataforma / Email</div>
                                <div>Slots</div>
                                <div>Vencimiento</div>
                                <div>Estado</div>
                                <div>Costo</div>
                            </div>
                            {/* Rows */}
                            {paginatedAccounts.length === 0 && (
                                <div className="py-12 text-center text-muted-foreground">
                                    No hay cuentas en este filtro
                                </div>
                            )}
                            {paginatedAccounts.map((account: any) => {
                                const days = getDaysUntil(account.renewal_date);
                                const badge = getStatusBadge(days);
                                const slots = account.sale_slots || [];
                                const soldCount = slots.filter((s: any) => s.status === 'sold').length;

                                return (
                                    <div
                                        key={account.id}
                                        className={`grid grid-cols-[40px_1fr_1fr_120px_100px_80px] gap-2 px-4 py-3 border-b border-border/50 items-center transition-colors ${provSelected.has(account.id) ? 'bg-[#86EFAC]/5' : 'hover:bg-[#1a1a1a]/50'
                                            }`}
                                    >
                                        <div>
                                            <Checkbox
                                                checked={provSelected.has(account.id)}
                                                onCheckedChange={() => toggleProv(account.id)}
                                            />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">{account.platform}</p>
                                            <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {soldCount}/{slots.length} vendidos
                                        </div>
                                        <div className="text-sm">
                                            {account.renewal_date ? new Date(account.renewal_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) : '—'}
                                        </div>
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {account.purchase_cost_gs ? `${(account.purchase_cost_gs / 1000).toFixed(0)}k` : '—'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {filteredAccounts.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Mostrar:</span>
                                    <Select
                                        value={provPageSize.toString()}
                                        onValueChange={(v) => { setProvPageSize(parseInt(v)); setProvCurrentPage(1); }}
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
                                {provPageSize !== 0 && provTotalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setProvCurrentPage(p => Math.max(1, p - 1))} disabled={provCurrentPage === 1} className="border-border">
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm text-muted-foreground px-2">{provCurrentPage} / {provTotalPages}</span>
                                        <Button variant="outline" size="sm" onClick={() => setProvCurrentPage(p => Math.min(provTotalPages, p + 1))} disabled={provCurrentPage === provTotalPages} className="border-border">
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                                <span className="text-sm text-muted-foreground">{filteredAccounts.length} cuenta(s) en total</span>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* ─── CLIENTS TAB ─── */}
                <TabsContent value="clients" className="space-y-4">
                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl border border-border bg-[#1a1a1a] p-4">
                            <p className="text-xs text-muted-foreground">Total Suscripciones</p>
                            <p className="text-2xl font-bold">{enrichedSubs.length}</p>
                        </div>
                        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                            <p className="text-xs text-red-400">🔴 Vencidas</p>
                            <p className="text-2xl font-bold text-red-400">{clientExpiredCount}</p>
                        </div>
                        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                            <p className="text-xs text-orange-400">🟠 Vencen Hoy</p>
                            <p className="text-2xl font-bold text-orange-400">{clientTodayCount}</p>
                        </div>
                        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                            <p className="text-xs text-blue-400">🔵 Próx. 7 días</p>
                            <p className="text-2xl font-bold text-blue-400">{clientWeekCount}</p>
                        </div>
                    </div>

                    {/* Search + Filters + Bulk Action */}
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre o teléfono..."
                                value={clientSearch}
                                onChange={(e) => { setClientSearch(e.target.value); setClientCurrentPage(1); }}
                                className="pl-9 bg-[#1a1a1a] border-border"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                {clientFilterButtons.map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => { setClientFilter(f.key); setClientSelected(new Set()); setClientCurrentPage(1); }}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${clientFilter === f.key
                                            ? 'bg-[#86EFAC] text-black'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {f.label}{f.count !== undefined ? ` (${f.count})` : ''}
                                    </button>
                                ))}
                            </div>
                            {clientSelected.size > 0 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => setShowClientModal(true)}
                                        className="bg-[#86EFAC] hover:bg-[#86EFAC]/90 text-black gap-2"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Renovar ({clientSelected.size})
                                    </Button>
                                    <Button
                                        onClick={() => setShowReleaseModal(true)}
                                        variant="outline"
                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2"
                                    >
                                        <Unlock className="h-4 w-4" />
                                        Liberar ({clientSelected.size})
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Table */}
                        <div className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden">
                            <div className="grid grid-cols-[40px_1fr_1fr_120px_100px_100px_90px] gap-2 px-4 py-3 text-xs font-medium text-muted-foreground border-b border-border bg-[#0d0d0d]">
                                <div className="flex items-center">
                                    <Checkbox
                                        checked={clientSelected.size === paginatedSubs.length && paginatedSubs.length > 0}
                                        onCheckedChange={toggleAllClients}
                                    />
                                </div>
                                <div>Cliente</div>
                                <div>Plataforma / Cuenta</div>
                                <div>Vencimiento</div>
                                <div>Estado</div>
                                <div>Aviso WA</div>
                                <div>Monto</div>
                            </div>
                            {paginatedSubs.length === 0 && (
                                <div className="py-12 text-center text-muted-foreground">
                                    No hay suscripciones en este filtro
                                </div>
                            )}
                            {paginatedSubs.map((sub: any) => {
                                const customer = sub.customer;
                                const slot = sub.slot;
                                const account = slot?.mother_account;
                                const badge = getStatusBadge(sub.daysUntilExpiry);

                                return (
                                    <div
                                        key={sub.id}
                                        className={`grid grid-cols-[40px_1fr_1fr_120px_100px_100px_90px] gap-2 px-4 py-3 border-b border-border/50 items-center transition-colors ${clientSelected.has(sub.id) ? 'bg-[#86EFAC]/5' : 'hover:bg-[#1a1a1a]/50'
                                            }`}
                                    >
                                        <div>
                                            <Checkbox
                                                checked={clientSelected.has(sub.id)}
                                                onCheckedChange={() => toggleClient(sub.id)}
                                            />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">{customer?.full_name || 'N/A'}</p>
                                            <p className="text-xs text-muted-foreground">{customer?.phone || ''}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{account?.platform || 'N/A'}</p>
                                            <p className="text-xs text-muted-foreground truncate">{account?.email || ''}</p>
                                        </div>
                                        <div className="text-sm">
                                            {sub.expiryDate ? new Date(sub.expiryDate + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) : '—'}
                                        </div>
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div className="text-sm font-medium text-[#86EFAC]">
                                            {sub.amount_gs ? `${(sub.amount_gs / 1000).toFixed(0)}k Gs` : '—'}
                                        </div>
                                        {/* Aviso WhatsApp */}
                                        <div>
                                            {sub.lastNotified ? (
                                                <div
                                                    className="flex items-center gap-1 text-xs text-[#86EFAC] cursor-default"
                                                    title={`${sub.lastNotified.template === 'vencimiento_hoy' ? 'Aviso día de vencimiento' : 'Aviso previo'} · ${new Date(sub.lastNotified.sentAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                                                >
                                                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                                                    <span>
                                                        {new Date(sub.lastNotified.sentAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div
                                                    className="flex items-center gap-1 text-xs text-muted-foreground/50 cursor-default"
                                                    title="Sin aviso enviado aún"
                                                >
                                                    <MessageSquareOff className="h-3.5 w-3.5 flex-shrink-0" />
                                                    <span>Sin aviso</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {filteredSubs.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Mostrar:</span>
                                    <Select
                                        value={clientPageSize.toString()}
                                        onValueChange={(v) => { setClientPageSize(parseInt(v)); setClientCurrentPage(1); }}
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
                                {clientPageSize !== 0 && clientTotalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setClientCurrentPage(p => Math.max(1, p - 1))} disabled={clientCurrentPage === 1} className="border-border">
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm text-muted-foreground px-2">{clientCurrentPage} / {clientTotalPages}</span>
                                        <Button variant="outline" size="sm" onClick={() => setClientCurrentPage(p => Math.min(clientTotalPages, p + 1))} disabled={clientCurrentPage === clientTotalPages} className="border-border">
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                                <span className="text-sm text-muted-foreground">{filteredSubs.length} suscripción(es) en total</span>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* ─── PROVIDER RENEWAL MODAL ─── */}
            <Dialog open={showProvModal} onOpenChange={setShowProvModal}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#F97316]">
                            <RefreshCw className="h-5 w-5" />
                            Renovar a Proveedor
                        </DialogTitle>
                        <DialogDescription>
                            Renovar {provSelected.size} cuenta(s) seleccionada(s)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-[#F97316]/10 border border-[#F97316]/20 p-3 text-sm text-[#F97316]">
                            {provSelected.size} cuenta(s) serán renovadas
                        </div>
                        <div className="space-y-2">
                            <Label>Costo Total de Renovación (Gs.)</Label>
                            <Input
                                type="number"
                                value={provCost}
                                onChange={e => setProvCost(e.target.value)}
                                placeholder="Ej: 150000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Días a Extender</Label>
                            <Input
                                type="number"
                                value={provDays}
                                onChange={e => setProvDays(e.target.value)}
                                min={1}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowProvModal(false)}>Cancelar</Button>
                        <Button
                            onClick={handleBulkRenewProviders}
                            disabled={isPending || !provCost || !provDays}
                            className="bg-[#F97316] hover:bg-[#F97316]/90 text-white gap-2"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Confirmar Renovación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── CLIENT RENEWAL MODAL ─── */}
            <Dialog open={showClientModal} onOpenChange={setShowClientModal}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#86EFAC]">
                            <RefreshCw className="h-5 w-5" />
                            Renovar Suscripción
                        </DialogTitle>
                        <DialogDescription>
                            Renovar {clientSelected.size} suscripción(es) seleccionada(s)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-[#86EFAC]/10 border border-[#86EFAC]/20 p-3 text-sm text-[#86EFAC]">
                            {clientSelected.size} suscripción(es) serán renovadas
                        </div>
                        <div className="space-y-2">
                            <Label>Monto Cobrado (Gs.)</Label>
                            <Input
                                type="number"
                                value={clientAmount}
                                onChange={e => setClientAmount(e.target.value)}
                                placeholder="Ej: 25000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Días a Extender</Label>
                            <Input
                                type="number"
                                value={clientDays}
                                onChange={e => setClientDays(e.target.value)}
                                min={1}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowClientModal(false)}>Cancelar</Button>
                        <Button
                            onClick={handleBulkRenewClients}
                            disabled={isPending || !clientAmount || !clientDays}
                            className="bg-[#86EFAC] hover:bg-[#86EFAC]/90 text-black gap-2"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Confirmar Renovación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── RELEASE (LIBERAR) MODAL ─── */}
            <Dialog open={showReleaseModal} onOpenChange={setShowReleaseModal}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-400">
                            <Unlock className="h-5 w-5" />
                            Liberar Perfil
                        </DialogTitle>
                        <DialogDescription>
                            Liberar {clientSelected.size} perfil(es) de clientes que no pagaron
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-2">
                            <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Esta acción no se puede deshacer
                            </p>
                            <ul className="text-xs text-red-400/80 space-y-1 ml-6 list-disc">
                                <li>{clientSelected.size} venta(s) serán desactivadas</li>
                                <li>Los perfiles/slots volverán a estar disponibles para venta</li>
                                <li>Se generará una alerta de cambio de contraseña si la cuenta tiene otros usuarios activos</li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReleaseModal(false)}>Cancelar</Button>
                        <Button
                            onClick={handleBulkRelease}
                            disabled={isPending}
                            className="bg-red-600 hover:bg-red-700 text-white gap-2"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                            Confirmar Liberación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
