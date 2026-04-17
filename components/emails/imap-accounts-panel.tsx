'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, Trash2, Wifi, Loader2, CheckCircle2, XCircle, Edit2, Save, X, Eye, EyeOff, RefreshCw, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

interface ImapAccount {
    id: string;
    email: string;
    label: string;
    platform: string | null;
    supplier_name: string | null;
    subject_filters: string[];
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
    subject_filters: [] as string[],
};

export function ImapAccountsPanel() {
    const [accounts, setAccounts] = useState<ImapAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [newSubject, setNewSubject] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testingNew, setTestingNew] = useState(false);
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
                toast.success(`✅ Conexión OK`);
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
        if (form.subject_filters.length === 0 && !newSubject) {
            toast.error('Agregá al menos un asunto para buscar correos');
            return;
        }

        const subjects = [...form.subject_filters];
        if (newSubject) subjects.push(newSubject);

        setSaving(true);
        try {
            const res = await fetch('/api/admin/imap-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, subject_filters: subjects }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            toast.success('Cuenta configurada');
            setForm(EMPTY_FORM);
            setNewSubject('');
            setShowForm(false);
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

    const addSubject = () => {
        if (newSubject.trim()) {
            setForm(f => ({ ...f, subject_filters: [...f.subject_filters, newSubject.trim()] }));
            setNewSubject('');
        }
    };

    const removeSubject = (idx: number) => {
        setForm(f => ({ ...f, subject_filters: f.subject_filters.filter((_, i) => i !== idx) }));
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Mail className="h-5 w-5 text-blue-400" /> Cuentas Lectoras (IMAP)
                    </CardTitle>
                    <CardDescription>
                        Correos Hotmail/Outlook de donde el sistema extrae automáticamente los códigos de verificación
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadAccounts}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setShowForm(!showForm)}>
                        <Plus className="h-4 w-4 mr-1" /> Configurar Cuenta
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                
                {/* Formulario Nueva Cuenta */}
                {showForm && (
                    <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Correo de Microsoft (Outlook/Hotmail) *</label>
                                <Input
                                    placeholder="ej: andrewanna7226@hotmail.com"
                                    value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">
                                    Contraseña de Aplicación * <span className="text-yellow-400 opacity-80">(16 letras juntas)</span>
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="ej: porjcwecqcmbitvw"
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

                            <div className="md:col-span-2">
                                <label className="text-xs text-muted-foreground mb-1 block">Títulos de Correos a buscar *</label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        placeholder="ej: Netflix: Tu código de inicio de sesión"
                                        value={newSubject}
                                        onChange={e => setNewSubject(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addSubject()}
                                    />
                                    <Button type="button" variant="secondary" onClick={addSubject}>Agregar</Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {form.subject_filters.map((sub, idx) => (
                                        <Badge key={idx} variant="outline" className="flex items-center gap-1 bg-background">
                                            {sub}
                                            <XIcon className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => removeSubject(idx)} />
                                        </Badge>
                                    ))}
                                    {form.subject_filters.length === 0 && !newSubject && (
                                        <span className="text-xs text-muted-foreground">No hay títulos configurados</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border/50">
                            <Button variant="outline" onClick={() => handleTest()} disabled={testingNew}>
                                {testingNew ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
                                Probar Conexión
                            </Button>
                            <Button onClick={handleCreate} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Guardar Cuenta
                            </Button>
                            <Button variant="ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setNewSubject(''); }}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Lista de cuentas */}
                {accounts.length === 0 && !showForm ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                        <p>No hay correos configurados para extraer códigos.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {accounts.map(account => (
                            <div key={account.id} className="border border-border rounded-lg p-3 bg-card flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2 font-medium">
                                            <div className={`h-2 w-2 rounded-full ${account.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                                            {account.email}
                                        </div>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleTest(account.id)} disabled={testingId === account.id}>
                                                {testingId === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3 text-muted-foreground" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300" onClick={() => handleDelete(account.id)} disabled={deletingId === account.id}>
                                                {deletingId === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-1 mb-3">
                                        <p className="text-xs text-muted-foreground">Busca correos con títulos:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {account.subject_filters && account.subject_filters.length > 0 ? (
                                                account.subject_filters.map((s, i) => <Badge key={i} variant="secondary" className="text-[10px] py-0">{s}</Badge>)
                                            ) : (
                                                <span className="text-xs text-red-400">Sin títulos</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] flex justify-between border-t border-border pt-2">
                                    {account.last_checked_at ? (
                                        <span className="text-muted-foreground">Últ. vez: {new Date(account.last_checked_at).toLocaleString('es-PY')}</span>
                                    ) : (
                                        <span className="text-muted-foreground">Nunca revisado</span>
                                    )}
                                    {account.last_error && <span className="text-red-400 max-w-[150px] truncate" title={account.last_error}>Error</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
