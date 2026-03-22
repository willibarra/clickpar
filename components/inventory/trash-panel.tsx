'use client';

import { useState, useTransition, useMemo } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Search, ChevronDown, ChevronUp, Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { restoreMotherAccount, permanentlyDeleteMotherAccount } from '@/lib/actions/inventory';

interface TrashedAccount {
    id: string;
    platform: string;
    email: string;
    password: string;
    max_slots: number;
    renewal_date: string;
    status: string;
    deleted_at: string;
    supplier_name?: string | null;
    notes?: string | null;
    sale_type?: string | null;
    purchase_cost_gs?: number | null;
    purchase_cost_usdt?: number | null;
}

interface TrashPanelProps {
    accounts: TrashedAccount[];
}

function CopyField({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            onClick={handleCopy}
            className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer max-w-full"
            title={`Copiar ${label || value}`}
        >
            <span className="truncate">{value}</span>
            {copied ? (
                <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
            ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
            )}
        </button>
    );
}

function formatDeletedAt(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PY', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function daysSince(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-150">
            <span className="text-xs text-red-400 font-medium">¿Eliminar para siempre?</span>
            <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-xs"
                onClick={onConfirm}
            >
                Sí, borrar
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onCancel}
            >
                <X className="h-3 w-3" />
            </Button>
        </div>
    );
}

function TrashRow({ account }: { account: TrashedAccount }) {
    const [isPending, startTransition] = useTransition();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const days = daysSince(account.deleted_at);

    function handleRestore() {
        startTransition(async () => {
            const result = await restoreMotherAccount(account.id);
            if ('error' in result) {
                setActionMsg({ type: 'error', text: result.error });
            } else {
                setActionMsg({ type: 'success', text: 'Cuenta restaurada ✓' });
            }
        });
    }

    function handlePermanentDelete() {
        startTransition(async () => {
            const result = await permanentlyDeleteMotherAccount(account.id);
            if ('error' in result) {
                setActionMsg({ type: 'error', text: result.error });
                setConfirmingDelete(false);
            }
        });
    }

    if (actionMsg?.type === 'success') return null; // Row fades out on success

    return (
        <tr className="bg-card hover:bg-red-950/10 transition-colors border-b border-border/50 last:border-0">
            {/* Platform icon */}
            <td className="px-4 py-3 w-12">
                <div className="opacity-60">
                    <PlatformIcon platform={account.platform} size={28} />
                </div>
            </td>

            {/* Platform + email */}
            <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-muted-foreground">{account.platform}</span>
                    <CopyField value={account.email} label="email" />
                </div>
            </td>

            {/* Password */}
            <td className="px-4 py-3">
                <CopyField value={account.password} label="contraseña" />
            </td>

            {/* Supplier */}
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {account.supplier_name || <span className="text-muted-foreground/40">—</span>}
            </td>

            {/* Max slots */}
            <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                {account.max_slots}
            </td>

            {/* Deleted at */}
            <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-red-400/80">{formatDeletedAt(account.deleted_at)}</span>
                    <span className="text-xs text-muted-foreground/60">
                        {days === 0 ? 'hoy' : `hace ${days} día${days !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </td>

            {/* Notes */}
            <td className="px-4 py-3 max-w-[150px]">
                {account.notes ? (
                    <span className="text-xs text-amber-400/70 truncate block" title={account.notes}>
                        {account.notes}
                    </span>
                ) : <span className="text-muted-foreground/30 text-xs">—</span>}
            </td>

            {/* Actions */}
            <td className="px-4 py-3 text-right">
                {actionMsg?.type === 'error' && (
                    <span className="text-xs text-red-400 mr-2">{actionMsg.text}</span>
                )}
                {confirmingDelete ? (
                    <ConfirmDelete
                        onConfirm={handlePermanentDelete}
                        onCancel={() => setConfirmingDelete(false)}
                    />
                ) : (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={handleRestore}
                            className="h-7 px-2 text-xs border-[#86EFAC]/30 text-[#86EFAC] hover:bg-[#86EFAC]/10 gap-1"
                            title="Restaurar al inventario"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Restaurar
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => setConfirmingDelete(true)}
                            className="h-7 px-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                            title="Eliminar permanentemente"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </td>
        </tr>
    );
}

export function TrashPanel({ accounts }: TrashPanelProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [platformFilter, setPlatformFilter] = useState('all');

    const platforms = useMemo(() => {
        const set = new Set(accounts.map(a => a.platform));
        return Array.from(set).sort();
    }, [accounts]);

    const filtered = useMemo(() => {
        let result = accounts;
        if (platformFilter !== 'all') result = result.filter(a => a.platform === platformFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(a =>
                a.platform.toLowerCase().includes(q) ||
                a.email.toLowerCase().includes(q) ||
                (a.supplier_name || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [accounts, search, platformFilter]);

    if (accounts.length === 0) return null;

    return (
        <div className="mt-8 rounded-xl border border-red-500/20 bg-red-950/5 overflow-hidden">
            {/* Header — clickable to expand/collapse */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-500/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                        <Trash2 className="h-4 w-4 text-red-400" />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-red-300">Papelera</span>
                            <span className="inline-flex items-center justify-center rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400">
                                {accounts.length}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Cuentas eliminadas · Los datos están preservados
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-amber-400/60" />
                    <span className="text-xs text-muted-foreground mr-1">
                        {open ? 'Ocultar' : 'Ver cuentas eliminadas'}
                    </span>
                    {open
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />
                    }
                </div>
            </button>

            {/* Expandable content */}
            {open && (
                <div className="border-t border-red-500/10">
                    {/* Filters */}
                    <div className="px-5 py-3 flex flex-wrap items-center gap-3 bg-red-950/10">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-8 h-8 w-48 bg-card border-border text-sm"
                            />
                        </div>

                        {/* Platform filter pills */}
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                onClick={() => setPlatformFilter('all')}
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                    platformFilter === 'all'
                                        ? 'bg-red-500/30 text-red-300'
                                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Todas
                            </button>
                            {platforms.map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPlatformFilter(p)}
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                        platformFilter === p
                                            ? 'bg-red-500/30 text-red-300'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {p} ({accounts.filter(a => a.platform === p).length})
                                </button>
                            ))}
                        </div>

                        <span className="ml-auto text-xs text-muted-foreground">
                            {filtered.length} cuenta{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-card/60">
                                <tr>
                                    <th className="px-4 py-2 w-12" />
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                                        Plataforma / Email
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                                        Contraseña
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                                        Proveedor
                                    </th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                                        Slots
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                                        Eliminada
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                                        Notas
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length > 0 ? (
                                    filtered.map(account => (
                                        <TrashRow key={account.id} account={account} />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                            No se encontraron cuentas eliminadas
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer warning */}
                    <div className="px-5 py-3 bg-amber-500/5 border-t border-amber-500/10 flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                            <span className="text-amber-400 font-medium">Advertencia:</span> Eliminar permanentemente
                            borra la cuenta y todos sus slots de forma irreversible.
                            Restaurar la devuelve al inventario activo con todos sus datos intactos.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
