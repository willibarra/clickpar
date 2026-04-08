'use client';

import { useState, useEffect } from 'react';
import {
    Plus, Trash2, Loader2, Check, X, Mail, Server,
    Eye, EyeOff, ToggleLeft, ToggleRight, Zap, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ImapAccount {
    id: string;
    email: string;
    password: string;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    label: string;
    is_active: boolean;
    last_checked_at: string | null;
    last_error: string | null;
    created_at: string;
}

export function ImapAccountsPanel() {
    const [accounts, setAccounts] = useState<ImapAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);

    // New account form
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newHost, setNewHost] = useState('');
    const [newPort, setNewPort] = useState(993);
    const [newSecure, setNewSecure] = useState(true);
    const [newLabel, setNewLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/imap-accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleAdd = async () => {
        if (!newEmail || !newPassword) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch('/api/admin/imap-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: newEmail,
                    password: newPassword,
                    imap_host: newHost || undefined,
                    imap_port: newPort,
                    imap_secure: newSecure,
                    label: newLabel || newEmail,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setNewEmail(''); setNewPassword(''); setNewHost(''); setNewLabel('');
                setShowAdd(false);
                await load();
            } else {
                setSaveError(data.error);
            }
        } catch {
            setSaveError('Error de conexión');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta cuenta IMAP?')) return;
        await fetch(`/api/admin/imap-accounts?id=${id}`, { method: 'DELETE' });
        await load();
    };

    const handleToggle = async (id: string, isActive: boolean) => {
        await fetch(`/api/admin/imap-accounts?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !isActive }),
        });
        await load();
    };

    const handleTest = async (id: string) => {
        const btn = document.getElementById(`test-${id}`);
        if (btn) btn.textContent = '⏳';
        try {
            const res = await fetch('/api/admin/imap-accounts/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: id }),
            });
            const data = await res.json();
            if (btn) {
                btn.textContent = data.connectionOk ? '✅ OK' : '❌ Fallo';
                setTimeout(() => { if (btn) btn.textContent = 'Test'; }, 3000);
            }
            await load(); // Refresh to show last_error
        } catch {
            if (btn) { btn.textContent = '❌'; setTimeout(() => { if (btn) btn.textContent = 'Test'; }, 3000); }
        }
    };

    return (
        <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Mail className="h-4 w-4 text-[#86EFAC]" />
                        Cuentas IMAP (Correos)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Correos de Hotmail, Outlook o cPanel para buscar códigos automáticamente
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={() => setShowAdd(!showAdd)}
                    className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Agregar
                </Button>
            </div>

            {/* Add form */}
            {showAdd && (
                <div className="rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/5 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Correo</label>
                            <Input
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="cuenta@hotmail.com"
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                Host IMAP <span className="text-muted-foreground/50">(auto)</span>
                            </label>
                            <Input
                                value={newHost}
                                onChange={(e) => setNewHost(e.target.value)}
                                placeholder="outlook.office365.com"
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Puerto</label>
                            <Input
                                type="number"
                                value={newPort}
                                onChange={(e) => setNewPort(Number(e.target.value))}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Etiqueta</label>
                            <Input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="Hotmail Principal"
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>

                    {saveError && (
                        <div className="flex items-center gap-2 text-xs text-red-400">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {saveError}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAdd(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAdd}
                            disabled={saving || !newEmail || !newPassword}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                        >
                            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                            {saving ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Account list */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#86EFAC]" />
                </div>
            ) : accounts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                    No hay cuentas IMAP registradas
                </div>
            ) : (
                <div className="space-y-2">
                    {accounts.map((acct) => (
                        <ImapAccountRow
                            key={acct.id}
                            account={acct}
                            onDelete={handleDelete}
                            onToggle={handleToggle}
                            onTest={handleTest}
                        />
                    ))}
                    <p className="text-xs text-muted-foreground text-right pt-1">
                        {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} IMAP
                    </p>
                </div>
            )}
        </div>
    );
}

function ImapAccountRow({
    account,
    onDelete,
    onToggle,
    onTest,
}: {
    account: ImapAccount;
    onDelete: (id: string) => void;
    onToggle: (id: string, isActive: boolean) => void;
    onTest: (id: string) => void;
}) {
    const [showPass, setShowPass] = useState(false);

    return (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 gap-3 transition-colors ${
            account.is_active ? 'border-border/40 bg-muted/10' : 'border-border/20 bg-muted/5 opacity-60'
        }`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-foreground text-sm truncate">{account.email}</span>
                    {account.label && account.label !== account.email && (
                        <span className="text-xs text-muted-foreground">({account.label})</span>
                    )}
                    {!account.is_active && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
                            Inactiva
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <Server className="h-3 w-3" />
                    <span>{account.imap_host}:{account.imap_port}</span>
                    {account.last_checked_at && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>Último check: {new Date(account.last_checked_at).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </>
                    )}
                    {account.last_error && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-red-400 truncate max-w-[200px]">{account.last_error}</span>
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Test button */}
                <button
                    id={`test-${account.id}`}
                    onClick={() => onTest(account.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-[#86EFAC] hover:bg-[#86EFAC]/10 transition-colors"
                    title="Test IMAP"
                >
                    Test
                </button>
                {/* Toggle active */}
                <button
                    onClick={() => onToggle(account.id, account.is_active)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-[#86EFAC] hover:bg-[#86EFAC]/10 transition-colors"
                    title={account.is_active ? 'Desactivar' : 'Activar'}
                >
                    {account.is_active
                        ? <ToggleRight className="h-4 w-4 text-[#86EFAC]" />
                        : <ToggleLeft className="h-4 w-4" />
                    }
                </button>
                {/* Delete */}
                <button
                    onClick={() => onDelete(account.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Eliminar"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
