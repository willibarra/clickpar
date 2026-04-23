'use client';

import { useState, useMemo } from 'react';
import {
    Eye, EyeOff, Copy, Check, Pencil, Trash2, Save, X,
    Plus, Loader2, Search, Mail, Filter, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { OwnedEmailWithStatus } from '@/lib/actions/emails';
import { updateOwnedEmail, deleteOwnedEmail } from '@/lib/actions/emails';
import { AddEmailModal } from './add-email-modal';
import { InboxModal } from './inbox-modal';

type StatusFilter = 'all' | 'libre' | 'en_uso' | 'multi_uso';

const statusConfig = {
    libre: { label: 'Libre', color: '#86EFAC', bg: 'bg-[#86EFAC]/10', border: 'border-[#86EFAC]/30' },
    en_uso: { label: 'En Uso', color: '#EAB308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    multi_uso: { label: 'Multi-Uso', color: '#EF4444', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const providerLabels: Record<string, string> = {
    gmail: 'Gmail', hotmail: 'Hotmail', outlook: 'Outlook', icloud: 'iCloud', yahoo: 'Yahoo', otro: 'Otro',
};

export function EmailsView({ emails: initialEmails }: { emails: OwnedEmailWithStatus[] }) {
    const router = useRouter();
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [addOpen, setAddOpen] = useState(false);

    const filtered = useMemo(() => {
        let result = initialEmails;
        if (filter !== 'all') result = result.filter(e => e.status === filter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e =>
                e.email.toLowerCase().includes(q) ||
                (e.notes && e.notes.toLowerCase().includes(q)) ||
                e.provider.toLowerCase().includes(q)
            );
        }
        return result;
    }, [initialEmails, filter, searchQuery]);

    return (
        <div className="space-y-4">
            {/* Controls Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar correo..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-[#1a1a1a] border border-border/50 rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none transition-colors w-64"
                        />
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                        {(['all', 'libre', 'en_uso', 'multi_uso'] as StatusFilter[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filter === f
                                    ? f === 'all' ? 'bg-[#818CF8]/20 text-[#818CF8]'
                                        : `${statusConfig[f as keyof typeof statusConfig].bg} text-[${statusConfig[f as keyof typeof statusConfig].color}]`
                                    : 'bg-[#1a1a1a] text-muted-foreground hover:text-foreground'
                                    }`}
                                style={filter === f && f !== 'all' ? { color: statusConfig[f as keyof typeof statusConfig].color } : {}}
                            >
                                {f === 'all' ? 'Todos' : statusConfig[f as keyof typeof statusConfig].label}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#86EFAC]/10 px-4 py-2 text-sm font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors"
                >
                    <Plus className="h-4 w-4" /> Agregar Correo
                </button>
            </div>

            {/* Emails List */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1a]">
                        <Mail className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                        {initialEmails.length === 0 ? 'No tienes correos registrados aún' : 'Sin resultados'}
                    </p>
                    {initialEmails.length === 0 && (
                        <button
                            onClick={() => setAddOpen(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#86EFAC]/10 px-4 py-2 text-sm font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors"
                        >
                            <Plus className="h-4 w-4" /> Agregar tu primer correo
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid gap-2">
                    {filtered.map(email => (
                        <EmailRow key={email.id} email={email} />
                    ))}
                </div>
            )}

            <AddEmailModal open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
    );
}

/* ── Individual Email Row ──────────────────────────────────────── */

function EmailRow({ email }: { email: OwnedEmailWithStatus }) {
    const router = useRouter();
    const [showPass, setShowPass] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inboxOpen, setInboxOpen] = useState(false);
    const [error, setError] = useState('');

    // Edit state
    const [editEmail, setEditEmail] = useState(email.email);
    const [editPassword, setEditPassword] = useState(email.password || '');
    const [editProvider, setEditProvider] = useState(email.provider);
    const [editNotes, setEditNotes] = useState(email.notes || '');

    const sc = statusConfig[email.status];

    const handleCopy = async () => {
        const text = `${email.email}\n${email.password || '(sin clave)'}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            await updateOwnedEmail(email.id, {
                email: editEmail,
                password: editPassword || null,
                provider: editProvider,
                notes: editNotes || null,
            });
            setEditing(false);
            router.refresh();
        } catch (err: any) { setError(err.message || 'Error'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!confirm(`¿Eliminar ${email.email}?`)) return;
        setDeleting(true);
        try {
            await deleteOwnedEmail(email.id);
            router.refresh();
        } catch (err: any) { setError(err.message || 'Error'); }
        finally { setDeleting(false); }
    };

    if (editing) {
        return (
            <Card className={`${sc.border} border bg-card overflow-hidden`}>
                <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-border/30">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${sc.color}40`, color: sc.color }}>
                            Editando
                        </Badge>
                        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-1">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
                            <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                                className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none w-full" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Contraseña</label>
                            <input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                                className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none w-full" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Proveedor</label>
                            <select value={editProvider} onChange={e => setEditProvider(e.target.value)}
                                className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none w-full">
                                {Object.entries(providerLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Notas</label>
                            <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notas opcionales"
                                className="bg-[#1a1a1a] border border-border/50 rounded px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none w-full" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-[#0d0d0d]">
                        <span className="text-xs text-red-500">{error}</span>
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium bg-[#86EFAC]/10 text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-all disabled:opacity-50">
                            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</> : <><Save className="h-3 w-3" /> Guardar</>}
                        </button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className={`rounded-lg border ${sc.border} bg-[#111] overflow-hidden`}>
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Status dot */}
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.color }} />

                {/* Email & Provider */}
                <div className="min-w-[200px]">
                    <span className="text-sm font-semibold text-foreground">{email.email}</span>
                    <span className="text-xs text-muted-foreground ml-2">{providerLabels[email.provider] || email.provider}</span>
                </div>

                {/* Password */}
                <div className="min-w-[120px] flex items-center gap-1">
                    <span className="text-sm text-foreground">
                        {showPass ? (email.password || '—') : '••••••'}
                    </span>
                    <button onClick={() => setShowPass(!showPass)} className="text-muted-foreground hover:text-foreground p-0.5">
                        {showPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                </div>

                {/* Status Badge */}
                <Badge variant="outline" className="text-[10px] flex-shrink-0" style={{
                    borderColor: `${sc.color}40`, color: sc.color, backgroundColor: `${sc.color}08`
                }}>
                    {sc.label}
                </Badge>

                {/* Linked Accounts */}
                <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-x-auto">
                    {email.linked_accounts.length > 0 ? (
                        email.linked_accounts.map(la => (
                            <button
                                key={la.id}
                                onClick={() => router.push(`/?q=${encodeURIComponent(la.email)}`)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#818CF8]/10 text-[#818CF8] hover:bg-[#818CF8]/20 transition-colors flex-shrink-0"
                                title={`Buscar ${la.platform} — ${la.email}`}
                            >
                                <ExternalLink className="h-2.5 w-2.5" />
                                {la.platform}
                            </button>
                        ))
                    ) : (
                        <span className="text-xs text-muted-foreground/50">Sin cuentas asociadas</span>
                    )}
                </div>

                {/* Notes */}
                {email.notes && (
                    <span className="text-xs text-muted-foreground/60 truncate max-w-[100px] flex-shrink-0" title={email.notes}>
                        {email.notes}
                    </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={handleCopy}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${copied ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-[#818CF8]/10 text-[#818CF8] hover:bg-[#818CF8]/20'
                            }`}>
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button onClick={() => setInboxOpen(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                        title="Ver Bandeja de Entrada"
                    >
                        <Mail className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditing(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors">
                        <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={handleDelete} disabled={deleting}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                </div>
            </div>

            <InboxModal
                open={inboxOpen}
                email={email.email}
                onClose={() => setInboxOpen(false)}
            />
        </div>
    );
}
