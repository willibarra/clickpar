'use client';

import { useEffect, useState } from 'react';
import {
    MessageSquare,
    Phone,
    Clock,
    ChevronDown,
    HelpCircle,
    Loader2,
    AlertTriangle,
    Search,
    ListChecks,
    TicketCheck,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Send,
} from 'lucide-react';
import { CodeIframeModal } from '@/components/portal/code-iframe-modal';
import { CodeRequestModal } from '@/components/portal/code-request-modal';

interface FAQItem {
    q: string;
    a: string;
}

interface CodeButtonItem {
    label: string;
    source: string;
    url: string | null;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
}

interface ServiceHelpItem {
    saleId: string;
    email: string;
    pin: string | null;
    platform: string;
    supplierName: string;
    supportInstructions: string;
    helpSteps: string[];
    faqItems: FAQItem[];
    needsCode: boolean;
    codeUrl: string | null;
    codeSource: string;
    codeButtons: CodeButtonItem[];
}

const PLATFORM_CONFIG: Record<string, { blurColor: string }> = {
    Netflix: { blurColor: 'rgba(220,38,38,0.5)' },
    'HBO Max': { blurColor: 'rgba(147,51,234,0.5)' },
    'Disney+': { blurColor: 'rgba(37,99,235,0.5)' },
    'Amazon Prime Video': { blurColor: 'rgba(14,165,233,0.45)' },
    'Prime Video': { blurColor: 'rgba(14,165,233,0.45)' },
    'Spotify Premium': { blurColor: 'rgba(34,197,94,0.45)' },
    Spotify: { blurColor: 'rgba(34,197,94,0.45)' },
    'YouTube Premium': { blurColor: 'rgba(239,68,68,0.45)' },
    Crunchyroll: { blurColor: 'rgba(249,115,22,0.45)' },
    VIX: { blurColor: 'rgba(245,158,11,0.45)' },
    Vix: { blurColor: 'rgba(245,158,11,0.45)' },
    'Paramount+': { blurColor: 'rgba(29,78,216,0.5)' },
    iCloud: { blurColor: 'rgba(56,189,248,0.45)' },
    FLUJOTV: { blurColor: 'rgba(99,102,241,0.45)' },
};

function FAQAccordion({ item }: { item: FAQItem }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
                <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">{item.q}</span>
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="border-t border-border/30 px-4 py-3">
                    <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                        {item.a}
                    </p>
                </div>
            )}
        </div>
    );
}

