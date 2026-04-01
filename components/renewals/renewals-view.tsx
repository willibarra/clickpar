'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useUsdtRate } from '@/lib/usdt-rate';
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
    MessageSquare, MessageSquareOff, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { bulkRenewAccounts, bulkRenewSubscriptions, bulkReleaseSubscriptions, sendRenewalNotice, markAccountsAsPossibleAutopay, markAccountsAsNoRenovar, confirmNoRenovar } from '@/lib/actions/renewals';
import { BatchSendModal } from "./batch-send-modal";

type FilterType = 'all' | 'expired' | 'today' | '3days';
type ClientFilterType = 'all' | 'expired' | 'today' | '3days';

const MESES_CORTOS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

/** Formateador determinístico para evitar hydration mismatch con toLocaleDateString */
function formatDateES(date: Date, opts: { year?: boolean; time?: boolean } = {}): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = MESES_CORTOS[date.getMonth()];
    let str = `${d}-${m}`;
    if (opts.year) str += `, ${String(date.getFullYear()).slice(-2)}`;
    if (opts.time) {
        const hh = date.getHours();
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ampm = hh >= 12 ? 'p. m.' : 'a. m.';
        const h12 = hh % 12 || 12;
        str += `, ${h12}:${mm} ${ampm}`;
    }
    return str;
}

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
    if (days < 0) return { label: `Vencido (${Math.abs(days)}d)`, color: 'bg-red-600/30 text-red-300 ring-1 ring-red-500/50', dot: 'bg-red-400 animate-pulse' };
    if (days === 0) return { label: 'Vence Hoy', color: 'bg-orange-500/25 text-orange-300 ring-1 ring-orange-500/40', dot: 'bg-orange-400 animate-pulse' };
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
    const [provPlatformFilter, setProvPlatformFilter] = useState<string>('all');
    const [provSelected, setProvSelected] = useState<Set<string>>(new Set());
    const [showProvModal, setShowProvModal] = useState(false);
    const [provCost, setProvCost] = useState('');
    const [provUsdt, setProvUsdt] = useState('');
    const [provDays, setProvDays] = useState('30');
    const todayStr = new Date().toISOString().split('T')[0];
    const [provRenewalDate, setProvRenewalDate] = useState(todayStr);
    const { rate: usdtRate } = useUsdtRate(); // Lee de localStorage (configurado en Settings)
    const [provPageSize, setProvPageSize] = useState<number>(30);
    const [provCurrentPage, setProvCurrentPage] = useState(1);

    // Client tab state
    const [clientFilter, setClientFilter] = useState<ClientFilterType>('all');
    const [clientSearch, setClientSearch] = useState('');
    const [clientPlatformFilter, setClientPlatformFilter] = useState<string>('all');
    const [clientSelected, setClientSelected] = useState<Set<string>>(new Set());
    const [showClientModal, setShowClientModal] = useState(false);
    const [clientAmount, setClientAmount] = useState('');
    const [clientDays, setClientDays] = useState('30');
    const [clientPageSize, setClientPageSize] = useState<number>(30);
    const [clientCurrentPage, setClientCurrentPage] = useState(1);
    const [showReleaseModal, setShowReleaseModal] = useState(false);
    const [showBatchSendModal, setShowBatchSendModal] = useState(false);
    // Client sorting
    type ClientSortCol = 'expiry' | 'customer' | 'platform' | 'status' | 'amount';
    const [clientSortCol, setClientSortCol] = useState<ClientSortCol>('expiry');
    const [clientSortDir, setClientSortDir] = useState<'asc' | 'desc'>('asc');
    const [sendingNotice, setSendingNotice] = useState<Set<string>>(new Set());

    // No Renovar modal state
    const [showAutopayModal, setShowAutopayModal] = useState(false);
    const [showNoRenovarModal, setShowNoRenovarModal] = useState(false);
    const [noRenovarLoading, setNoRenovarLoading] = useState(false);
    const [autopayLoading, setAutopayLoading] = useState(false);
    const [noRenovarData, setNoRenovarData] = useState<{
        activeClients: any[];
        availableDestinations: any[];
        canAutoMove: boolean;
    } | null>(null);
    const [movedClientsForWA, setMovedClientsForWA] = useState<any[]>([]);

    // Enrich subscriptions with expiry info
    const enrichedSubs = useMemo(() => {
        return subscriptions.map((sub: any) => {
            // Usar end_date real de la venta; calcular start+30d solo como respaldo
            const expiryDate = sub.end_date || getExpiryDate(sub.start_date);
            const daysUntilExpiry = getDaysUntil(expiryDate);
            return { ...sub, expiryDate, daysUntilExpiry };
        });
    }, [subscriptions]);

    // Unique platforms for client filter chips (derived from enrichedSubs filtered by status+search, no platform filter)
    const clientSubsForPlatformFilter = useMemo(() => {
        return enrichedSubs.filter((sub: any) => {
            if (clientFilter === 'expired') { if (sub.daysUntilExpiry >= 0) return false; }
            else if (clientFilter === 'today') { if (sub.daysUntilExpiry !== 0) return false; }
            else if (clientFilter === '3days') { if (sub.daysUntilExpiry < 1 || sub.daysUntilExpiry > 3) return false; }
            if (clientSearch.trim()) {
                const q = clientSearch.toLowerCase();
                const c = sub.customer;
                const qDigits = q.replace(/\D/g, '');
                const isPhoneSearch = qDigits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
                if (isPhoneSearch) {
                    const phoneDigits = (c?.phone || '').replace(/\D/g, '');
                    return phoneDigits.includes(qDigits) || c?.full_name?.toLowerCase().includes(q);
                }
                return c?.full_name?.toLowerCase().includes(q) || c?.phone?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [enrichedSubs, clientFilter, clientSearch]);

    const uniqueClientPlatforms = useMemo(() => {
        const set = new Set<string>();
        clientSubsForPlatformFilter.forEach((sub: any) => {
            const platform = sub.slot?.mother_account?.platform;
            if (platform) set.add(platform);
        });
        return Array.from(set).sort();
    }, [clientSubsForPlatformFilter]);

    // Filter client subscriptions (including platform filter)
    const filteredSubs = useMemo(() => {
        const filtered = clientSubsForPlatformFilter.filter((sub: any) => {
            if (clientPlatformFilter !== 'all') {
                if (sub.slot?.mother_account?.platform !== clientPlatformFilter) return false;
            }
            return true;
        });
        // Sort: primary by selected column, secondary always by vencimiento
        return filtered.sort((a: any, b: any) => {
            const dir = clientSortDir === 'asc' ? 1 : -1;
            let primary = 0;
            if (clientSortCol === 'expiry' || primary === 0) {
                // When sorting by expiry, just sort by days
                if (clientSortCol === 'expiry') return dir * (a.daysUntilExpiry - b.daysUntilExpiry);
            }
            if (clientSortCol === 'customer') {
                const na = (a.customer?.full_name || a.customer?.phone || '').toLowerCase();
                const nb = (b.customer?.full_name || b.customer?.phone || '').toLowerCase();
                primary = na.localeCompare(nb);
            } else if (clientSortCol === 'platform') {
                const pa = (a.slot?.mother_account?.platform || '').toLowerCase();
                const pb = (b.slot?.mother_account?.platform || '').toLowerCase();
                primary = pa.localeCompare(pb);
            } else if (clientSortCol === 'status') {
                primary = a.daysUntilExpiry - b.daysUntilExpiry;
            } else if (clientSortCol === 'amount') {
                primary = (a.amount_gs || 0) - (b.amount_gs || 0);
            }
            if (primary !== 0) return dir * primary;
            // Tiebreaker: always vencimiento asc
            return a.daysUntilExpiry - b.daysUntilExpiry;
        });
    }, [clientSubsForPlatformFilter, clientPlatformFilter, clientSortCol, clientSortDir]);

    // Client stats
    const clientExpiredCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry < 0).length;
    const clientTodayCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry === 0).length;
    const clientThreeDayCount = enrichedSubs.filter((s: any) => s.daysUntilExpiry >= 1 && s.daysUntilExpiry <= 3).length;
    const clientUrgentTotal = clientExpiredCount + clientTodayCount + clientThreeDayCount;

    // Accounts filtered by status+search only (no platform filter)
    // Used to compute correct per-platform counts and unique platforms for the chips
    const accountsForPlatformFilter = useMemo(() => {
        return accounts.filter(a => {
            const days = getDaysUntil(a.renewal_date);
            if (provFilter === 'expired') { if (days >= 0) return false; }
            else if (provFilter === 'today') { if (days !== 0) return false; }
            else if (provFilter === '3days') { if (days < 1 || days > 3) return false; }
            if (provSearch.trim()) {
                const q = provSearch.toLowerCase();
                return a.platform?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [accounts, provFilter, provSearch]);

    // Unique platform list derived from context-filtered accounts
    const uniquePlatforms = useMemo(() => {
        const set = new Set<string>();
        accountsForPlatformFilter.forEach(a => { if (a.platform) set.add(a.platform); });
        return Array.from(set).sort();
    }, [accountsForPlatformFilter]);

    // Filter accounts and sort A-Z by email
    const filteredAccounts = useMemo(() => {
        return accounts.filter(a => {
            const days = getDaysUntil(a.renewal_date);
            if (provFilter === 'expired') { if (days >= 0) return false; }
            else if (provFilter === 'today') { if (days !== 0) return false; }
            else if (provFilter === '3days') { if (days < 1 || days > 3) return false; }
            if (provPlatformFilter !== 'all') {
                if (a.platform !== provPlatformFilter) return false;
            }
            if (provSearch.trim()) {
                const q = provSearch.toLowerCase();
                return a.platform?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
            }
            return true;
        }).sort((a: any, b: any) => {
            const da = a.renewal_date || '9999';
            const db = b.renewal_date || '9999';
            return da.localeCompare(db);
        });
    }, [accounts, provFilter, provPlatformFilter, provSearch]);

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
    const provThreeDayCount = accounts.filter(a => { const d = getDaysUntil(a.renewal_date); return d >= 1 && d <= 3; }).length;
    const provUrgentTotal = expiredCount + todayCount + provThreeDayCount;

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

    // Open provider modal (no need to fetch - uses configured rate from Settings)
    const handleOpenProvModal = () => {
        const today = new Date();
        const todayIso = today.toISOString().split('T')[0];
        setProvRenewalDate(todayIso);
        // Auto-calcular días restantes del mes actual
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const diff = Math.round((endOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        setProvDays(diff.toString());
        setShowProvModal(true);
    };

    const handleUsdtChange = (val: string) => {
        setProvUsdt(val);
        if (usdtRate > 0 && val) {
            const gs = Math.round(parseFloat(val) * usdtRate);
            if (!isNaN(gs)) setProvCost(gs.toString());
        }
    };

    // Bulk renew providers
    const handleBulkRenewProviders = () => {
        const cost = parseFloat(provCost);
        const days = parseInt(provDays);
        const usdt = parseFloat(provUsdt) || undefined;
        if (isNaN(cost) || cost <= 0 || isNaN(days) || days <= 0) return;

        startTransition(async () => {
            const result = await bulkRenewAccounts(Array.from(provSelected), cost, days, usdt);
            if (result.success) {
                setShowProvModal(false);
                setProvSelected(new Set());
                setProvCost('');
                setProvUsdt('');
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

    // Send WhatsApp notice for a single sale
    const handleSendNotice = async (saleId: string) => {
        setSendingNotice(prev => new Set(prev).add(saleId));
        try {
            const result = await sendRenewalNotice(saleId);
            if (result.success) {
                toast.success('Aviso enviado por WhatsApp ✅');
                router.refresh();
            } else {
                toast.error('Error al enviar', { description: typeof result.error === 'string' ? result.error : JSON.stringify(result.error) });
            }
        } finally {
            setSendingNotice(prev => { const n = new Set(prev); n.delete(saleId); return n; });
        }
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

    // Handler: open No Renovar modal (check for active clients first)
    const handleOpenNoRenovar = async () => {
        setNoRenovarLoading(true);
        try {
            const result = await markAccountsAsNoRenovar(Array.from(provSelected));
            if (result.success) {
                setNoRenovarData({
                    activeClients: result.activeClients,
                    availableDestinations: result.availableDestinations,
                    canAutoMove: result.canAutoMove,
                });
                setShowNoRenovarModal(true);
            } else {
                toast.error('Error al verificar cuentas');
            }
        } finally {
            setNoRenovarLoading(false);
        }
    };

    // Handler: confirm Posible Autopay
    const handleConfirmAutopay = () => {
        setAutopayLoading(true);
        startTransition(async () => {
            const result = await markAccountsAsPossibleAutopay(Array.from(provSelected));
            setAutopayLoading(false);
            if (result.success) {
                toast.success(`💳 ${result.updated} cuenta(s) marcadas como Posible Autopay`);
                setShowAutopayModal(false);
                setProvSelected(new Set());
                router.refresh();
            } else {
                toast.error('Error', { description: (result as any).error });
            }
        });
    };

    // Handler: confirm No Renovar (with optional auto-move)
    const handleConfirmNoRenovar = (autoMove: boolean) => {
        if (!noRenovarData) return;
        startTransition(async () => {
            let moves: Array<{ saleId: string; oldSlotId: string; newSlotId: string }> = [];
            const clientsToNotify: any[] = [];

            if (autoMove && noRenovarData.canAutoMove) {
                // Pair each active client with an available destination slot
                moves = noRenovarData.activeClients.map((client, i) => ({
                    saleId: client.saleId,
                    oldSlotId: client.slotId,
                    newSlotId: noRenovarData.availableDestinations[i].slotId,
                }));
                // Prepare clients for WA notification after move
                noRenovarData.activeClients.forEach((client, i) => {
                    const dest = noRenovarData.availableDestinations[i];
                    if (client.customer?.phone) {
                        clientsToNotify.push({
                            sale_id: client.saleId,
                            phone: client.customer.phone,
                            customer_name: client.customer.full_name || client.customer.phone,
                            platform: dest?.platform || client.platform,
                            end_date: client.endDate,
                            amount: client.amountGs,
                            days: client.endDate ? Math.ceil((new Date(client.endDate + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / (1000*60*60*24)) : -1,
                        });
                    }
                });
            }
            const result = await confirmNoRenovar(Array.from(provSelected), moves);
            if (result.success) {
                const movedMsg = moves.length > 0 ? ` y ${moves.length} cliente(s) movidos` : '';
                toast.success(`🚫 Cuentas marcadas como No Renovar${movedMsg}`);
                setShowNoRenovarModal(false);
                setNoRenovarData(null);
                setProvSelected(new Set());
                router.refresh();
                // Si hay clientes movidos con teléfono, ofrecer envío de WA
                if (clientsToNotify.length > 0) {
                    setMovedClientsForWA(clientsToNotify);
                    setShowBatchSendModal(true);
                }
            } else {
                toast.error('Error', { description: result.error });
            }
        });
    };

    const filterButtons: { key: FilterType; label: string; count?: number }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'expired', label: 'Vencidos', count: expiredCount },
        { key: 'today', label: 'Hoy', count: todayCount },
        { key: '3days', label: 'Próx. 3d', count: provThreeDayCount },
    ];

    const clientFilterButtons: { key: ClientFilterType; label: string; count?: number }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'expired', label: 'Vencidos', count: clientExpiredCount },
        { key: 'today', label: 'Hoy', count: clientTodayCount },
        { key: '3days', label: 'Próx. 3d', count: clientThreeDayCount },
    ];

    return (
        <>
            <Tabs defaultValue="clients" className="space-y-4">
                <TabsList className="bg-[#1a1a1a] border border-border">
                    <TabsTrigger value="providers" className="gap-2 data-[state=active]:bg-[#86EFAC] data-[state=active]:text-black">
                        <Package className="h-4 w-4" />
                        Proveedores <span className="ml-1 rounded-full bg-red-500/20 text-red-400 text-[11px] font-bold px-1.5 py-0.5">{provUrgentTotal}</span>
                    </TabsTrigger>
                    <TabsTrigger value="clients" className="gap-2 data-[state=active]:bg-[#86EFAC] data-[state=active]:text-black">
                        <Users className="h-4 w-4" />
                        Clientes <span className="ml-1 rounded-full bg-red-500/20 text-red-400 text-[11px] font-bold px-1.5 py-0.5">{clientUrgentTotal}</span>
                    </TabsTrigger>
                </TabsList>

                {/* ─── PROVIDERS TAB ─── */}
                <TabsContent value="providers" className="space-y-4">
                    {/* Stats Row — clickable filters */}
                    <div className="grid grid-cols-4 gap-3">
                        {/* TOTAL urgente */}
                        <button
                            onClick={() => { setProvFilter('all'); setProvSelected(new Set()); setProvCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                provFilter === 'all'
                                    ? 'border-[#86EFAC] bg-[#86EFAC]/10 ring-1 ring-[#86EFAC]/50'
                                    : 'border-border bg-[#1a1a1a] hover:border-border/80'
                            }`}
                        >
                            <p className="text-xs text-muted-foreground">Total urgente</p>
                            <p className="text-2xl font-bold">{provUrgentTotal}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">venc. + hoy + 3d</p>
                        </button>
                        {/* Vencidas */}
                        <button
                            onClick={() => { setProvFilter('expired'); setProvSelected(new Set()); setProvCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                provFilter === 'expired'
                                    ? 'border-red-400 bg-red-500/15 ring-1 ring-red-400/50'
                                    : 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
                            }`}
                        >
                            <p className="text-xs text-red-400">🔴 Vencidas</p>
                            <p className="text-2xl font-bold text-red-400">{expiredCount}</p>
                        </button>
                        {/* Vencen Hoy */}
                        <button
                            onClick={() => { setProvFilter('today'); setProvSelected(new Set()); setProvCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                provFilter === 'today'
                                    ? 'border-orange-400 bg-orange-500/15 ring-1 ring-orange-400/50'
                                    : 'border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50'
                            }`}
                        >
                            <p className="text-xs text-orange-400">🟠 Vence Hoy</p>
                            <p className="text-2xl font-bold text-orange-400">{todayCount}</p>
                        </button>
                        {/* Próx. 3 días */}
                        <button
                            onClick={() => { setProvFilter('3days'); setProvSelected(new Set()); setProvCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                provFilter === '3days'
                                    ? 'border-yellow-400 bg-yellow-500/15 ring-1 ring-yellow-400/50'
                                    : 'border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50'
                            }`}
                        >
                            <p className="text-xs text-yellow-400">🟡 Próx. 3 días</p>
                            <p className="text-2xl font-bold text-yellow-400">{provThreeDayCount}</p>
                        </button>
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
                        {/* Status filters row */}
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
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyProviders}
                                        className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-2 h-9 px-3 text-xs"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        COPIAR seleccionados
                                    </Button>
                                    <Button
                                        onClick={handleOpenProvModal}
                                        className="bg-[#F97316] hover:bg-[#F97316]/90 text-white gap-2 h-9"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Renovar a Proveedor ({provSelected.size})
                                    </Button>
                                    <Button
                                        onClick={() => setShowAutopayModal(true)}
                                        className="bg-emerald-600 hover:bg-emerald-600/90 text-white gap-2 h-9"
                                    >
                                        💳 Posible Autopay ({provSelected.size})
                                    </Button>
                                    <Button
                                        onClick={handleOpenNoRenovar}
                                        variant="outline"
                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2 h-9"
                                    >
                                        🚫 No Renovar ({provSelected.size})
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Platform / account filter chips */}
                        {uniquePlatforms.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">Cuenta:</span>
                                <button
                                    onClick={() => { setProvPlatformFilter('all'); setProvSelected(new Set()); setProvCurrentPage(1); }}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        provPlatformFilter === 'all'
                                            ? 'bg-white/10 text-white ring-1 ring-white/30'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Todas
                                </button>
                                {uniquePlatforms.map(platform => {
                                    const count = accountsForPlatformFilter.filter(a => a.platform === platform).length;
                                    return (
                                        <button
                                            key={platform}
                                            onClick={() => { setProvPlatformFilter(platform); setProvSelected(new Set()); setProvCurrentPage(1); }}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                                provPlatformFilter === platform
                                                    ? 'bg-[#F97316] text-white'
                                                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {platform} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Table */}
                        <div className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-[40px_1fr_160px_110px_110px_80px] gap-2 px-4 py-3 text-xs font-medium text-muted-foreground border-b border-border bg-[#0d0d0d]">
                                <div className="flex items-center">
                                    <Checkbox
                                        checked={provSelected.size === filteredAccounts.length && filteredAccounts.length > 0}
                                        onCheckedChange={toggleAllProv}
                                    />
                                </div>
                                <div>Plataforma / Email</div>
                                <div>Proveedor</div>
                                <div>Vencimiento</div>
                                <div>Estado</div>
                                <div>USDT</div>
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

                                return (
                                    <div
                                        key={account.id}
                                        className={`grid grid-cols-[40px_1fr_160px_110px_110px_80px] gap-2 px-4 py-3 border-b border-border/50 items-center transition-colors ${provSelected.has(account.id) ? 'bg-[#86EFAC]/5' : 'hover:bg-[#1a1a1a]/50'
                                            }`}
                                    >
                                        <div>
                                            <Checkbox
                                                checked={provSelected.has(account.id)}
                                                onCheckedChange={() => toggleProv(account.id)}
                                            />
                                        </div>
                                        {/* Plataforma + Email */}
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground">{account.platform}</p>
                                            <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                                        </div>
                                        {/* Proveedor */}
                                        <div className="text-sm text-muted-foreground truncate">
                                            {account.supplier_name || <span className="text-muted-foreground/40 italic text-xs">Sin proveedor</span>}
                                        </div>
                                        {/* Vencimiento */}
                                        <div className="text-sm font-medium tabular-nums">
                                            {account.renewal_date
                                                ? formatDateES(new Date(account.renewal_date + 'T12:00:00'), { year: true })
                                                : '—'}
                                        </div>
                                        {/* Estado */}
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${badge.color}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                                {badge.label}
                                            </span>
                                        </div>
                                        {/* Costo USDT */}
                                        <div className="text-sm font-medium text-[#86EFAC]">
                                            {account.purchase_cost_usdt != null
                                                ? `$${Number(account.purchase_cost_usdt).toFixed(0)}`
                                                : '—'}
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
                                    {/* Stats Row — clickable filters */}
                    <div className="grid grid-cols-4 gap-3">
                        {/* TOTAL urgente */}
                        <button
                            onClick={() => { setClientFilter('all'); setClientSelected(new Set()); setClientCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                clientFilter === 'all'
                                    ? 'border-[#86EFAC] bg-[#86EFAC]/10 ring-1 ring-[#86EFAC]/50'
                                    : 'border-border bg-[#1a1a1a] hover:border-border/80'
                            }`}
                        >
                            <p className="text-xs text-muted-foreground">Total urgente</p>
                            <p className="text-2xl font-bold">{clientUrgentTotal}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">venc. + hoy + 3d</p>
                        </button>
                        {/* Vencidos */}
                        <button
                            onClick={() => { setClientFilter('expired'); setClientSelected(new Set()); setClientCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                clientFilter === 'expired'
                                    ? 'border-red-400 bg-red-500/15 ring-1 ring-red-400/50'
                                    : 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
                            }`}
                        >
                            <p className="text-xs text-red-400">🔴 Vencidas</p>
                            <p className="text-2xl font-bold text-red-400">{clientExpiredCount}</p>
                        </button>
                        {/* Vence Hoy */}
                        <button
                            onClick={() => { setClientFilter('today'); setClientSelected(new Set()); setClientCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                clientFilter === 'today'
                                    ? 'border-orange-400 bg-orange-500/15 ring-1 ring-orange-400/50'
                                    : 'border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50'
                            }`}
                        >
                            <p className="text-xs text-orange-400">🟠 Vence Hoy</p>
                            <p className="text-2xl font-bold text-orange-400">{clientTodayCount}</p>
                        </button>
                        {/* Próx. 3 días */}
                        <button
                            onClick={() => { setClientFilter('3days'); setClientSelected(new Set()); setClientCurrentPage(1); }}
                            className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                clientFilter === '3days'
                                    ? 'border-yellow-400 bg-yellow-500/15 ring-1 ring-yellow-400/50'
                                    : 'border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50'
                            }`}
                        >
                            <p className="text-xs text-yellow-400">🟡 Próx. 3 días</p>
                            <p className="text-2xl font-bold text-yellow-400">{clientThreeDayCount}</p>
                        </button>
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
                                        onClick={() => setShowBatchSendModal(true)}
                                        className="bg-[#818CF8] hover:bg-[#818CF8]/90 text-white gap-2"
                                    >
                                        <Send className="h-4 w-4" />
                                        Avisar ({clientSelected.size})
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

                        {/* Platform / account filter chips for clients */}
                        {uniqueClientPlatforms.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">Cuenta:</span>
                                <button
                                    onClick={() => { setClientPlatformFilter('all'); setClientSelected(new Set()); setClientCurrentPage(1); }}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        clientPlatformFilter === 'all'
                                            ? 'bg-white/10 text-white ring-1 ring-white/30'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Todas
                                </button>
                                {uniqueClientPlatforms.map(platform => {
                                    const count = clientSubsForPlatformFilter.filter((s: any) => s.slot?.mother_account?.platform === platform).length;
                                    return (
                                        <button
                                            key={platform}
                                            onClick={() => { setClientPlatformFilter(platform); setClientSelected(new Set()); setClientCurrentPage(1); }}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                                clientPlatformFilter === platform
                                                    ? 'bg-[#86EFAC] text-black'
                                                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {platform} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Table */}
                        <div className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden">
                            <div className="grid grid-cols-[40px_1fr_1fr_110px_120px_90px_110px_80px] gap-2 px-4 py-3 text-xs font-medium text-muted-foreground border-b border-border bg-[#0d0d0d]">
                                <div className="flex items-center">
                                    <Checkbox
                                        checked={clientSelected.size === paginatedSubs.length && paginatedSubs.length > 0}
                                        onCheckedChange={toggleAllClients}
                                    />
                                </div>
                                {([
                                    { col: 'customer' as const, label: 'Cliente' },
                                    { col: 'platform' as const, label: 'Plataforma / Perfil' },
                                    { col: 'expiry' as const, label: 'Vencimiento' },
                                    { col: 'status' as const, label: 'Estado' },
                                    { col: 'amount' as const, label: 'Monto' },
                                ] as { col: ClientSortCol; label: string }[]).map(({ col, label }) => (
                                    <button
                                        key={col}
                                        onClick={() => {
                                            if (clientSortCol === col) {
                                                setClientSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setClientSortCol(col);
                                                setClientSortDir('asc');
                                            }
                                            setClientCurrentPage(1);
                                        }}
                                        className={`flex items-center gap-1 text-left transition-colors hover:text-foreground ${
                                            clientSortCol === col ? 'text-[#86EFAC]' : ''
                                        }`}
                                    >
                                        {label}
                                        {clientSortCol === col ? (
                                            clientSortDir === 'asc'
                                                ? <ChevronUp className="h-3 w-3 flex-shrink-0" />
                                                : <ChevronDown className="h-3 w-3 flex-shrink-0" />
                                        ) : (
                                            <span className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-40"><ChevronUp className="h-3 w-3" /></span>
                                        )}
                                    </button>
                                ))}
                                <div>Aviso WA</div>
                                <div></div>
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
                                const isSending = sendingNotice.has(sub.id);

                                return (
                                    <div
                                        key={sub.id}
                                        className={`grid grid-cols-[40px_1fr_1fr_110px_120px_90px_110px_80px] gap-2 px-4 py-3 border-b border-border/50 items-center transition-colors ${clientSelected.has(sub.id) ? 'bg-[#86EFAC]/5' : 'hover:bg-[#1a1a1a]/50'
                                            }`}
                                    >
                                        <div>
                                            <Checkbox
                                                checked={clientSelected.has(sub.id)}
                                                onCheckedChange={() => toggleClient(sub.id)}
                                            />
                                        </div>
                                        {/* Cliente */}
                                        <div>
                                            <p className="font-medium text-foreground flex items-center gap-1.5">
                                                {customer?.full_name || 'N/A'}
                                                {customer?.customer_type === 'creador' && (
                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">🎬</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{customer?.phone || ''}</p>
                                        </div>
                                        {/* Plataforma + Perfil del cliente */}
                                        <div>
                                            <p className="text-sm font-medium">{account?.platform || 'N/A'}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {slot?.slot_identifier || account?.email || ''}
                                            </p>
                                        </div>
                                        {/* Vencimiento */}
                                        <div className="text-sm">
                                            {sub.expiryDate ? formatDateES(new Date(sub.expiryDate + 'T12:00:00')) : '—'}
                                        </div>
                                        {/* Estado */}
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                                {badge.label}
                                            </span>
                                        </div>
                                        {/* Monto */}
                                        <div className="text-sm font-medium">
                                            {sub.is_canje ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[11px] font-semibold">
                                                    🎬 Canje
                                                </span>
                                            ) : (
                                                <span className="text-[#86EFAC] font-semibold">
                                                    {sub.amount_gs ? `${(sub.amount_gs / 1000).toFixed(0)}k Gs` : '—'}
                                                </span>
                                            )}
                                        </div>
                                        {/* Aviso WhatsApp */}
                                        <div>
                                            {sub.lastNotified ? (
                                                <div
                                                    className="flex items-center gap-1 text-xs text-[#86EFAC] cursor-default"
                                                    title={`${sub.lastNotified.template === 'vencimiento_hoy' ? 'Aviso día de vencimiento' : 'Aviso previo'} · ${formatDateES(new Date(sub.lastNotified.sentAt), { time: true })}`}
                                                >
                                                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                                                    <span>
                                                        {formatDateES(new Date(sub.lastNotified.sentAt))}
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
                                        {/* Botón Enviar Aviso WA */}
                                        <div>
                                            <button
                                                onClick={() => handleSendNotice(sub.id)}
                                                disabled={isSending || !customer?.phone}
                                                title={!customer?.phone ? 'Sin teléfono registrado' : 'Enviar aviso por WhatsApp'}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all
                                                    bg-green-600/20 text-green-300 hover:bg-green-600/40 hover:text-green-200
                                                    disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {isSending
                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                    : <Send className="h-3 w-3" />
                                                }
                                                {isSending ? '...' : 'Enviar'}
                                            </button>
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

                        {/* Campo USDT con tipo de cambio de configuración */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[#F0B90B]/20 text-[#F0B90B]">USDT</span>
                                Costo en USDT
                                {usdtRate > 0 ? (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        1 USD = Gs. {usdtRate.toLocaleString('es-PY')}
                                    </span>
                                ) : (
                                    <span className="ml-auto text-xs text-yellow-400">
                                        ⚠️ Configurá el tipo de cambio en Ajustes
                                    </span>
                                )}
                            </Label>
                            <Input
                                type="number"
                                value={provUsdt}
                                onChange={e => handleUsdtChange(e.target.value)}
                                placeholder="Ej: 4.5"
                                step="0.01"
                                disabled={usdtRate <= 0}
                                className="border-[#F0B90B]/30 focus-visible:ring-[#F0B90B]/30"
                            />
                            {usdtRate <= 0 && (
                                <p className="text-xs text-yellow-400">Andá a ⚙️ Ajustes → Tipo de Cambio USDT para configurarlo primero.</p>
                            )}
                        </div>

                        {/* Gs (auto-filled from USDT or manual) */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                Costo Total de Renovación (Gs.)
                                {provUsdt && provCost && (
                                    <span className="ml-auto text-xs text-[#86EFAC]">↑ calculado automáticamente</span>
                                )}
                            </Label>
                            <Input
                                type="number"
                                value={provCost}
                                onChange={e => { setProvCost(e.target.value); setProvUsdt(''); }}
                                placeholder="Ej: 150000"
                            />
                        </div>

                        {/* Fecha de Renovación */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                📅 Fecha de Renovación
                                <span className="ml-auto text-xs text-muted-foreground">Inicio del período que estás pagando</span>
                            </Label>
                            <input
                                type="date"
                                value={provRenewalDate}
                                onChange={e => {
                                    const newDate = e.target.value;
                                    setProvRenewalDate(newDate);
                                    // Calcular días hasta fin de mes desde la nueva fecha
                                    if (newDate) {
                                        const d = new Date(newDate + 'T12:00:00');
                                        const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                                        const diff = Math.round((endOfMonth.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                        setProvDays(diff.toString());
                                    }
                                }}
                                className="w-full rounded-md border border-border bg-[#1a1a1a] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#F97316]/40"
                            />
                            {/* Botones rápidos de días del mes actual */}
                            {(() => {
                                const base = provRenewalDate ? new Date(provRenewalDate + 'T12:00:00') : new Date();
                                const year = base.getFullYear();
                                const month = base.getMonth();
                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                const endOfMonth = new Date(year, month + 1, 0);
                                const daysToEnd = Math.round((endOfMonth.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                const options = [
                                    { label: `Fin del mes (${daysToEnd}d)`, value: daysToEnd },
                                    { label: '30 días', value: 30 },
                                ];
                                // Si el mes tiene más días agrega opciones útiles
                                if (daysInMonth === 31) options.splice(1, 0, { label: '31 días', value: 31 });
                                return (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {options.map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setProvDays(opt.value.toString())}
                                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                                    provDays === opt.value.toString()
                                                        ? 'bg-[#F97316] text-white'
                                                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}
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

            {/* Batch Send WhatsApp Modal */}
            <BatchSendModal
                isOpen={showBatchSendModal}
                onClose={() => {
                    setShowBatchSendModal(false);
                    setClientSelected(new Set());
                    setMovedClientsForWA([]);
                }}
                clients={
                    movedClientsForWA.length > 0
                        ? movedClientsForWA
                        : enrichedSubs
                            .filter((s: any) => clientSelected.has(s.id))
                            .map((s: any) => ({
                                sale_id: s.id,
                                phone: s.customer?.phone || '',
                                customer_name: s.customer?.full_name || s.customer?.phone || '',
                                platform: s.slot?.mother_account?.platform || 'Plataforma',
                                end_date: s.expiryDate,
                                amount: s.amount_gs,
                                days: s.daysUntilExpiry,
                            }))
                }
            />

            {/* ── Modal: Posible Autopay ── */}
            <Dialog open={showAutopayModal} onOpenChange={(o) => !o && setShowAutopayModal(false)}>
                <DialogContent className="sm:max-w-[420px] bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            💳 Marcar como Posible Autopay
                        </DialogTitle>
                        <DialogDescription>
                            Se marcará {provSelected.size} cuenta(s) como <strong>Posible Autopay</strong>.
                            Se activará <code>is_autopay = true</code> y desaparecerán de la lista de renovaciones.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-300">
                        ℹ️ Estas cuentas serán excluidas del flujo normal de renovación. Podés revertirlo cambiando el estado en el Inventario.
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowAutopayModal(false)} disabled={autopayLoading}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmAutopay}
                            disabled={autopayLoading || isPending}
                            className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                        >
                            {autopayLoading || isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal: No Renovar ── */}
            <Dialog open={showNoRenovarModal} onOpenChange={(o) => { if (!o) { setShowNoRenovarModal(false); setNoRenovarData(null); } }}>
                <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            🚫 No Renovar
                        </DialogTitle>
                        <DialogDescription>
                            {noRenovarData?.activeClients.length === 0
                                ? `Las ${provSelected.size} cuenta(s) serán marcadas como No Renovar. No tienen clientes activos.`
                                : `Se detectaron ${noRenovarData?.activeClients.length} cliente(s) activo(s) en estas cuentas.`
                            }
                        </DialogDescription>
                    </DialogHeader>

                    {noRenovarData && noRenovarData.activeClients.length > 0 && (
                        <div className="space-y-3">
                            {/* Lista de clientes afectados */}
                            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                                <p className="text-xs font-semibold text-red-400 mb-2">Clientes con suscripción activa:</p>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {noRenovarData.activeClients.map((c) => (
                                        <div key={c.saleId} className="flex items-center justify-between text-xs">
                                            <span className="font-medium text-foreground">{c.customer?.full_name || 'N/A'}</span>
                                            <span className="text-muted-foreground">{c.platform} · {c.slotIdentifier}</span>
                                            <span className="text-muted-foreground">{c.endDate}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Opciones */}
                            {noRenovarData.canAutoMove ? (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                                    <p className="text-emerald-300 font-semibold mb-1">✅ Hay {noRenovarData.availableDestinations.length} slot(s) disponibles para reubicar</p>
                                    <p className="text-xs text-muted-foreground">Los clientes serán movidos automáticamente a slots libres de la misma plataforma.</p>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                                    <p className="text-yellow-300 font-semibold mb-1">⚠️ No hay suficientes slots disponibles</p>
                                    <p className="text-xs text-muted-foreground">
                                        Hay {noRenovarData.availableDestinations.length} slot(s) disponibles pero {noRenovarData.activeClients.length} clientes activos.
                                        Podés marcar igual como No Renovar (los clientes quedarán en sus slots hasta que venzan).
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {noRenovarData?.activeClients.length === 0 && (
                        <div className="rounded-lg bg-[#1a1a1a] border border-border p-3 text-sm text-muted-foreground">
                            Estas cuentas no tienen clientes activos. Se marcarán como No Renovar sin impacto.
                        </div>
                    )}

                    <DialogFooter className="gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => { setShowNoRenovarModal(false); setNoRenovarData(null); }} disabled={isPending}>
                            Cancelar
                        </Button>
                        {noRenovarData?.activeClients && noRenovarData.activeClients.length > 0 && noRenovarData.canAutoMove && (
                            <Button
                                onClick={() => handleConfirmNoRenovar(true)}
                                disabled={isPending}
                                className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                            >
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Mover clientes y No Renovar
                            </Button>
                        )}
                        <Button
                            onClick={() => handleConfirmNoRenovar(false)}
                            disabled={isPending}
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {noRenovarData?.activeClients.length === 0 ? 'Confirmar No Renovar' : 'No Renovar sin mover'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
