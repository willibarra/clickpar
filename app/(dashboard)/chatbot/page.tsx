'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Bot, RefreshCw, CheckCircle2, AlertTriangle, MessageSquare,
    Users, Zap, Clock, CreditCard, Copy, Check, ChevronDown,
    ChevronUp, Wifi, WifiOff, Settings, ExternalLink, Phone,
    CircleDot, X, FlaskConical, Plus, Trash2, ShieldCheck, ShieldOff
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ─── Types ────────────────────────────────────────────────── */
interface ChatbotStats {
    total_conversations: number;
    active: number;
    escalated: number;
    needs_human: number;
    today_messages: number;
    today_ai_handled: number;
}
interface Conversation {
    id: string;
    phone: string;
    last_message_at: string;
    last_message: string | null;
    turn_count: number;
    ai_handled: boolean;
    needs_human: boolean;
    status: 'active' | 'resolved' | 'escalated';
    customer_name: string | null;
    metadata: Record<string, any>;
}
interface IncomingMessage {
    id: string;
    phone: string;
    text: string;
    received_at: string;
    instance_name: string | null;
    n8n_handled: boolean;
    intent: string | null;
}
interface PaymentMethod {
    id: string;
    key: string;
    name: string;
    emoji: string;
    instructions: string;
    is_active: boolean;
    sort_order: number;
}
interface ChatbotData {
    stats: ChatbotStats;
    conversations: Conversation[];
    recent_messages: IncomingMessage[];
    payment_methods: PaymentMethod[];
    settings: { n8n_enabled: boolean; whitelist_enabled: boolean };
    whitelist_phones: string[];
    whitelist_enabled: boolean;
    webhook_url: string;
}