function CodeActionButton({ btn, saleId, platform }: { btn: CodeButtonItem; saleId: string; platform: string }) {
    const [showIframe, setShowIframe] = useState(false);
    const [showRequest, setShowRequest] = useState(false);

    if (btn.source === 'iframe' && btn.url) {
        return (
            <>
                <button
                    onClick={() => setShowIframe(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 py-2.5 text-sm font-medium text-[#86EFAC] transition-all hover:bg-[#86EFAC]/20"
                >
                    <Search className="h-4 w-4" />
                    {btn.label || 'Consultar Código'}
                </button>
                <CodeIframeModal
                    isOpen={showIframe}
                    onClose={() => setShowIframe(false)}
                    codeUrl={btn.url}
                    platform={platform}
                />
            </>
        );
    }

    if (btn.source === 'telegram_bot') {
        return (
            <>
                <button
                    onClick={() => setShowRequest(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#818CF8]/30 bg-[#818CF8]/10 py-2.5 text-sm font-medium text-[#818CF8] transition-all hover:bg-[#818CF8]/20"
                >
                    <Send className="h-4 w-4" />
                    {btn.label || 'Solicitar Código'}
                </button>
                <CodeRequestModal
                    isOpen={showRequest}
                    onClose={() => setShowRequest(false)}
                    saleId={saleId}
                    platform={platform}
                />
            </>
        );
    }

    if (btn.source === 'imap') {
        return (
            <>
                <button
                    onClick={() => setShowRequest(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-sm font-medium text-amber-400 transition-all hover:bg-amber-500/20"
                >
                    <Search className="h-4 w-4" />
                    {btn.label || 'Consultar Código'}
                </button>
                <CodeRequestModal
                    isOpen={showRequest}
                    onClose={() => setShowRequest(false)}
                    saleId={saleId}
                    platform={platform}
                />
            </>
        );
    }

    // Manual fallback
    return null;
}

function ServiceSupportCard({ item }: { item: ServiceHelpItem }) {
    const [showSteps, setShowSteps] = useState(false);
    const [showFaqs, setShowFaqs] = useState(false);
    const config = PLATFORM_CONFIG[item.platform] || { blurColor: 'rgba(120,120,120,0.4)' };
    const buttons = item.codeButtons || [];

    return (
        <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#111118]">
            {/* Bokeh Header */}
            <div className="relative overflow-hidden px-5 py-8 text-center">
                {/* Blurred gradient blob */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${config.blurColor}, transparent 70%)`,
                    }}
                />
                {/* Second layer for depth */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: `radial-gradient(circle at 30% 20%, ${config.blurColor.replace(/[\d.]+\)$/, '0.3)')}, transparent 50%)`,
                    }}
                />
                <h3 className="relative text-xl font-bold text-white tracking-wide">
                    {item.platform}
                </h3>
                <p className="relative mt-1.5 text-sm font-mono text-white/60">
                    {item.email}
                </p>
            </div>

            {/* Content body */}
            <div className="space-y-0.5 px-1 pb-1">
                {/* Pasos de acceso accordion */}
                {item.helpSteps && item.helpSteps.length > 0 && (
                    <button
                        onClick={() => setShowSteps(!showSteps)}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground/80 transition-colors hover:bg-white/[0.03] rounded-lg"
                    >
                        <span className="flex items-center gap-2.5">
                            <ListChecks className="h-4 w-4 text-muted-foreground" />
                            Pasos de acceso ({item.helpSteps.length})
                        </span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSteps ? 'rotate-180' : ''}`} />
                    </button>
                )}
                {showSteps && item.helpSteps && (
                    <div className="space-y-1.5 px-4 pb-3">
                        {item.helpSteps.map((step, i) => (
                            <div key={i} className="flex items-start gap-3 rounded-lg bg-white/[0.03] px-3.5 py-2.5">
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#86EFAC]/15 text-[10px] font-bold text-[#86EFAC]">
                                    {i + 1}
                                </span>
                                <span className="text-sm text-foreground/80 leading-relaxed">{step}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* FAQs accordion */}
                {item.faqItems && item.faqItems.length > 0 && (
                    <button
                        onClick={() => setShowFaqs(!showFaqs)}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground/80 transition-colors hover:bg-white/[0.03] rounded-lg"
                    >
                        <span className="flex items-center gap-2.5">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            Preguntas frecuentes ({item.faqItems.length})
                        </span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showFaqs ? 'rotate-180' : ''}`} />
                    </button>
                )}
                {showFaqs && item.faqItems && (
                    <div className="space-y-1.5 px-4 pb-3">
                        {item.faqItems.map((faq, i) => (
                            <FAQAccordion key={i} item={faq} />
                        ))}
                    </div>
                )}

                {/* Code Action Buttons */}
                {buttons.length > 0 && (
                    <div className={`flex gap-2 px-4 py-3 ${buttons.length > 1 ? 'flex-row' : ''}`}>
                        {buttons.map((btn, i) => (
                            <CodeActionButton key={i} btn={btn} saleId={item.saleId} platform={item.platform} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const TICKET_TYPES = [
    { value: 'no_conecta', label: '❌ No conecta / No carga' },
    { value: 'cambio_correo', label: '📧 Necesito cambio de correo' },
    { value: 'pin_olvidado', label: '🔢 PIN olvidado' },
    { value: 'otro', label: '❓ Otro problema' },
];

const ESTADO_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    abierto: { label: 'Abierto', icon: AlertCircle, color: 'text-yellow-400' },
    en_proceso: { label: 'En proceso', icon: Loader2, color: 'text-blue-400' },
    resuelto: { label: 'Resuelto', icon: CheckCircle2, color: 'text-[#86EFAC]' },
    cerrado: { label: 'Cerrado', icon: XCircle, color: 'text-muted-foreground' },
};

export default function SoportePage() {
    const [helpItems, setHelpItems] = useState<ServiceHelpItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Ticket form state
    const [ticketTipo, setTicketTipo] = useState('no_conecta');
    const [ticketDesc, setTicketDesc] = useState('');
    const [ticketSubmitting, setTicketSubmitting] = useState(false);
    const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
    const [ticketError, setTicketError] = useState<string | null>(null);

    // Ticket history
    const [tickets, setTickets] = useState<any[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(true);

    const loadTickets = () => {
        setTicketsLoading(true);
        fetch('/api/tickets')
            .then(r => r.json())
            .then(data => { if (data.tickets) setTickets(data.tickets); })
            .catch(() => {})
            .finally(() => setTicketsLoading(false));
    };

    useEffect(() => {
        fetch('/api/portal/support')
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setHelpItems(data.helpItems);
                } else {
                    setError(data.error || 'Error al cargar soporte');
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));

        loadTickets();
    }, []);

    const handleTicketSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTicketSubmitting(true);
        setTicketError(null);
        setTicketSuccess(null);
        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: ticketTipo, descripcion: ticketDesc, canal_origen: 'panel' }),
            });
            const data = await res.json();
            if (data.success) {
                const id = data.ticket?.id?.slice(0, 8).toUpperCase();
                setTicketSuccess(`✅ Ticket #${id} creado. Te contactamos en breve.`);
                setTicketDesc('');
                loadTickets();
            } else {
                setTicketError(data.error || 'Error al crear el ticket');
            }
        } catch {
            setTicketError('Error de conexión');
        } finally {
            setTicketSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Soporte</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Ayuda personalizada para cada uno de tus servicios activos
                </p>
            </div>

            {/* Personalized help per account/service */}
            {helpItems.length > 0 ? (
                <div className="space-y-4">
                    {helpItems.map((item) => (
                        <ServiceSupportCard key={item.saleId} item={item} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-12 text-center">
                    <div className="rounded-full bg-muted p-4">
                        <HelpCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-medium text-foreground">Sin servicios activos</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            No tenés cuentas activas en este momento
                        </p>
                    </div>
                </div>
            )}

            {/* ── REPORTAR UN PROBLEMA ── (Temporalmente oculto) */}
            {false && (
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                <div className="flex items-center gap-2 border-b border-border/30 bg-muted/30 px-5 py-3.5">
                    <TicketCheck className="h-4 w-4 text-[#86EFAC]" />
                    <span className="text-sm font-semibold text-foreground">Reportar un Problema (Tickets)</span>
                </div>
                <form onSubmit={handleTicketSubmit} className="space-y-4 p-5">
                    {/* Tipo selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            ¿Qué problema tenés?
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {TICKET_TYPES.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setTicketTipo(opt.value)}
                                    className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                                        ticketTipo === opt.value
                                            ? 'border-[#86EFAC]/60 bg-[#86EFAC]/10 text-foreground font-medium'
                                            : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-border'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Descripción (opcional)
                        </label>
                        <textarea
                            value={ticketDesc}
                            onChange={(e) => setTicketDesc(e.target.value)}
                            placeholder="Contanos más detalles de tu problema…"
                            rows={3}
                            className="w-full resize-none rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#86EFAC]/50 focus:outline-none focus:ring-1 focus:ring-[#86EFAC]/30"
                        />
                    </div>

                    {/* Feedback messages */}
                    {ticketSuccess && (
                        <div className="flex items-center gap-2 rounded-xl bg-[#86EFAC]/10 border border-[#86EFAC]/30 px-4 py-3 text-sm text-[#86EFAC]">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                            {ticketSuccess}
                        </div>
                    )}
                    {ticketError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                            <XCircle className="h-4 w-4 flex-shrink-0" />
                            {ticketError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={ticketSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#86EFAC] px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 active:scale-95 disabled:opacity-60"
                    >
                        {ticketSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        {ticketSubmitting ? 'Enviando…' : 'Enviar ticket'}
                    </button>
                </form>
            </div>
            )}

            {/* ── MIS TICKETS ── */}
            {(ticketsLoading || tickets.length > 0) && (
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Mis Tickets
                    </h2>
                    {ticketsLoading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tickets.map((t: any) => {
                                const cfg = ESTADO_CONFIG[t.estado] || ESTADO_CONFIG.abierto;
                                const Icon = cfg.icon;
                                const tipoLabels: Record<string, string> = {
                                    cuenta_caida: 'Cuenta caída',
                                    no_conecta: 'No conecta',
                                    cambio_correo: 'Cambio correo',
                                    pin_olvidado: 'PIN olvidado',
                                    otro: 'Otro',
                                };
                                return (
                                    <div key={t.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card px-4 py-3">
                                        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${cfg.color}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    #{t.id.slice(0, 8).toUpperCase()}
                                                </span>
                                                <span className={`text-xs font-medium ${cfg.color}`}>
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-foreground">
                                                {tipoLabels[t.tipo] || t.tipo}
                                            </p>
                                            {t.descripcion && (
                                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.descripcion}</p>
                                            )}
                                            {t.estado === 'resuelto' && t.resolucion && (
                                                <p className="text-xs text-[#86EFAC] mt-1">✅ {t.resolucion}</p>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                            {new Date(t.created_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* General FAQ - always shown */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Preguntas Generales
                </h2>
                <div className="space-y-1.5">
                    <FAQAccordion item={{ q: '¿Cómo renuevo mi servicio?', a: 'Podes renovar desde la pestaña "Servicios" usando PagoPar, o escribinos por WhatsApp. Aceptamos Giros (Tigo, Personal, Claro), WALLY, ZIMPLE y Transferencia bancaria.' }} />
                    <FAQAccordion item={{ q: '¿Puedo cambiar de plataforma?', a: 'Sí, al momento de renovar podés elegir otra plataforma. El precio puede variar según el servicio elegido.' }} />
                    <FAQAccordion item={{ q: '¿Dónde veo mis credenciales?', a: 'En la sección "Servicios" de tu panel tenés el correo, contraseña y PIN de cada cuenta.' }} />
                </div>
            </div>

            {/* WhatsApp contact */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Contactar por WhatsApp
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <a
                        href="https://wa.me/595971995666"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-[#86EFAC]/50 hover:bg-[#86EFAC]/5"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                            <MessageSquare className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">0971 995 666</p>
                            <p className="text-xs text-muted-foreground">Línea 1</p>
                        </div>
                    </a>
                    <a
                        href="https://wa.me/595994540904"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-[#86EFAC]/50 hover:bg-[#86EFAC]/5"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                            <MessageSquare className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">0994 540 904</p>
                            <p className="text-xs text-muted-foreground">Línea 2</p>
                        </div>
                    </a>
                </div>
            </div>

            {/* Business hours */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Horario de Atención</span>
                </div>
                <div className="space-y-1 text-sm">
                    {[
                        { day: 'Lunes a Viernes', time: '9:00 AM - 8:00 PM' },
                        { day: 'Sábado y Domingo', time: '2:00 PM - 8:00 PM' },
                    ].map((h) => (
                        <div key={h.day} className="flex justify-between">
                            <span className="text-muted-foreground">{h.day}</span>
                            <span className="font-medium text-foreground">{h.time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
