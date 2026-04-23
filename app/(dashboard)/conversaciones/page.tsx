'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    MessageSquare, Search, CheckCircle2, RefreshCw,
    Send, User, Loader2,
    Zap, X, Info, Calendar, CreditCard, AlertTriangle,
    MessageCircle, Inbox, Phone, Package, UserCheck,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Conversation {
    id: string;
    customer_id: string | null;
    status: 'open' | 'resolved' | 'waiting';
    assigned_to: string | null;
    last_message_at: string;
    last_message_preview: string | null;
    unread_count: number;
    channel: string;
    wa_phone: string | null;
    customer?: {
        id: string;
        full_name: string;
        phone: string;
        sales?: any[];
    };
}

interface Message {
    id: string;
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    sender: 'customer' | 'staff' | 'bot';
    sender_name: string | null;
    message: string;
    wa_status: string | null;
    is_automated: boolean;
    created_at: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    open: { label: 'Abierto', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', dot: 'bg-yellow-400' },
    resolved: { label: 'Resuelto', color: 'text-[#86EFAC]', bg: 'bg-[#86EFAC]/10 border-[#86EFAC]/30', dot: 'bg-[#86EFAC]' },
    waiting: { label: 'En espera', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30', dot: 'bg-blue-400' },
};

// ─── Quick reply templates ────────────────────────────────────────────────────

const QUICK_REPLIES = [
    { label: '👋 Saludo', text: '¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?' },
    { label: '⏰ Fuera de horario', text: '⏰ Nuestro horario es Lun-Sáb de 9:00 a 18:00 hs. Te respondemos a la brevedad!' },
    { label: '✅ En revisión', text: '✅ Recibimos tu consulta, estamos revisando y te respondemos en breve.' },
    { label: '💰 Precio', text: '💰 Para consultar precios actualizados, escribinos al horario de atención y te enviamos la info.' },
    { label: '🔄 Renovación', text: '🔄 Para renovar tu servicio, podés pagar por transferencia o efectivo. ¿Cuál preferís?' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date: string): string {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({ conv, selected, onClick }: { conv: Conversation; selected: boolean; onClick: () => void }) {
    const cfg = STATUS_CONFIG[conv.status] || STATUS_CONFIG.open;
    const name = conv.customer?.full_name || conv.wa_phone || 'Desconocido';
    const platform = conv.customer?.sales?.find((s: any) => s.is_active)?.sale_slots?.[0]?.mother_accounts?.platform;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-b border-border/20 transition-all hover:bg-[#86EFAC]/5 ${
                selected ? 'bg-[#86EFAC]/10 border-l-2 border-l-[#86EFAC]' : 'border-l-2 border-l-transparent'
            }`}
        >
            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <span className="text-sm font-semibold text-foreground truncate">{name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                    {timeAgo(conv.last_message_at)}
                </span>
            </div>

            {/* Preview row */}
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate flex-1">
                    {conv.last_message_preview || 'Sin mensajes aún'}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {platform && (
                        <span className="text-[9px] bg-muted/50 rounded px-1 text-muted-foreground">
                            {platform}
                        </span>
                    )}
                    {conv.unread_count > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#86EFAC] text-[9px] font-bold text-black">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
    const isInbound = msg.direction === 'inbound';
    const isBot = msg.sender === 'bot';

    return (
        <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'} mb-2`}>
            <div className={`max-w-[75%] ${isInbound ? 'items-start' : 'items-end'} flex flex-col gap-0.5`}>
                {/* Sender label */}
                <span className={`text-[9px] text-muted-foreground px-1 ${isInbound ? 'self-start' : 'self-end'}`}>
                    {isBot ? '🤖 Auto' : msg.sender_name || (isInbound ? 'Cliente' : 'Staff')}
                </span>

                {/* Bubble */}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    isInbound
                        ? 'bg-muted/60 text-foreground rounded-tl-sm'
                        : isBot
                        ? 'bg-blue-500/20 border border-blue-500/30 text-blue-100 rounded-tr-sm'
                        : 'bg-[#86EFAC]/20 border border-[#86EFAC]/30 text-[#86EFAC] rounded-tr-sm'
                }`}>
                    {msg.message}
                </div>

                {/* Time + status */}
                <div className={`flex items-center gap-1 px-1 ${isInbound ? 'self-start' : 'self-end'}`}>
                    <span className="text-[9px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    {!isInbound && (
                        <span className={`text-[9px] ${
                            msg.wa_status === 'read' ? 'text-blue-400' :
                            msg.wa_status === 'failed' ? 'text-red-400' :
                            'text-muted-foreground'
                        }`}>
                            {msg.wa_status === 'read' ? '✓✓' :
                             msg.wa_status === 'delivered' ? '✓✓' :
                             msg.wa_status === 'failed' ? '✕' : '✓'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
    return (
        <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-border/30" />
            <span className="text-[10px] text-muted-foreground bg-background px-2">{formatDate(date)}</span>
            <div className="flex-1 h-px bg-border/30" />
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConversacionesPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendingCredentials, setSendingCredentials] = useState(false);
    const [credentialsFeedback, setCredentialsFeedback] = useState<string | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [statusFilter, setStatusFilter] = useState<'open' | 'waiting' | 'resolved' | 'all'>('open');
    const [search, setSearch] = useState('');
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [staffEmail, setStaffEmail] = useState('Staff ClickPar');
    const [showCustomerInfo, setShowCustomerInfo] = useState(false);
    const [customerInfo, setCustomerInfo] = useState<any>(null);
    const [customerInfoLoading, setCustomerInfoLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevUnreadRef = useRef(0);

    // ── Fetch current staff identity ─────────────────────────────────────────
    useEffect(() => {
        fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
            if (d?.email) setStaffEmail(d.email.split('@')[0]);
        }).catch(() => {});
    }, []);

    // ── Notification sound on new messages ────────────────────────────────────
    useEffect(() => {
        const currentUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        if (currentUnread > prevUnreadRef.current && prevUnreadRef.current >= 0) {
            try {
                const audio = new Audio('/sounds/notification.wav');
                audio.volume = 0.4;
                audio.play().catch(() => {});
            } catch { /* silent */ }
            // Browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('ClickPar — Nuevo mensaje', {
                    body: 'Tenés un nuevo mensaje de un cliente',
                    icon: '/favicon.ico',
                });
            }
        }
        prevUnreadRef.current = currentUnread;
    }, [conversations]);

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // ── Load customer info panel ──────────────────────────────────────────────
    const loadCustomerInfo = async (convId: string) => {
        setCustomerInfoLoading(true);
        try {
            const res = await fetch(`/api/conversations/${convId}/customer-info`);
            if (res.ok) {
                setCustomerInfo(await res.json());
            }
        } catch { /* silent */ }
        setCustomerInfoLoading(false);
    };

    useEffect(() => {
        if (showCustomerInfo && selectedConv) {
            loadCustomerInfo(selectedConv.id);
        }
    }, [showCustomerInfo, selectedConv?.id]);

    // ── Load conversations ───────────────────────────────────────────────────

    const loadConversations = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        const res = await fetch(`/api/conversations?status=${statusFilter}&search=${encodeURIComponent(search)}&limit=60`);
        const data = await res.json();
        setConversations(data.conversations || []);
        setLoading(false);
        setRefreshing(false);
    }, [statusFilter, search]);

    useEffect(() => { loadConversations(); }, [statusFilter, search]);

    // Auto-refresh every 20 seconds
    useEffect(() => {
        const t = setInterval(() => loadConversations(true), 20000);
        return () => clearInterval(t);
    }, [loadConversations]);

    // ── Load messages for selected conversation ──────────────────────────────

    const loadMessages = async (convId: string) => {
        setMessagesLoading(true);
        const res = await fetch(`/api/conversations/${convId}/messages`);
        const data = await res.json();
        setMessages(data.messages || []);
        setMessagesLoading(false);
        // Update unread count in list
        setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, unread_count: 0 } : c
        ));
    };

    useEffect(() => {
        if (selectedConv) loadMessages(selectedConv.id);
    }, [selectedConv?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Send reply ───────────────────────────────────────────────────────────

    const sendReply = async () => {
        if (!replyText.trim() || !selectedConv || sending) return;
        setSending(true);
        const text = replyText.trim();
        setReplyText('');

        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reply',
                conversationId: selectedConv.id,
                message: text,
                staffName: staffEmail,
            }),
        });

        if (res.ok) {
            await loadMessages(selectedConv.id);
        }
        setSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendReply();
        }
    };

    // ── Mark resolved ────────────────────────────────────────────────────────

    const markResolved = async () => {
        if (!selectedConv) return;
        await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark-resolved', conversationId: selectedConv.id }),
        });
        setSelectedConv(null);
        loadConversations(true);
    };

    // ── Send credentials ─────────────────────────────────────────────────────

    const sendCredentials = async () => {
        if (!selectedConv || sendingCredentials) return;
        const activeSaleId = selectedConv.customer?.sales?.find((s: any) => s.is_active)?.id;
        if (!activeSaleId) return;

        setSendingCredentials(true);
        setCredentialsFeedback(null);
        const res = await fetch('/api/whatsapp/send-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleId: activeSaleId }),
        });
        const data = await res.json();
        if (res.ok) {
            setCredentialsFeedback('✅ Credenciales enviadas');
            await loadMessages(selectedConv.id);
        } else {
            setCredentialsFeedback(`❌ ${data.error || 'Error al enviar'}`);
        }
        setSendingCredentials(false);
        setTimeout(() => setCredentialsFeedback(null), 4000);
    };

    // ── Assign to self ───────────────────────────────────────────────────────

    const assignToSelf = async () => {
        if (!selectedConv || assigning) return;
        setAssigning(true);
        // Get current user email from Supabase auth
        let staffEmail = 'staff';
        try {
            const res = await fetch('/api/auth/me').catch(() => null);
            if (res?.ok) {
                const d = await res.json();
                staffEmail = d.email || 'staff';
            }
        } catch { /* use default */ }

        await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'assign', conversationId: selectedConv.id, assignedTo: staffEmail }),
        });
        setSelectedConv(prev => prev ? { ...prev, assigned_to: staffEmail } : prev);
        setAssigning(false);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    const activeSale = selectedConv?.customer?.sales?.find((s: any) => s.is_active);

    // Group messages by date for separators
    const groupedMessages: { date: string; msgs: Message[] }[] = [];
    messages.forEach(msg => {
        const date = new Date(msg.created_at).toDateString();
        const last = groupedMessages[groupedMessages.length - 1];
        if (last && last.date === date) {
            last.msgs.push(msg);
        } else {
            groupedMessages.push({ date, msgs: [msg] });
        }
    });

    return (
        <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border/50 bg-card">

            {/* ── Left panel: Conversation list ─────────────────────────── */}
            <div className="w-80 flex-shrink-0 flex flex-col border-r border-border/30">

                {/* Header */}
                <div className="p-4 border-b border-border/30">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Inbox className="h-5 w-5 text-[#86EFAC]" />
                            <h1 className="font-semibold text-foreground">Conversaciones</h1>
                            {totalUnread > 0 && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#86EFAC] text-[10px] font-bold text-black">
                                    {totalUnread > 99 ? '99+' : totalUnread}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => loadConversations(true)}
                            disabled={refreshing}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar cliente o teléfono..."
                            className="w-full rounded-xl bg-muted/40 border border-border/40 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[#86EFAC]/50"
                        />
                    </div>

                    {/* Status filter */}
                    <div className="flex gap-1">
                        {(['open', 'waiting', 'resolved', 'all'] as const).map(s => {
                            const labels = { open: 'Abiertos', waiting: 'Espera', resolved: 'Resueltos', all: 'Todos' };
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
                                        statusFilter === s
                                            ? 'bg-[#86EFAC]/20 text-[#86EFAC] border border-[#86EFAC]/30'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {labels[s]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                            <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground">
                                {statusFilter === 'open' ? 'No hay conversaciones abiertas' : 'Sin conversaciones aquí'}
                            </p>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <ConvItem
                                key={conv.id}
                                conv={conv}
                                selected={selectedConv?.id === conv.id}
                                onClick={() => setSelectedConv(conv)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── Right panel: Chat ─────────────────────────────────────── */}
            {selectedConv ? (
                <>
                <div className="flex-1 flex flex-col min-w-0">

                    {/* Chat header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-card">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-full bg-[#86EFAC]/20 border border-[#86EFAC]/30 flex items-center justify-center flex-shrink-0">
                                <User className="h-4 w-4 text-[#86EFAC]" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate">
                                    {selectedConv.customer?.full_name || selectedConv.wa_phone || 'Desconocido'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                        {selectedConv.wa_phone || selectedConv.customer?.phone || 'Sin teléfono'}
                                    </span>
                                    {activeSale && (
                                        <span className="text-[10px] bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">
                                            📺 {activeSale.sale_slots?.[0]?.mother_accounts?.platform} · vence {activeSale.end_date}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Send credentials button — only if active sale exists */}
                            {selectedConv.customer?.sales?.some((s: any) => s.is_active) && (
                                <button
                                    onClick={sendCredentials}
                                    disabled={sendingCredentials}
                                    title="Enviar credenciales de la venta activa por WhatsApp"
                                    className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                >
                                    {sendingCredentials
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Package className="h-3.5 w-3.5" />}
                                    Credenciales
                                </button>
                            )}

                            {/* Assign to self */}
                            <button
                                onClick={assignToSelf}
                                disabled={assigning}
                                title={selectedConv.assigned_to ? `Asignado a: ${selectedConv.assigned_to}` : 'Asignarme esta conversación'}
                                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    selectedConv.assigned_to
                                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                                        : 'border-border/40 text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <UserCheck className="h-3.5 w-3.5" />
                                {selectedConv.assigned_to
                                    ? selectedConv.assigned_to.split('@')[0]
                                    : 'Asignarme'}
                            </button>

                            {selectedConv.status !== 'resolved' && (
                                <button
                                    onClick={markResolved}
                                    className="flex items-center gap-1.5 rounded-xl bg-[#86EFAC]/10 border border-[#86EFAC]/30 px-3 py-1.5 text-xs font-medium text-[#86EFAC] hover:bg-[#86EFAC]/20 transition-colors"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Resolver
                                </button>
                            )}
                            <button
                                onClick={() => setSelectedConv(null)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            {/* Toggle customer info panel */}
                            <button
                                onClick={() => setShowCustomerInfo(v => !v)}
                                className={`rounded-lg p-1.5 transition-colors ${
                                    showCustomerInfo
                                        ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="Info del cliente"
                            >
                                <Info className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Credentials feedback toast */}
                    {credentialsFeedback && (
                        <div className="px-5 py-2 bg-muted/30 border-b border-border/20 text-xs text-center text-foreground">
                            {credentialsFeedback}
                        </div>
                    )}

                    {/* Messages area */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 bg-background/40">
                        {messagesLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-12 text-center">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                                <p className="text-xs text-muted-foreground">Sin mensajes aún</p>
                            </div>
                        ) : (
                            <>
                                {groupedMessages.map(group => (
                                    <div key={group.date}>
                                        <DateSeparator date={group.msgs[0].created_at} />
                                        {group.msgs.map(msg => (
                                            <MessageBubble key={msg.id} msg={msg} />
                                        ))}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>

                    {/* Quick replies */}
                    {showQuickReplies && (
                        <div className="px-4 py-2 border-t border-border/20 bg-card flex gap-2 flex-wrap">
                            {QUICK_REPLIES.map(qr => (
                                <button
                                    key={qr.label}
                                    onClick={() => {
                                        setReplyText(qr.text);
                                        setShowQuickReplies(false);
                                        textareaRef.current?.focus();
                                    }}
                                    className="rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-[#86EFAC]/40 transition-colors"
                                >
                                    {qr.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Reply input */}
                    <div className="px-4 py-3 border-t border-border/30 bg-card">
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => setShowQuickReplies(v => !v)}
                                className={`flex-shrink-0 rounded-xl p-2 border transition-colors ${
                                    showQuickReplies
                                        ? 'bg-[#86EFAC]/20 border-[#86EFAC]/30 text-[#86EFAC]'
                                        : 'border-border/40 text-muted-foreground hover:text-foreground'
                                }`}
                                title="Respuestas rápidas"
                            >
                                <Zap className="h-4 w-4" />
                            </button>
                            <textarea
                                ref={textareaRef}
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Escribí tu respuesta... (Enter para enviar, Shift+Enter nueva línea)"
                                rows={2}
                                className="flex-1 resize-none rounded-xl bg-muted/40 border border-border/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[#86EFAC]/50 transition-colors"
                            />
                            <button
                                onClick={sendReply}
                                disabled={!replyText.trim() || sending}
                                className="flex-shrink-0 rounded-xl bg-[#86EFAC] p-2.5 text-black hover:bg-[#86EFAC]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground/50 text-right">
                            Enter → enviar · Shift+Enter → nueva línea
                        </p>
                    </div>
                </div>

                {/* ── Customer Info Sidebar ─────────────────────────────── */}
                {showCustomerInfo && (
                    <div className="w-72 flex-shrink-0 border-l border-border/30 bg-card overflow-y-auto">
                        <div className="p-4 border-b border-border/30 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">Info del Cliente</h3>
                            <button onClick={() => setShowCustomerInfo(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {customerInfoLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : customerInfo ? (
                            <div className="p-4 space-y-4">
                                {/* Contact */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contacto</p>
                                    <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                                        <p className="text-sm font-semibold text-foreground">{customerInfo.customer?.full_name}</p>
                                        <div className="flex items-center gap-1.5">
                                            <Phone className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">{customerInfo.wa_phone || customerInfo.customer?.phone}</span>
                                        </div>
                                        {customerInfo.customer?.email && (
                                            <p className="text-xs text-muted-foreground">📧 {customerInfo.customer.email}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Active Sales */}
                                {customerInfo.active_sales?.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ventas Activas</p>
                                        {customerInfo.active_sales.map((sale: any) => (
                                            <div key={sale.id} className="bg-[#86EFAC]/5 border border-[#86EFAC]/20 rounded-xl p-3 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-[#86EFAC]">
                                                        📺 {sale.sale_slots?.mother_accounts?.platform || 'N/A'}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {sale.amount_gs?.toLocaleString()} Gs
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-[11px] text-muted-foreground">Vence: {sale.end_date}</span>
                                                </div>
                                                {sale.sale_slots?.slot_identifier && (
                                                    <p className="text-[10px] text-muted-foreground">Slot: {sale.sale_slots.slot_identifier}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Open Tickets */}
                                {customerInfo.tickets?.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tickets Abiertos</p>
                                        {customerInfo.tickets.map((t: any) => (
                                            <div key={t.id} className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                                                <div className="flex items-center gap-1.5">
                                                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                                                    <span className="text-xs text-foreground">{t.subject}</span>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-1">{t.status} · {timeAgo(t.created_at)}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Past Sales */}
                                {customerInfo.past_sales?.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial</p>
                                        {customerInfo.past_sales.map((sale: any) => (
                                            <div key={sale.id} className="bg-muted/20 rounded-lg p-2 space-y-0.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {sale.sale_slots?.mother_accounts?.platform || '?'}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground/60">
                                                        {sale.end_date}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                                <User className="h-6 w-6 text-muted-foreground/40" />
                                <p className="text-xs text-muted-foreground">Sin información disponible</p>
                            </div>
                        )}
                    </div>
                )}
                </>
            ) : (
                /* Empty state */
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                    <div className="h-16 w-16 rounded-2xl bg-[#86EFAC]/10 border border-[#86EFAC]/20 flex items-center justify-center">
                        <MessageSquare className="h-8 w-8 text-[#86EFAC]/60" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-foreground mb-1">Seleccioná una conversación</h2>
                        <p className="text-sm text-muted-foreground">
                            Elegí un chat de la lista para empezar a responder
                        </p>
                    </div>
                    {totalUnread > 0 && (
                        <p className="text-xs text-[#86EFAC]">
                            {totalUnread} mensaje{totalUnread !== 1 ? 's' : ''} sin leer
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
