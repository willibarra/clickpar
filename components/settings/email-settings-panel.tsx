'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Plus, Trash2, Save, Loader2, Eye, EyeOff, Globe, Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface OwnedEmail {
    id: string;
    email: string;
    password: string | null;
    provider: string;
    email_type: string;
    redirect_to: string | null;
    domain: string | null;
}

export function EmailSettingsPanel() {
    const supabase = createClient();
    const [emails, setEmails] = useState<OwnedEmail[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // New email form
    const [showAdd, setShowAdd] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newType, setNewType] = useState<'cpanel' | 'gmail' | 'hotmail'>('cpanel');
    const [newRedirect, setNewRedirect] = useState('');
    const [adding, setAdding] = useState(false);
    const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => { fetchEmails(); }, []);

    async function fetchEmails() {
        const { data } = await (supabase.from('owned_emails') as any)
            .select('id, email, password, provider, email_type, redirect_to, domain')
            .order('email');
        setEmails(data || []);
        setLoading(false);
    }

    async function handleAdd() {
        if (!newEmail.trim()) return;
        setAdding(true);
        setMessage(null);

        const emailNorm = newEmail.trim().toLowerCase();
        const domain = emailNorm.split('@')[1] || null;

        // Auto-detect provider
        let provider = 'otro';
        if (emailNorm.includes('@gmail')) provider = 'gmail';
        else if (emailNorm.includes('@hotmail') || emailNorm.includes('@outlook')) provider = 'hotmail';
        else if (emailNorm.includes('@yahoo')) provider = 'yahoo';

        const record: any = {
            email: emailNorm,
            password: newPassword || null,
            provider: newType === 'cpanel' ? provider : newType,
            email_type: newType,
            domain,
            redirect_to: newRedirect.trim() || null,
        };

        const { error } = await (supabase.from('owned_emails') as any).upsert(record, { onConflict: 'email' });

        if (error) {
            setMessage({ type: 'error', text: 'Error: ' + error.message });
        } else {
            setNewEmail('');
            setNewPassword('');
            setNewRedirect('');
            setShowAdd(false);
            setMessage({ type: 'success', text: 'Correo agregado correctamente' });
            fetchEmails();
        }
        setAdding(false);
    }

    async function handleDelete(id: string) {
        setDeleting(id);
        const { error } = await (supabase.from('owned_emails') as any).delete().eq('id', id);
        if (error) {
            setMessage({ type: 'error', text: 'Error: ' + error.message });
        } else {
            setEmails(prev => prev.filter(e => e.id !== id));
        }
        setDeleting(null);
    }

    function togglePassword(id: string) {
        setShowPasswords(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    const typeColors: Record<string, string> = {
        cpanel: '#818CF8',
        gmail: '#F97316',
        hotmail: '#60A5FA',
    };

    if (loading) return null;

    return (
        <Card className="border-border bg-card">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-[#818CF8]" />
                        <CardTitle>Correos Propios</CardTitle>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdd(!showAdd)}
                        className="gap-1"
                    >
                        <Plus className="h-4 w-4" /> Agregar
                    </Button>
                </div>
                <CardDescription>
                    Correos que usás para las cuentas de streaming — cPanel, Gmail, Hotmail
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-red-500/20 text-red-500'}`}>
                        {message.text}
                    </div>
                )}

                {/* Add Form */}
                {showAdd && (
                    <div className="rounded-lg border border-[#818CF8]/30 bg-[#818CF8]/5 p-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">Nuevo Correo</p>

                        {/* Type selector */}
                        <div className="flex gap-2">
                            {(['cpanel', 'gmail', 'hotmail'] as const).map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setNewType(type)}
                                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${newType === type
                                            ? `bg-[${typeColors[type]}]/20 text-[${typeColors[type]}] border border-[${typeColors[type]}]/30`
                                            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                        }`}
                                    style={newType === type ? { backgroundColor: typeColors[type] + '20', color: typeColors[type], borderColor: typeColors[type] + '30' } : {}}
                                >
                                    {type === 'cpanel' ? <Server className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                                    {type === 'cpanel' ? 'cPanel' : type === 'gmail' ? 'Gmail' : 'Hotmail'}
                                </button>
                            ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="correo@dominio.com"
                                type="email"
                            />
                            <Input
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Contraseña (opcional)"
                                type="password"
                            />
                        </div>

                        {newType === 'cpanel' && (
                            <Input
                                value={newRedirect}
                                onChange={e => setNewRedirect(e.target.value)}
                                placeholder="Gmail donde se redireccionan (ej: tucorreo@gmail.com)"
                                type="email"
                            />
                        )}

                        <div className="flex gap-2">
                            <Button
                                onClick={handleAdd}
                                className="bg-[#818CF8] text-white hover:bg-[#818CF8]/90"
                                disabled={adding || !newEmail.trim()}
                                size="sm"
                            >
                                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                <span className="ml-1">Guardar</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Email List */}
                {emails.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No hay correos agregados
                    </div>
                ) : (
                    <div className="space-y-2">
                        {emails.map(email => (
                            <div key={email.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-[#0d0d0d] p-3">
                                <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0"
                                    style={{
                                        borderColor: (typeColors[email.email_type] || '#666') + '40',
                                        color: typeColors[email.email_type] || '#666',
                                    }}
                                >
                                    {email.email_type === 'cpanel' ? 'cPanel' : email.email_type}
                                </Badge>
                                <span className="text-sm text-foreground truncate flex-1">{email.email}</span>
                                {email.password && (
                                    <button
                                        onClick={() => togglePassword(email.id)}
                                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                    >
                                        {showPasswords.has(email.id) ? (
                                            <span className="text-xs text-foreground font-mono">{email.password}</span>
                                        ) : (
                                            <EyeOff className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                )}
                                {email.redirect_to && (
                                    <span className="text-[10px] text-muted-foreground shrink-0">→ {email.redirect_to}</span>
                                )}
                                <button
                                    onClick={() => handleDelete(email.id)}
                                    disabled={deleting === email.id}
                                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                                >
                                    {deleting === email.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