/* ─── Helpers ──────────────────────────────────────────────── */
function timeAgo(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function statusBadge(status: string, needsHuman: boolean) {
    if (needsHuman) return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-xs">⚡ Escalado</Badge>;
    if (status === 'resolved') return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">✅ Resuelto</Badge>;
    if (status === 'active') return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">🤖 AI Activo</Badge>;
    return <Badge className="bg-muted text-muted-foreground text-xs">{status}</Badge>;
}

/* ─── Sub-components ────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }: {
    icon: React.ElementType; label: string; value: number | string; color: string;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color)}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
            </div>
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={handleCopy}
            className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export default function ChatbotPage() {
    const [data, setData] = useState<ChatbotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'conversations' | 'messages' | 'payments' | 'config'>('conversations');
    const [editingPayment, setEditingPayment] = useState<string | null>(null);
    const [editInstructions, setEditInstructions] = useState('');
    const [savingPayment, setSavingPayment] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [togglingChatbot, setTogglingChatbot] = useState(false);
    // Whitelist state
    const [whitelistPhones, setWhitelistPhones] = useState<string[]>([]);
    const [whitelistEnabled, setWhitelistEnabled] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [savingWhitelist, setSavingWhitelist] = useState(false);
    const [togglingWhitelist, setTogglingWhitelist] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/n8n/chatbot-stats');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Sync whitelist from API data
    useEffect(() => {
        if (data) {
            setWhitelistPhones(data.whitelist_phones || []);
            setWhitelistEnabled(data.whitelist_enabled || false);
        }
    }, [data]);

    const resolveConversation = async (id: string) => {
        setResolvingId(id);
        try {
            await fetch('/api/n8n/chatbot-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resolve-conversation', conversation_id: id }),
            });
            await fetchData();
        } finally {
            setResolvingId(null);
        }
    };

    const savePaymentMethod = async (id: string) => {
        setSavingPayment(true);
        try {
            await fetch('/api/n8n/chatbot-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update-payment-method', method_id: id, instructions: editInstructions }),
            });
            setEditingPayment(null);
            await fetchData();
        } finally {
            setSavingPayment(false);
        }
    };

    const togglePaymentActive = async (id: string, is_active: boolean) => {
        await fetch('/api/n8n/chatbot-stats', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-payment-method', method_id: id, is_active }),
        });
        await fetchData();
    };

    const toggleChatbot = async (enabled: boolean) => {
        setTogglingChatbot(true);
        try {
            await fetch('/api/n8n/chatbot-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle-chatbot', enabled }),
            });
            await fetchData();
        } finally {
            setTogglingChatbot(false);
        }
    };

    const addPhone = () => {
        const trimmed = newPhone.trim().replace(/\s/g, '');
        if (!trimmed) return;
        // Normalize: strip non-digits, add 595 prefix if needed
        const digits = trimmed.replace(/\D/g, '');
        const normalized = digits.startsWith('595') ? digits
            : digits.startsWith('0') ? '595' + digits.slice(1)
            : '595' + digits;
        if (whitelistPhones.includes(normalized)) {
            setNewPhone('');
            return;
        }
        setWhitelistPhones(prev => [...prev, normalized]);
        setNewPhone('');
    };

    const removePhone = (phone: string) => {
        setWhitelistPhones(prev => prev.filter(p => p !== phone));
    };

    const saveWhitelist = async () => {
        setSavingWhitelist(true);
        try {
            await fetch('/api/n8n/chatbot-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set-whitelist', phones: whitelistPhones }),
            });
            await fetchData();
        } finally {
            setSavingWhitelist(false);
        }
    };

    const toggleWhitelist = async (enabled: boolean) => {
        setTogglingWhitelist(true);
        try {
            await fetch('/api/n8n/chatbot-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle-whitelist', enabled }),
            });
            setWhitelistEnabled(enabled);
            await fetchData();
        } finally {
            setTogglingWhitelist(false);
        }
    };

    const tabs = [
        { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
        { id: 'messages', label: 'Mensajes', icon: Phone },
        { id: 'payments', label: 'Pagos', icon: CreditCard },
        { id: 'config', label: 'Configuración', icon: Settings },
    ] as const;

    const needsHumanConvs = data?.conversations.filter(c => c.needs_human) || [];
    const otherConvs = data?.conversations.filter(c => !c.needs_human) || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Bot className="h-6 w-6 text-[#86EFAC]" />
                        Chatbot IA
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Monitoreo y configuración del agente de WhatsApp automatizado
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {data && (
                        <div className={cn(
                            'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border',
                            data.settings.n8n_enabled
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                        )}>
                            {data.settings.n8n_enabled
                                ? <><Wifi className="h-3 w-3" /> Bot Activo</>
                                : <><WifiOff className="h-3 w-3" /> Bot Inactivo</>
                            }
                        </div>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="gap-1.5"
                    >
                        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        Actualizar
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCard
                        icon={MessageSquare}
                        label="Conversaciones"
                        value={data.stats.total_conversations}
                        color="bg-blue-500/10 text-blue-400"
                    />
                    <StatCard
                        icon={Bot}
                        label="AI Activo"
                        value={data.stats.active}
                        color="bg-[#86EFAC]/10 text-[#86EFAC]"
                    />
                    <StatCard
                        icon={AlertTriangle}
                        label="Necesitan atención"
                        value={data.stats.needs_human}
                        color={data.stats.needs_human > 0 ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}
                    />
                    <StatCard
                        icon={CheckCircle2}
                        label="Escalados"
                        value={data.stats.escalated}
                        color="bg-yellow-500/10 text-yellow-400"
                    />
                    <StatCard
                        icon={Zap}
                        label="Mensajes hoy"
                        value={data.stats.today_messages}
                        color="bg-purple-500/10 text-purple-400"
                    />
                    <StatCard
                        icon={Users}
                        label="Manejados por AI hoy"
                        value={data.stats.today_ai_handled}
                        color="bg-orange-500/10 text-orange-400"
                    />
                </div>
            )}

            {/* ⚠️ Urgent: Needs Human Banner */}
            {needsHumanConvs.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-400">
                            {needsHumanConvs.length} conversación{needsHumanConvs.length > 1 ? 'es' : ''} requieren atención humana
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            El AI no pudo resolver estas consultas. Revisalas en la pestaña Conversaciones.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('conversations')}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs flex-shrink-0"
                    >
                        Ver ahora
                    </Button>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border">
                <div className="flex gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
                                'border-b-2 -mb-px',
                                activeTab === tab.id
                                    ? 'border-[#86EFAC] text-[#86EFAC]'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                            {tab.id === 'conversations' && needsHumanConvs.length > 0 && (
                                <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold">
                                    {needsHumanConvs.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            {loading && !data ? (
                <div className="flex h-48 items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-[#86EFAC]" />
                </div>
            ) : (
                <>
                    {/* ── CONVERSATIONS ── */}
                    {activeTab === 'conversations' && (
                        <div className="space-y-3">
                            {/* Urgent first */}
                            {needsHumanConvs.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider px-1">
                                        ⚡ Requieren Atención
                                    </p>
                                    {needsHumanConvs.map((conv) => (
                                        <ConversationRow
                                            key={conv.id}
                                            conv={conv}
                                            onResolve={resolveConversation}
                                            resolvingId={resolvingId}
                                            urgent
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Others */}
                            {otherConvs.length > 0 && (
                                <div className="space-y-2">
                                    {needsHumanConvs.length > 0 && (
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2">
                                            Otras Conversaciones
                                        </p>
                                    )}
                                    {otherConvs.map((conv) => (
                                        <ConversationRow
                                            key={conv.id}
                                            conv={conv}
                                            onResolve={resolveConversation}
                                            resolvingId={resolvingId}
                                        />
                                    ))}
                                </div>
                            )}

                            {(data?.conversations || []).length === 0 && (
                                <EmptyState icon={MessageSquare} message="No hay conversaciones aún. Cuando alguien escriba al WhatsApp conectado, aparecerá aquí." />
                            )}
                        </div>
                    )}

                    {/* ── MESSAGES ── */}
                    {activeTab === 'messages' && (
                        <div className="space-y-2">
                            <div className="rounded-xl border border-border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/40">
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Teléfono</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Mensaje</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Intent</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">AI</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Hora</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data?.recent_messages || []).map((msg) => (
                                            <tr key={msg.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{msg.phone}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground max-w-[300px]">
                                                    <p className="truncate text-xs">{msg.text}</p>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {msg.intent ? (
                                                        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                                                            {msg.intent}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {msg.n8n_handled
                                                        ? <span className="text-[#86EFAC] text-xs">✓ AI</span>
                                                        : <span className="text-muted-foreground text-xs">—</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                                    {timeAgo(msg.received_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {(data?.recent_messages || []).length === 0 && (
                                    <div className="py-12 text-center text-muted-foreground text-sm">
                                        No hay mensajes recibidos todavía
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── PAYMENT METHODS ── */}
                    {activeTab === 'payments' && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Configurá las instrucciones de pago que el chatbot envía a los clientes cuando quieren renovar.
                            </p>
                            {(data?.payment_methods || []).map((pm) => (
                                <div
                                    key={pm.id}
                                    className={cn(
                                        'rounded-xl border bg-card p-4 transition-colors',
                                        pm.is_active ? 'border-border' : 'border-border/40 opacity-60'
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{pm.emoji}</span>
                                            <span className="font-semibold text-foreground">{pm.name}</span>
                                            <Badge className="text-xs bg-muted text-muted-foreground border-border font-mono">
                                                {pm.key}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    {pm.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                                <Switch
                                                    checked={pm.is_active}
                                                    onCheckedChange={(checked) => togglePaymentActive(pm.id, checked)}
                                                />
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    if (editingPayment === pm.id) {
                                                        setEditingPayment(null);
                                                    } else {
                                                        setEditingPayment(pm.id);
                                                        setEditInstructions(pm.instructions);
                                                    }
                                                }}
                                                className="text-xs"
                                            >
                                                {editingPayment === pm.id ? (
                                                    <><ChevronUp className="h-3 w-3 mr-1" />Cancelar</>
                                                ) : (
                                                    <><Settings className="h-3 w-3 mr-1" />Editar</>
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    {editingPayment === pm.id ? (
                                        <div className="space-y-2">
                                            <Textarea
                                                value={editInstructions}
                                                onChange={(e) => setEditInstructions(e.target.value)}
                                                rows={6}
                                                className="font-mono text-xs resize-none"
                                                placeholder="Instrucciones de pago..."
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditingPayment(null)}
                                                    className="text-xs"
                                                >
                                                    Cancelar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => savePaymentMethod(pm.id)}
                                                    disabled={savingPayment}
                                                    className="text-xs bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                                >
                                                    {savingPayment ? (
                                                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                                    ) : (
                                                        <Check className="h-3 w-3 mr-1" />
                                                    )}
                                                    Guardar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 rounded-lg p-3">
                                            {pm.instructions}
                                        </pre>
                                    )}
                                </div>
                            ))}

                            {(data?.payment_methods || []).length === 0 && (
                                <EmptyState icon={CreditCard} message="No se encontraron métodos de pago. Ejecutá la migración payment_methods.sql en tu base de datos." />
                            )}
                        </div>
                    )}

                    {/* ── CONFIG ── */}
                    {activeTab === 'config' && data && (
                        <div className="space-y-4">
                            {/* Bot on/off */}
                            <div className="rounded-xl border border-border bg-card p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-foreground">Estado del Chatbot</h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            Activar o desactivar el procesamiento automático de mensajes por N8N/AI.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            'text-sm font-medium',
                                            data.settings.n8n_enabled ? 'text-[#86EFAC]' : 'text-muted-foreground'
                                        )}>
                                            {data.settings.n8n_enabled ? 'Activo' : 'Inactivo'}
                                        </span>
                                        <Switch
                                            checked={data.settings.n8n_enabled}
                                            onCheckedChange={toggleChatbot}
                                            disabled={togglingChatbot}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Webhook URL */}
                            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                                <div>
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        <Wifi className="h-4 w-4 text-[#86EFAC]" />
                                        Webhook de Evolution API
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Configurá este URL como Global Webhook en Evolution API para que los mensajes entrantes sean procesados por el chatbot.
                                    </p>
                                </div>

                                <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 flex items-center justify-between gap-2">
                                    <code className="text-xs text-[#86EFAC] font-mono flex-1 break-all">
                                        {data.webhook_url}
                                    </code>
                                    <CopyButton text={data.webhook_url} />
                                </div>

                                <div className="space-y-3 text-sm text-muted-foreground">
                                    <p className="font-medium text-foreground text-sm">Pasos para configurar:</p>
                                    <ol className="space-y-2 list-decimal list-inside text-sm">
                                        <li>Abrí el panel de Evolution API</li>
                                        <li>Andá a <strong className="text-foreground">Settings → Global Webhook</strong></li>
                                        <li>Pegá la URL de arriba como Webhook URL</li>
                                        <li>Activá el evento <strong className="text-foreground">messages.upsert</strong></li>
                                        <li>Guardá los cambios</li>
                                    </ol>
                                </div>
                            </div>

                            {/* N8N connection */}
                            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-[#86EFAC]" />
                                    Flujo N8N
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    N8N orquesta la IA y llama a los endpoints de ClickPar. El webhook configurado en N8N es:
                                </p>

                                <div className="space-y-2">
                                    <WebhookRow label="Incoming (N8N recibe)" url={process.env.NEXT_PUBLIC_APP_URL ? undefined : 'https://n8n.clickpar.shop/webhook/clickpar-incoming-support'} />
                                </div>

                                <div className="space-y-2 pt-2">
                                    <p className="text-xs font-medium text-foreground">Endpoints que N8N usa (ya implementados):</p>
                                    <div className="space-y-1.5">
                                        {[
                                            { path: '/api/n8n/customer-lookup', desc: 'Identifica cliente por teléfono' },
                                            { path: '/api/n8n/conversation-history', desc: 'Historial de mensajes para contexto AI' },
                                            { path: '/api/n8n/renewal-data', desc: 'Datos de renovación por cliente/venta' },
                                            { path: '/api/n8n/customer-support', desc: 'URL de soporte generada por AI' },
                                            { path: '/api/n8n/payment-methods', desc: 'Métodos de pago activos' },
                                            { path: '/api/n8n/send-message', desc: 'Enviar respuesta AI al cliente' },
                                            { path: '/api/n8n/payment-confirm', desc: 'Confirmar pago (PagoPar/Bancard/manual)' },
                                        ].map((ep) => (
                                            <div key={ep.path} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
                                                <CircleDot className="h-3 w-3 text-[#86EFAC] flex-shrink-0" />
                                                <code className="text-xs text-foreground/80 font-mono flex-1">{ep.path}</code>
                                                <span className="text-xs text-muted-foreground flex-1">{ep.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Secret para autenticación de N8N → ClickPar:
                                    </p>
                                    <div className="rounded-lg bg-muted/50 border border-border px-4 py-2 flex items-center gap-2">
                                        <code className="text-xs font-mono text-yellow-400">x-n8n-secret: clickpar-n8n-2024</code>
                                        <CopyButton text="clickpar-n8n-2024" />
                                    </div>
                                </div>
                            </div>

                            {/* ── WHITELIST: Números de Prueba ── */}
                            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        <FlaskConical className="h-4 w-4 text-[#86EFAC]" />
                                        Números de Prueba
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            'text-xs font-medium flex items-center gap-1',
                                            whitelistEnabled ? 'text-yellow-400' : 'text-muted-foreground'
                                        )}>
                                            {whitelistEnabled
                                                ? <><ShieldCheck className="h-3.5 w-3.5" /> Modo prueba activo</>  
                                                : <><ShieldOff className="h-3.5 w-3.5" /> Envío a todos</>}
                                        </span>
                                        <Switch
                                            checked={whitelistEnabled}
                                            onCheckedChange={toggleWhitelist}
                                            disabled={togglingWhitelist}
                                        />
                                    </div>
                                </div>

                                <p className="text-sm text-muted-foreground">
                                    {whitelistEnabled
                                        ? <><strong className="text-yellow-400">Modo prueba activado:</strong> Solo estos números recibirán mensajes automáticos del chatbot. Perfecto para testear sin molestar a clientes reales.</>
                                        : <>Modo normal: <strong className="text-foreground">todos los clientes</strong> reciben mensajes automáticos. Activá el modo prueba para restringir el envío a los números de abajo.</>   
                                    }
                                </p>

                                {/* Add phone input */}
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <input
                                            id="whitelist-phone-input"
                                            type="tel"
                                            value={newPhone}
                                            onChange={e => setNewPhone(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addPhone()}
                                            placeholder="Ej: 0973682124 o 595973682124"
                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/40 focus:border-[#86EFAC]/60"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={addPhone}
                                        disabled={!newPhone.trim()}
                                        className="gap-1.5 bg-[#86EFAC]/10 text-[#86EFAC] border border-[#86EFAC]/30 hover:bg-[#86EFAC]/20"
                                        variant="outline"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Agregar
                                    </Button>
                                </div>

                                {/* Phone list */}
                                {whitelistPhones.length > 0 ? (
                                    <div className="space-y-1.5">
                                        {whitelistPhones.map((phone) => (
                                            <div
                                                key={phone}
                                                className="flex items-center justify-between rounded-lg bg-[#86EFAC]/5 border border-[#86EFAC]/15 px-3 py-2 group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-[#86EFAC]" />
                                                    <code className="text-sm font-mono text-foreground">{phone}</code>
                                                </div>
                                                <button
                                                    onClick={() => removePhone(phone)}
                                                    className="text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar número"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-border/60 py-6 text-center">
                                        <FlaskConical className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-40" />
                                        <p className="text-xs text-muted-foreground">
                                            {whitelistEnabled
                                                ? '⚠️ Lista vacía — nadie recibirá mensajes mientras el modo prueba está activo'
                                                : 'No hay números en la lista. Agreá números para usar el modo prueba.'}
                                        </p>
                                    </div>
                                )}

                                {/* Save button */}
                                <div className="flex items-center justify-between pt-1">
                                    <p className="text-xs text-muted-foreground">
                                        {whitelistPhones.length === 0
                                            ? 'Sin números guardados'
                                            : `${whitelistPhones.length} número${whitelistPhones.length > 1 ? 's' : ''} en la lista`
                                        }
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={saveWhitelist}
                                        disabled={savingWhitelist}
                                        className="gap-1.5 bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 text-xs"
                                    >
                                        {savingWhitelist
                                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                                            : <Check className="h-3 w-3" />
                                        }
                                        Guardar lista
                                    </Button>
                                </div>
                            </div>

                            {/* DB Migrations Status */}
                            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <Settings className="h-4 w-4 text-[#86EFAC]" />
                                    Tablas de Base de Datos
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Estas tablas deben existir en producción para que el chatbot funcione:
                                </p>
                                <div className="grid gap-2">
                                    {[
                                        { name: 'whatsapp_incoming_log', desc: 'Mensajes entrantes recibidos', ok: (data?.recent_messages?.length !== undefined) },
                                        { name: 'whatsapp_conversations', desc: 'Sesiones de conversación AI', ok: (data?.conversations?.length !== undefined) },
                                        { name: 'payment_methods', desc: 'Métodos de pago para renovación', ok: (data?.payment_methods?.length !== undefined) },
                                        { name: 'pending_payments', desc: 'Órdenes de pago pendientes', ok: true },
                                    ].map((table) => (
                                        <div key={table.name} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
                                            <span className={table.ok ? 'text-[#86EFAC]' : 'text-red-400'}>
                                                {table.ok ? '✅' : '❌'}
                                            </span>
                                            <code className="text-xs font-mono text-foreground/80">{table.name}</code>
                                            <span className="text-xs text-muted-foreground ml-auto">{table.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ─── ConversationRow ────────────────────────────────────────── */
function ConversationRow({
    conv,
    onResolve,
    resolvingId,
    urgent,
}: {
    conv: Conversation;
    onResolve: (id: string) => void;
    resolvingId: string | null;
    urgent?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={cn(
            'rounded-xl border bg-card overflow-hidden transition-all',
            urgent ? 'border-red-500/30' : 'border-border',
        )}>
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className={cn(
                    'h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold',
                    urgent ? 'bg-red-500/15 text-red-400' : 'bg-[#86EFAC]/10 text-[#86EFAC]'
                )}>
                    {conv.customer_name ? conv.customer_name.charAt(0).toUpperCase() : '?'}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                            {conv.customer_name || conv.phone}
                        </span>
                        {statusBadge(conv.status, conv.needs_human)}
                    </div>
                    {conv.last_message && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message}</p>
                    )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                        <p className="text-xs text-muted-foreground">{timeAgo(conv.last_message_at)}</p>
                        <p className="text-[10px] text-muted-foreground/60">{conv.turn_count} turnos</p>
                    </div>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Teléfono</p>
                            <p className="text-xs font-mono text-foreground">{conv.phone}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estado</p>
                            <p className="text-xs text-foreground">{conv.status}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Turnos</p>
                            <p className="text-xs text-foreground">{conv.turn_count}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Manejó</p>
                            <p className="text-xs text-foreground">{conv.ai_handled ? 'Sí' : 'No'}</p>
                        </div>
                    </div>

                    {conv.metadata?.last_intent && (
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Último Intent</p>
                            <Badge className="mt-1 bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                                {conv.metadata.last_intent}
                            </Badge>
                        </div>
                    )}

                    {conv.status !== 'resolved' && (
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onResolve(conv.id)}
                                disabled={resolvingId === conv.id}
                                className="text-xs gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            >
                                {resolvingId === conv.id ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                )}
                                Marcar como resuelto
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── WebhookRow ─────────────────────────────────────────────── */
function WebhookRow({ label, url }: { label: string; url?: string }) {
    const displayUrl = url || 'https://n8n.clickpar.shop/webhook/clickpar-incoming-support';
    return (
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">{label}:</span>
            <code className="text-xs font-mono text-blue-400 flex-1 break-all">{displayUrl}</code>
            <CopyButton text={displayUrl} />
        </div>
    );
}

/* ─── EmptyState ─────────────────────────────────────────────── */
function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
        </div>
    );
}
