'use client';

import { useState, useEffect } from 'react';
import { Loader2, X, Search, Mail as MailIcon, RefreshCw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface InboxModalProps {
    open: boolean;
    email: string;
    onClose: () => void;
}

interface EmailMessage {
    id: string;
    subject: string;
    snippet: string;
    date: string;
    body?: string; // We don't fetch full body to save memory/time, just subject and snippet
}

export function InboxModal({ open, email, onClose }: InboxModalProps) {
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchEmails = async (query = '') => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/emails/search?email=${encodeURIComponent(email)}&q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al conectar con Gmail');
            }

            setMessages(data.messages || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setSearchQuery('');
            fetchEmails('');
        }
    }, [open, email]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchEmails(searchQuery);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl flex flex-col max-h-[90vh] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-[#0d0d0d]">
                    <div className="flex items-center gap-2">
                        <MailIcon className="h-5 w-5 text-indigo-400" />
                        <div>
                            <h2 className="text-sm font-bold text-foreground">Bandeja de Entrada</h2>
                            <p className="text-xs text-muted-foreground">{email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1.5 hover:bg-[#333] transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-3 border-b border-border bg-background flex items-center gap-2">
                    <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar en correos (ej: Netflix, código)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 h-8 text-xs bg-[#1a1a1a]"
                            />
                        </div>
                        <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs" disabled={loading}>
                            Buscar
                        </Button>
                    </form>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => fetchEmails(searchQuery)}
                        disabled={loading}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-[#111] min-h-[300px]">
                    {error ? (
                        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                            <div className="rounded-full bg-red-500/10 p-3 mb-3">
                                <X className="h-6 w-6 text-red-500" />
                            </div>
                            <p className="text-sm font-medium text-red-500 mb-1">Error de conexión</p>
                            <p className="text-xs text-muted-foreground">{error}</p>
                        </div>
                    ) : loading ? (
                        <div className="flex flex-col items-center justify-center h-full p-6">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-4" />
                            <p className="text-xs text-muted-foreground">Sincronizando con Gmail...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                            <MailIcon className="h-8 w-8 text-muted-foreground/30 mb-3" />
                            <p className="text-sm font-medium text-foreground mb-1">Bandeja vacía</p>
                            <p className="text-xs text-muted-foreground">No se encontraron correos recientes (últimos 2 días).</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {messages.map((msg) => (
                                <div key={msg.id} className="rounded-md border border-border/50 bg-[#1a1a1a] p-3 hover:border-border transition-colors">
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                        <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1">
                                            {msg.subject}
                                        </h3>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                            {format(new Date(msg.date), "d MMM, HH:mm", { locale: es })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {msg.snippet.replace(/&#39;/g, "'").replace(/&quot;/g, '"')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
