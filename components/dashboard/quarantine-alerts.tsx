'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, ChevronDown, ChevronUp, Loader2, Check, UserCircle } from 'lucide-react';
import { reactivateAccount } from '@/lib/actions/inventory';
import { useRouter } from 'next/navigation';

interface QuarantinedSlot {
    id: string;
    slot_identifier: string | null;
    status: string;
    customer_name?: string | null;
    customer_phone?: string | null;
}

interface QuarantinedAccount {
    id: string;
    platform: string;
    email: string;
    quarantined_at: string | null;
    slots: QuarantinedSlot[];
}

const platformColors: Record<string, string> = {
    Netflix: '#E50914',
    Spotify: '#1DB954',
    HBO: '#5c16c5',
    'HBO Max': '#5c16c5',
    'Disney+': '#0063e5',
    'Amazon Prime': '#00a8e1',
    'YouTube Premium': '#ff0000',
    'Apple TV+': '#555',
    Crunchyroll: '#F47521',
    'Paramount+': '#0064FF',
    'Star+': '#C724B1',
    Tidal: '#000',
};

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysAgo(dateStr: string | null): string {
    if (!dateStr) return '';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'hace 1 día';
    return `hace ${diff} días`;
}

function AccountRow({ account, onReactivated }: { account: QuarantinedAccount; onReactivated: () => void }) {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const color = platformColors[account.platform] || '#EAB308';
    const soldSlots = account.slots.filter(s => s.status === 'sold');
    const freeSlots = account.slots.filter(s => s.status !== 'sold');

    const handleReactivate = async () => {
        setLoading(true);
        setError('');
        const result = await reactivateAccount(account.id);
        if (result.error) {
            setError(result.error);
        } else {
            setDone(true);
            setTimeout(() => {
                onReactivated();
            }, 800);
        }
        setLoading(false);
    };

    const handleSearch = () => {
        router.push(`/?q=${encodeURIComponent(account.email)}`);
    };

    if (done) {
        return (
            <div className="flex items-center gap-3 rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/5 px-4 py-3">
                <Check className="h-4 w-4 text-[#86EFAC]" />
                <span className="text-sm font-medium text-[#86EFAC]">
                    {account.platform} — Cuenta reactivada
                </span>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-yellow-500/20 bg-[#111] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{account.platform}</span>
                        <Badge variant="outline" className="text-[9px] border-yellow-500/40 text-yellow-500 px-1 py-0">
                            <Shield className="h-2.5 w-2.5 mr-0.5 inline" />Cuarentena
                        </Badge>
                    </div>
                    <button
                        onClick={handleSearch}
                        className="text-xs text-muted-foreground truncate block hover:text-[#818CF8] transition-colors cursor-pointer"
                        title="Buscar esta cuenta"
                    >
                        {account.email}
                    </button>
                </div>

                {/* Slots summary */}
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    {soldSlots.length > 0 && (
                        <span className="flex items-center gap-1">
                            <UserCircle className="h-3 w-3 text-[#F97316]" />
                            <span className="text-[#F97316]">{soldSlots.length} vendido{soldSlots.length > 1 ? 's' : ''}</span>
                        </span>
                    )}
                    {freeSlots.length > 0 && (
                        <span className="text-muted-foreground">{freeSlots.length} libre{freeSlots.length > 1 ? 's' : ''}</span>
                    )}
                </div>

                {/* Quarantine date */}
                <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-yellow-500/70 block">{daysAgo(account.quarantined_at)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(account.quarantined_at)}</span>
                </div>

                {/* Reactivate button */}
                <button
                    onClick={handleReactivate}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-md bg-[#86EFAC]/10 px-3 py-1.5 text-xs font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                    Reactivar
                </button>
            </div>

            {/* Sold slots with customer names */}
            {soldSlots.length > 0 && (
                <div className="border-t border-border/20 px-4 py-2 bg-[#0d0d0d]">
                    <div className="flex flex-wrap gap-2">
                        {soldSlots.map(slot => (
                            <span key={slot.id} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-[#1a1a1a] rounded-md px-2 py-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                                {slot.slot_identifier || 'Perfil'}
                                {slot.customer_name && <span className="text-foreground/70">· {slot.customer_name}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-500 px-4 py-1 bg-[#0d0d0d]">{error}</p>}
        </div>
    );
}

export function QuarantineAlerts({ accounts }: { accounts: QuarantinedAccount[] }) {
    const [expanded, setExpanded] = useState(true);
    const [localAccounts, setLocalAccounts] = useState(accounts);
    const router = useRouter();

    if (localAccounts.length === 0) return null;

    const handleReactivated = (accountId: string) => {
        setLocalAccounts(prev => prev.filter(a => a.id !== accountId));
        router.refresh();
    };

    return (
        <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-[#1a1a1a]">
            <CardContent className="p-0">
                {/* Header */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center justify-between w-full px-5 py-4 hover:bg-yellow-500/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-yellow-500/20 p-2.5">
                            <Shield className="h-5 w-5 text-yellow-500" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm text-muted-foreground">Cuentas en Cuarentena</p>
                            <p className="text-2xl font-bold text-foreground">{localAccounts.length}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500 bg-yellow-500/5">
                            No vendibles
                        </Badge>
                        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                </button>

                {/* Account list */}
                {expanded && (
                    <div className="px-5 pb-4 space-y-2">
                        {localAccounts.map(account => (
                            <AccountRow
                                key={account.id}
                                account={account}
                                onReactivated={() => handleReactivated(account.id)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
