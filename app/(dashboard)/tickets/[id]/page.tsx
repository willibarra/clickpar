'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    TicketCheck, AlertCircle, CheckCircle2, XCircle, Loader2,
    MessageSquare, ArrowLeft, User, Calendar, Zap, Clock,
} from 'lucide-react';

const TIPO_LABELS: Record<string, { label: string; emoji: string; urgent?: boolean }> = {
    cuenta_caida: { label: 'Cuenta caída', emoji: '🔴', urgent: true },
    no_conecta: { label: 'No conecta', emoji: '❌' },
    cambio_correo: { label: 'Cambio correo', emoji: '📧' },
    pin_olvidado: { label: 'PIN olvidado', emoji: '🔢' },
    otro: { label: 'Otro', emoji: '❓' },
};

const ESTADO_OPTIONS = [
    { value: 'abierto', label: 'Abierto' },
    { value: 'en_proceso', label: 'En proceso' },
    { value: 'resuelto', label: 'Resuelto' },
    { value: 'cerrado', label: 'Cerrado' },
];

export default function TicketDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [estado, setEstado] = useState('');
    const [resolucion, setResolucion] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/tickets/${params.id}`)
            .then(r => r.json())
            .then(data => {
                if (data.ticket) {
                    setTicket(data.ticket);
                    setEstado(data.ticket.estado || 'abierto');
                    setResolucion(data.ticket.resolucion || '');
                }
            })
            .finally(() => setLoading(false));
    }, [params.id]);

    const handleSave = async () => {
        setSaving(true);
        setSaveSuccess(false);
        setSaveError(null);
        try {
            const res = await fetch(`/api/tickets/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado, resolucion }),
            });
            const data = await res.json();
            if (data.success) {
                setTicket(data.ticket);
                setSaveSuccess(true);
                if (estado === 'resuelto') {
                    setTimeout(() => router.push('/tickets'), 1500);
                }
            } else {
                setSaveError(data.error || 'Error al guardar');
            }
        } catch {
            setSaveError('Error de conexión');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <XCircle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">Ticket no encontrado</p>
                <Link href="/tickets" className="text-sm text-[#86EFAC] hover:underline">← Volver a tickets</Link>
            </div>
        );
    }

    const tipoCfg = TIPO_LABELS[ticket.tipo] || { label: ticket.tipo, emoji: '❓' };
    const platform = ticket.subscription?.slot?.mother?.platform || '';
    const slotIdentifier = ticket.subscription?.slot?.slot_identifier || '';
    const customerPhone = ticket.customer?.phone_number || '';

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Back */}
            <Link
                href="/tickets"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Volver a tickets
            </Link>

            {/* Header card */}
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                <div className={`flex items-center gap-3 px-5 py-4 ${tipoCfg.urgent ? 'bg-red-500/10 border-b border-red-500/20' : 'bg-muted/30 border-b border-border/30'}`}>
                    <span className="text-2xl">{tipoCfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">
                                #{ticket.id.slice(0, 8).toUpperCase()}
                            </span>
                            {tipoCfg.urgent && (
                                <span className="flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-xs font-bold text-red-400">
                                    <Zap className="h-3 w-3" /> URGENTE
                                </span>
                            )}
                        </div>
                        <h1 className="text-lg font-bold text-foreground">{tipoCfg.label}</h1>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* Customer info */}
                    <div className="flex items-start gap-3 rounded-xl bg-muted/20 border border-border/30 p-4">
                        <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                                {ticket.customer?.full_name || 'Cliente sin nombre'}
                            </p>
                            {customerPhone && (
                                <p className="text-xs text-muted-foreground">{customerPhone}</p>
                            )}
                            {platform && (
                                <p className="text-xs text-muted-foreground">
                                    📺 {platform}{slotIdentifier ? ` — ${slotIdentifier}` : ''}
                                </p>
                            )}
                        </div>
                        {/* WhatsApp button */}
                        {customerPhone && (
                            <a
                                href={`https://wa.me/${customerPhone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs font-medium text-green-400 transition-all hover:bg-green-500/20"
                            >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Responder WA
                            </a>
                        )}
                    </div>

                    {/* Description */}
                    {ticket.descripcion && (
                        <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Descripción del cliente
                            </p>
                            <p className="text-sm text-foreground leading-relaxed">"{ticket.descripcion}"</p>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
                            <p className="text-muted-foreground mb-1 uppercase tracking-wider font-medium">Canal</p>
                            <p className="text-foreground font-medium">
                                {ticket.canal_origen === 'whatsapp' ? '💬 WhatsApp'
                                    : ticket.canal_origen === 'panel' ? '🖥️ Panel cliente'
                                    : '🤖 Sistema automático'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
                            <p className="text-muted-foreground mb-1 uppercase tracking-wider font-medium">Creado</p>
                            <p className="text-foreground font-medium">
                                {new Date(ticket.created_at).toLocaleDateString('es-PY', {
                                    day: '2-digit', month: 'short', year: 'numeric',
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Resolve card */}
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                <div className="flex items-center gap-2 border-b border-border/30 bg-muted/30 px-5 py-3.5">
                    <TicketCheck className="h-4 w-4 text-[#86EFAC]" />
                    <span className="text-sm font-semibold text-foreground">Actualizar Ticket</span>
                </div>
                <div className="space-y-4 p-5">
                    {/* Estado */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Estado
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {ESTADO_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setEstado(opt.value)}
                                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                                        estado === opt.value
                                            ? 'border-[#86EFAC]/60 bg-[#86EFAC]/10 text-foreground'
                                            : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-border'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Resolución */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Resolución {estado === 'resuelto' && <span className="text-[#86EFAC]">*</span>}
                        </label>
                        <textarea
                            value={resolucion}
                            onChange={(e) => setResolucion(e.target.value)}
                            placeholder="Describí qué se hizo para resolver el problema…"
                            rows={3}
                            className="w-full resize-none rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#86EFAC]/50 focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/30"
                        />
                        {estado === 'resuelto' && (
                            <p className="text-xs text-[#86EFAC]/70">
                                ✉️ Al resolver, el cliente recibirá un WhatsApp automático con esta información.
                            </p>
                        )}
                    </div>

                    {/* Feedback */}
                    {saveSuccess && (
                        <div className="flex items-center gap-2 rounded-xl bg-[#86EFAC]/10 border border-[#86EFAC]/30 px-4 py-3 text-sm text-[#86EFAC]">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                            Ticket actualizado correctamente.
                            {estado === 'resuelto' && ' El cliente fue notificado por WhatsApp.'}
                        </div>
                    )}
                    {saveError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                            <XCircle className="h-4 w-4 flex-shrink-0" />
                            {saveError}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#86EFAC] px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 active:scale-95 disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {saving ? 'Guardando…' : estado === 'resuelto' ? 'Marcar como resuelto' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}
