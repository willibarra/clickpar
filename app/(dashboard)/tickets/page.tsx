'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    TicketCheck, AlertCircle, CheckCircle2, XCircle, Loader2,
    MessageSquare, Clock, Filter, RefreshCw, Zap,
} from 'lucide-react';

const ESTADO_TABS = [
    { key: '', label: 'Todos' },
    { key: 'abierto', label: 'Abiertos' },
    { key: 'en_proceso', label: 'En proceso' },
    { key: 'resuelto', label: 'Resueltos' },
];

const TIPO_LABELS: Record<string, { label: string; urgent?: boolean }> = {
    cuenta_caida: { label: 'Cuenta caída', urgent: true },
    no_conecta: { label: 'No conecta' },
    cambio_correo: { label: 'Cambio correo' },
    pin_olvidado: { label: 'PIN olvidado' },
    otro: { label: 'Otro' },
};

const ESTADO_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    abierto: { label: 'Abierto', icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30' },
    en_proceso: { label: 'En proceso', icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
    resuelto: { label: 'Resuelto', icon: CheckCircle2, color: 'text-[#86EFAC]', bg: 'bg-[#86EFAC]/10 border-[#86EFAC]/30' },
    cerrado: { label: 'Cerrado', icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/10 border-border/30' },
};

const CANAL_LABELS: Record<string, string> = {
    whatsapp: '💬 WhatsApp',
    panel: '🖥️ Panel',
    sistema_automatico: '🤖 Sistema',
};

export default function TicketsPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [estadoFilter, setEstadoFilter] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const loadTickets = async () => {
        setRefreshing(true);
        const url = estadoFilter ? `/api/tickets?estado=${estadoFilter}&limit=100` : '/api/tickets?limit=100';
        const res = await fetch(url);
        const data = await res.json();
        setTickets(data.tickets || []);
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => { loadTickets(); }, [estadoFilter]);

    const urgentCount = tickets.filter(t => t.tipo === 'cuenta_caida' && t.estado === 'abierto').length;
    const openCount = tickets.filter(t => t.estado === 'abierto').length;

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <TicketCheck className="h-6 w-6 text-[#86EFAC]" />
                        Tickets de Soporte
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {openCount} abierto{openCount !== 1 ? 's' : ''}
                        {urgentCount > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                                <Zap className="h-3 w-3" />
                                {urgentCount} urgente{urgentCount !== 1 ? 's' : ''}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={loadTickets}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Estado tabs */}
            <div className="flex gap-1.5 border-b border-border/30 pb-0">
                {ESTADO_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setEstadoFilter(tab.key)}
                        className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                            estadoFilter === tab.key
                                ? 'border border-b-background border-border/50 bg-card text-foreground -mb-px'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Ticket list */}
            {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-16 text-center">
                    <div className="rounded-full bg-muted p-4">
                        <TicketCheck className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No hay tickets en esta categoría</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {tickets.map(ticket => {
                        const estadoCfg = ESTADO_CONFIG[ticket.estado] || ESTADO_CONFIG.abierto;
                        const tipoCfg = TIPO_LABELS[ticket.tipo] || { label: ticket.tipo };
                        const Icon = estadoCfg.icon;
                        const isUrgent = tipoCfg.urgent && ticket.estado === 'abierto';

                        return (
                            <Link
                                key={ticket.id}
                                href={`/tickets/${ticket.id}`}
                                className={`flex items-start gap-4 rounded-xl border bg-card p-4 transition-all hover:border-[#86EFAC]/40 hover:bg-[#86EFAC]/5 ${
                                    isUrgent ? 'border-red-500/40' : 'border-border/40'
                                }`}
                            >
                                {/* Priority indicator */}
                                {isUrgent && (
                                    <div className="flex-shrink-0 mt-0.5">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                                            <Zap className="h-3.5 w-3.5" />
                                        </span>
                                    </div>
                                )}

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-mono text-muted-foreground">
                                            #{ticket.id.slice(0, 8).toUpperCase()}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${estadoCfg.bg} ${estadoCfg.color}`}>
                                            <Icon className="h-3 w-3" />
                                            {estadoCfg.label}
                                        </span>
                                        {isUrgent && (
                                            <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-xs font-bold text-red-400">
                                                URGENTE
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-foreground">
                                            {ticket.customer?.full_name || 'Cliente sin nombre'}
                                        </p>
                                        {ticket.customer?.phone_number && (
                                            <span className="text-xs text-muted-foreground">
                                                {ticket.customer.phone_number}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-muted-foreground">
                                            ⚠️ {tipoCfg.label}
                                        </span>
                                        {ticket.subscription?.slot?.mother?.platform && (
                                            <span className="text-xs text-muted-foreground">
                                                📺 {ticket.subscription.slot.mother.platform}
                                            </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {CANAL_LABELS[ticket.canal_origen] || ticket.canal_origen}
                                        </span>
                                    </div>
                                    {ticket.descripcion && (
                                        <p className="mt-1 text-xs text-muted-foreground truncate">
                                            "{ticket.descripcion}"
                                        </p>
                                    )}
                                </div>

                                {/* Date */}
                                <div className="flex-shrink-0 text-right">
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(ticket.created_at).toLocaleDateString('es-PY', {
                                            day: '2-digit',
                                            month: 'short',
                                        })}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60">
                                        {new Date(ticket.created_at).toLocaleTimeString('es-PY', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
