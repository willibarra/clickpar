'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, Trash2, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Edit2, Save, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ImapAccount {
    id: string;
    email: string;
    label: string;
    platform: string | null;
    supplier_name: string | null;
    subject_filter: string | null;
    sender_filter: string | null;
    lookback_minutes: number;
    imap_host: string;
    imap_port: number;
    is_active: boolean;
    last_checked_at: string | null;
    last_error: string | null;
    created_at: string;
}

const EMPTY_FORM = {
    email: '',
    password: '',
    label: '',
    platform: '',
    supplier_name: '',
    subject_filter: '',
    sender_filter: '',
    lookback_minutes: 15,
};

export function ImapAccountsPanel() {
    const [accounts, setAccounts] = useState<ImapAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testingNew, setTestingNew] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<typeof EMPTY_FORM>>({});
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/imap-accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch {
            toast.error('Error al cargar cuentas IMAP');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const handleTest = async (accountId?: string) => {
        if (accountId) {
            setTestingId(accountId);
        } else {
            // Test from form
            if (!form.email || !form.password) {
                toast.error('Ingresá email y App Password primero');
                return;
            }
            setTestingNew(true);
        }
        
        try {
            const body = accountId
                ? { action: 'test', email: accounts.find(a => a.id === accountId)?.email }
                : { action: 'test', email: form.email, password: form.password };
            
            const res = await fetch('/api/admin/imap-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            
            if (data.success) {
                toast.success(`✅ Conexión OK — ${data.messageCount ?? '?'} mensajes en INBOX`);
            } else {
                toast.error(`❌ Error: ${data.error}`);
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setTestingId(null);
            setTestingNew(false);
        }
    };

    const handleCreate = async () => {
        if (!form.email || !form.password) {
            toast.error('Email y App Password son requeridos');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/imap-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            toast.success('Cuenta IMAP agregada');
            setForm(EMPTY_FORM);
            setShowForm(false);
            loadAccounts();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/imap-accounts?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            toast.success('Cuenta actualizada');
            setEditingId(null);
            loadAccounts();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/admin/imap-accounts?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            toast.success('Cuenta eliminada');
            loadAccounts();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    const startEdit = (account: ImapAccount) => {
        setEditingId(account.id);
        setEditForm({
            label: account.label,
            platform: account.platform || '',
            supplier_name: account.supplier_name || '',
            subject_filter: account.subject_filter || '',
            sender_filter: account.sender_filter || '',
            lookback_minutes: account.lookback_minutes,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} configurada{accounts.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadAccounts}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setShowForm(!showForm)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Nueva cuenta
                    </Button>
                </div>
            </div>

            {/* New account form */}
            {showForm && (
                <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
                    <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                        <Mail className="h-4 w-4 text-blue-400" />
                        Agregar cuenta Hotmail / Outlook / iCloud
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
                            <Input
                                placeholder="cuenta@hotmail.com o cuenta@icloud.com"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">App Password * <span className="text-yellow-400">(NO la contraseña normal)</span></label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="xxxx xxxx xxxx xxxx"
                                    value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Etiqueta (opcional)</label>
                            <Input
                                placeholder="ej: iCloud Netflix Principal"
                                value={form.label}
                                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Plataforma</label>
                            <Input
                                placeholder="ej: Disney+"
                                value={form.platform}
                                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Asunto del correo (filtro) *</label>
                            <Input
                                placeholder="ej: código de acceso temporal"
                                value={form.subject_filter}
                                onChange={e => setForm(f => ({ ...f, subject_filter: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Remitente (filtro opcional)</label>
                            <Input
                                placeholder="ej: noreply@disneyplus.com"
                                value={form.sender_filter}
                                onChange={e => setForm(f => ({ ...f, sender_filter: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Proveedor</label>
                            <Input
                                placeholder="ej: IMPERIO MILLONARIO"
                                value={form.supplier_name}
                                onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Buscar en últimos (minutos)</label>
                            <Input
                                type="number"
                                min={1}
                                max={60}
                                value={form.lookback_minutes}
                                onChange={e => setForm(f => ({ ...f, lookback_minutes: parseInt(e.target.value) || 15 }))}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTest()}
                            disabled={testingNew}
                        >
                            {testingNew ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wifi className="h-4 w-4 mr-1" />}
                            Probar conexión
                        </Button>
                        <Button size="sm" onClick={handleCreate} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                            Guardar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                            <X className="h-4 w-4 mr-1" />
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}

            {/* Accounts list */}
            {accounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No hay cuentas IMAP configuradas.</p>
                    <p className="text-xs mt-1">Agregá una cuenta Hotmail o iCloud con su App Password.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {accounts.map(account => (
                        <div
                            key={account.id}
                            className="border border-border rounded-lg bg-card overflow-hidden"
                        >
                            {/* Account header */}
                            <div className="flex items-start justify-between p-3 gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${account.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm text-foreground truncate">{account.email}</span>
                                            {account.label && account.label !== account.email && (
                                                <span className="text-xs text-muted-foreground">({account.label})</span>
                                            )}
                                            {account.platform && (
                                                <Badge variant="outline" className="text-xs px-1.5 py-0">{account.platform}</Badge>
                                            )}
                                        </div>
                                        {account.subject_filter && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Asunto: <span className="text-blue-400">"{account.subject_filter}"</span>
                                                {account.sender_filter && <> · De: <span className="text-blue-400">{account.sender_filter}</span></>}
                                                {' '}· últimos {account.lookback_minutes} min
                                            </p>
                                        )}
                                        {account.last_error && (
                                            <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                                                <XCircle className="h-3 w-3" /> {account.last_error}
                                            </p>
                                        )}
                                        {account.last_checked_at && !account.last_error && (
                                            <p className="text-xs text-green-400 mt-0.5 flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Revisado: {new Date(account.last_checked_at).toLocaleString('es-PY')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleTest(account.id)}
                                        disabled={testingId === account.id}
                                    >
                                        {testingId === account.id
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <Wifi className="h-3 w-3" />
                                        }
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => editingId === account.id ? setEditingId(null) : startEdit(account)}
                                    >
                                        {editingId === account.id ? <X className="h-3 w-3" /> : <Edit2 className="h-3 w-3" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                                        onClick={() => handleDelete(account.id)}
                                        disabled={deletingId === account.id}
                                    >
                                        {deletingId === account.id
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <Trash2 className="h-3 w-3" />
                                        }
                                    </Button>
                                </div>
                            </div>

                            {/* Edit form */}
                            {editingId === account.id && (
                                <div className="border-t border-border p-3 bg-muted/10 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Etiqueta</label>
                                            <Input
                                                placeholder="Nombre descriptivo"
                                                value={editForm.label || ''}
                                                onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Plataforma</label>
                                            <Input
                                                placeholder="ej: Disney+"
                                                value={editForm.platform || ''}
                                                onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Asunto del correo</label>
                                            <Input
                                                placeholder="ej: código de acceso temporal"
                                                value={editForm.subject_filter || ''}
                                                onChange={e => setEditForm(f => ({ ...f, subject_filter: e.target.value }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Remitente (filtro)</label>
                                            <Input
                                                placeholder="ej: noreply@disneyplus.com"
                                                value={editForm.sender_filter || ''}
                                                onChange={e => setEditForm(f => ({ ...f, sender_filter: e.target.value }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Proveedor</label>
                                            <Input
                                                placeholder="ej: IMPERIO MILLONARIO"
                                                value={editForm.supplier_name || ''}
                                                onChange={e => setEditForm(f => ({ ...f, supplier_name: e.target.value }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">Minutos hacia atrás</label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={editForm.lookback_minutes || 15}
                                                onChange={e => setEditForm(f => ({ ...f, lookback_minutes: parseInt(e.target.value) || 15 }))}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => handleUpdate(account.id)} disabled={saving}>
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                                        Guardar cambios
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Help note */}
            <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 p-3 text-xs text-blue-300 space-y-2">
                <div>
                    <p className="font-medium">📧 Microsoft (Hotmail/Outlook)</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-400/80 mt-1">
                        <li>Ir a <span className="text-blue-300">account.microsoft.com</span> → Seguridad</li>
                        <li>Buscar "Contraseñas de aplicación" o "App passwords"</li>
                        <li>Crear nueva → copiar los 16 caracteres generados</li>
                    </ol>
                    <p className="text-yellow-400/70 pt-1">⚠️ Microsoft depreca App Passwords el 30/04/2026. Recomendamos migrar a iCloud.</p>
                </div>
                <div className="border-t border-blue-800/30 pt-2">
                    <p className="font-medium"> iCloud Mail</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-400/80 mt-1">
                        <li>Ir a <span className="text-blue-300">account.apple.com</span> → Inicio de sesión y seguridad</li>
                        <li>Buscar "Contraseñas de apps" o "App-Specific Passwords"</li>
                        <li>Generar nueva → copiar la contraseña generada</li>
                    </ol>
                    <p className="text-green-400/70 pt-1">✅ iCloud soporta hasta 25 App Passwords sin fecha de deprecación.</p>
                </div>
            </div>
        </div>
    );
}
