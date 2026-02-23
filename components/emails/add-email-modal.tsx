'use client';

import { useState } from 'react';
import { Plus, Loader2, X, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { addOwnedEmail } from '@/lib/actions/emails';

const providerOptions = [
    { value: 'gmail', label: 'Gmail' },
    { value: 'hotmail', label: 'Hotmail' },
    { value: 'outlook', label: 'Outlook' },
    { value: 'yahoo', label: 'Yahoo' },
    { value: 'otro', label: 'Otro' },
];

export function AddEmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [provider, setProvider] = useState('gmail');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) { setError('El correo es requerido'); return; }
        setSaving(true); setError('');
        try {
            await addOwnedEmail({ email: email.trim(), password, provider, notes });
            setEmail(''); setPassword(''); setProvider('gmail'); setNotes('');
            onClose();
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#86EFAC]/20">
                            <Mail className="h-4 w-4 text-[#86EFAC]" />
                        </div>
                        <h2 className="text-lg font-semibold">Agregar Correo</h2>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">Email *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="ejemplo@gmail.com"
                            className="bg-[#1a1a1a] border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none w-full transition-colors"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">Contraseña</label>
                        <input
                            type="text"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Contraseña del correo"
                            className="bg-[#1a1a1a] border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none w-full transition-colors"
                        />
                    </div>

                    <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">Proveedor</label>
                        <select
                            value={provider}
                            onChange={e => setProvider(e.target.value)}
                            className="bg-[#1a1a1a] border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:border-[#86EFAC]/50 focus:outline-none w-full transition-colors"
                        >
                            {providerOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">Notas</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Notas opcionales..."
                            rows={2}
                            className="bg-[#1a1a1a] border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#86EFAC]/50 focus:outline-none w-full transition-colors resize-none"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                            <p className="text-xs text-red-500">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#86EFAC] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#86EFAC]/90 transition-colors disabled:opacity-50"
                    >
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><Plus className="h-4 w-4" /> Agregar Correo</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
