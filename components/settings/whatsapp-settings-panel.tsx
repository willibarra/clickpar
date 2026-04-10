'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare, Wifi, WifiOff, RefreshCw, Send, Settings2,
    Check, X, QrCode, Smartphone, Edit3, Eye,
    ArrowLeftRight, Hash, ToggleLeft, Loader2,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Instance = {
    name: string;
    connected: boolean;
    profileName?: string;
    ownerJid?: string;
};

type Template = {
    id: string;
    key: string;
    name: string;
    message: string;
    enabled: boolean;
    variant: number;
};

type Settings = {
    send_mode: 'alternate' | 'instance-1' | 'instance-2';
    instance_1_name: string;
    instance_2_name: string;
    instance_1_alias: string;
    instance_2_alias: string;
    auto_send_credentials: boolean;
    auto_send_pre_expiry: boolean;
    auto_send_expiry: boolean;
    auto_send_credential_change: boolean;
    pre_expiry_days: number;
    batch_send_interval_seconds: number;
};

type LogEntry = {
    id: string;
    template_key: string;
    phone: string;
    message: string;
    instance_used: string;
    status: string;
    created_at: string;
};

const TEMPLATE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    venta_credenciales: { label: '📦 Credenciales de Venta', icon: '📦', color: 'text-green-400' },
    pre_vencimiento: { label: '⏰ Pre-Vencimiento', icon: '⏰', color: 'text-yellow-400' },
    vencimiento_hoy: { label: '🔴 Vencimiento', icon: '🔴', color: 'text-red-400' },
    vencimiento_vencido: { label: '⚠️ Servicio Vencido', icon: '⚠️', color: 'text-orange-400' },
    credenciales_actualizadas: { label: '🔄 Credenciales Actualizadas', icon: '🔄', color: 'text-blue-400' },
};

// Ordered keys for display
const TEMPLATE_KEY_ORDER = [
    'credenciales_actualizadas',
    'pre_vencimiento',
    'vencimiento_hoy',
    'vencimiento_vencido',
    'venta_credenciales',
];

export function WhatsAppSettingsPanel() {
    const [tab, setTab] = useState<'connection' | 'templates' | 'logs'>('connection');
    const [loading, setLoading] = useState(true);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [rotations, setRotations] = useState<Record<string, number>>({});
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
    const [editMessage, setEditMessage] = useState('');
    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; text: string } | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [editingAlias, setEditingAlias] = useState<string | null>(null);
    const [aliasValue, setAliasValue] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, settRes, tmplRes] = await Promise.all([
                fetch('/api/whatsapp?action=instances'),
                fetch('/api/whatsapp?action=settings'),
                fetch('/api/whatsapp?action=templates'),
            ]);
            const [instData, settData, tmplData] = await Promise.all([
                instRes.json(), settRes.json(), tmplRes.json(),
            ]);
            setInstances(instData.instances || []);
            setSettings(settData.settings || null);
            setTemplates(tmplData.templates || []);
            setRotations(tmplData.rotations || {});
        } catch {
            // ignore
        }
        setLoading(false);
    }, []);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp?action=logs&limit=50');
            const data = await res.json();
            setLogs(data.logs || []);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (tab === 'logs') fetchLogs();
    }, [tab, fetchLogs]);

    const saveSendMode = async (mode: Settings['send_mode']) => {
        setSavingSettings(true);
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-settings', settings: { send_mode: mode } }),
        });
        setSettings(prev => prev ? { ...prev, send_mode: mode } : prev);
        setSavingSettings(false);
    };

    const saveAutoSetting = async (key: string, value: boolean) => {
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-settings', settings: { [key]: value } }),
        });
        setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    };

    const saveAlias = async (key: 'instance_1_alias' | 'instance_2_alias', alias: string) => {
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-settings', settings: { [key]: alias } }),
        });
        setSettings(prev => prev ? { ...prev, [key]: alias } : prev);
        setEditingAlias(null);
    };

    const saveBatchInterval = async (seconds: number) => {
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-settings', settings: { batch_send_interval_seconds: seconds } }),
        });
        setSettings(prev => prev ? { ...prev, batch_send_interval_seconds: seconds } : prev);
    };

    const saveTemplate = async (templateId: string) => {
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-template', templateId, message: editMessage }),
        });
        setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, message: editMessage } : t));
        setEditingTemplate(null);
    };

    const handleToggleTemplate = async (templateId: string, enabled: boolean) => {
        await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle-template', templateId, enabled }),
        });
        setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, enabled } : t));
    };

    const sendTestMessage = async () => {
        if (!testPhone || !testMessage) return;
        setSending(true);
        setSendResult(null);
        try {
            const res = await fetch('/api/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send-test', phone: testPhone, message: testMessage }),
            });
            const data = await res.json();
            setSendResult({
                success: data.success,
                text: data.success ? `✅ Enviado vía ${data.instanceUsed}` : `❌ ${data.error}`,
            });
        } catch {
            setSendResult({ success: false, text: '❌ Error de red' });
        }
        setSending(false);
    };

    const phoneFromJid = (jid?: string) => jid?.replace('@s.whatsapp.net', '') || '';

    // Group templates by key
    const templatesByKey: Record<string, Template[]> = {};
    for (const t of templates) {
        if (!templatesByKey[t.key]) templatesByKey[t.key] = [];
        templatesByKey[t.key].push(t);
    }
    // Sort variants within each key
    for (const key of Object.keys(templatesByKey)) {
        templatesByKey[key].sort((a, b) => a.variant - b.variant);
    }

    if (loading) {
        return (
            <Card className="border-border bg-card">
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-green-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-green-400" />
                    <CardTitle>WhatsApp</CardTitle>
                </div>
                <CardDescription>Gestión de mensajes y notificaciones automáticas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Tabs */}
                <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                    {['connection', 'templates', 'logs'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t as any)}
                            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {t === 'connection' ? '📱 Conexiones' : t === 'templates' ? '📝 Mensajes' : '📊 Historial'}
                        </button>
                    ))}
                </div>

                {/* Connection Tab */}
                {tab === 'connection' && (
                    <div className="space-y-4">
                        {/* Instances */}
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Números Conectados</h3>
                            {instances.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No hay instancias configuradas</p>
                            ) : (
                                instances.map((inst, idx) => {
                                    const aliasKey = idx === 0 ? 'instance_1_alias' : 'instance_2_alias';
                                    const alias = idx === 0 ? settings?.instance_1_alias : settings?.instance_2_alias;
                                    const isEditAlias = editingAlias === aliasKey;

                                    return (
                                        <div
                                            key={inst.name}
                                            className="flex items-center justify-between rounded-lg border border-border p-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`rounded-full p-2 ${inst.connected ? 'bg-green-400/10' : 'bg-red-400/10'}`}>
                                                    {inst.connected ? (
                                                        <Wifi className="h-4 w-4 text-green-400" />
                                                    ) : (
                                                        <WifiOff className="h-4 w-4 text-red-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        {isEditAlias ? (
                                                            <div className="flex items-center gap-1">
                                                                <Input
                                                                    value={aliasValue}
                                                                    onChange={(e) => setAliasValue(e.target.value)}
                                                                    className="h-6 w-32 text-xs"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') saveAlias(aliasKey as any, aliasValue);
                                                                        if (e.key === 'Escape') setEditingAlias(null);
                                                                    }}
                                                                />
                                                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => saveAlias(aliasKey as any, aliasValue)}>
                                                                    <Check className="h-3 w-3 text-green-400" />
                                                                </Button>
                                                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingAlias(null)}>
                                                                    <X className="h-3 w-3 text-red-400" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-sm font-medium">{alias || inst.name}</p>
                                                                <button
                                                                    onClick={() => { setEditingAlias(aliasKey); setAliasValue(alias || inst.name); }}
                                                                    className="text-muted-foreground hover:text-foreground"
                                                                >
                                                                    <Edit3 className="h-3 w-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {inst.name} · {inst.connected
                                                            ? `${inst.profileName || phoneFromJid(inst.ownerJid)} · Conectado`
                                                            : 'Desconectado'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${inst.connected
                                                ? 'bg-green-400/10 text-green-400'
                                                : 'bg-red-400/10 text-red-400'
                                                }`}>
                                                {inst.connected ? '🟢 Online' : '🔴 Offline'}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchData}
                                className="text-xs"
                            >
                                <RefreshCw className="mr-1.5 h-3 w-3" />
                                Actualizar estado
                            </Button>
                        </div>

                        {/* Send Mode */}
                        {settings && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Modo de Envío</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { mode: 'instance-1' as const, label: 'Solo Nº1', icon: '1️⃣' },
                                        { mode: 'instance-2' as const, label: 'Solo Nº2', icon: '2️⃣' },
                                        { mode: 'alternate' as const, label: 'Alternar', icon: '🔄' },
                                    ].map(({ mode, label, icon }) => (
                                        <button
                                            key={mode}
                                            onClick={() => saveSendMode(mode)}
                                            disabled={savingSettings}
                                            className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all ${settings.send_mode === mode
                                                ? 'border-green-400 bg-green-400/5 text-green-400'
                                                : 'border-border text-muted-foreground hover:border-muted-foreground'
                                                }`}
                                        >
                                            <span className="text-lg">{icon}</span>
                                            <span className="text-xs font-medium">{label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Auto-send Options */}
                        {settings && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Envío Automático</h3>
                                {[
                                    { key: 'auto_send_credentials', label: 'Credenciales al vender' },
                                    { key: 'auto_send_pre_expiry', label: 'Aviso pre-vencimiento' },
                                    { key: 'auto_send_expiry', label: 'Aviso de vencimiento' },
                                    { key: 'auto_send_credential_change', label: 'Al cambiar credenciales' },
                                ].map(({ key, label }) => (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between rounded-lg border border-border p-2.5"
                                    >
                                        <span className="text-sm">{label}</span>
                                        <button
                                            onClick={() => saveAutoSetting(key, !(settings as any)[key])}
                                            className={`relative h-6 w-11 rounded-full transition-colors ${(settings as any)[key] ? 'bg-green-400' : 'bg-muted'
                                                }`}
                                        >
                                            <span
                                                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${(settings as any)[key] ? 'translate-x-5' : ''
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Batch Send Interval */}
                        {settings && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Intervalo Envío Masivo</h3>
                                <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                                    <span className="text-sm">Segundos entre cada mensaje</span>
                                    <Input
                                        type="number"
                                        min={5}
                                        max={300}
                                        value={settings.batch_send_interval_seconds || 30}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 30;
                                            saveBatchInterval(val);
                                        }}
                                        className="h-8 w-20 text-center"
                                    />
                                    <span className="text-xs text-muted-foreground">seg</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Al enviar avisos de vencimiento masivos, esperar este intervalo entre cada mensaje.</p>
                            </div>
                        )}

                        {/* Test Message */}
                        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                            <h3 className="text-sm font-medium text-muted-foreground">Enviar Mensaje de Prueba</h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Número (ej: 0973682124)"
                                    value={testPhone}
                                    onChange={(e) => setTestPhone(e.target.value)}
                                    className="flex-1"
                                />
                            </div>
                            <textarea
                                placeholder="Mensaje de prueba..."
                                value={testMessage}
                                onChange={(e) => setTestMessage(e.target.value)}
                                rows={2}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    onClick={sendTestMessage}
                                    disabled={sending || !testPhone || !testMessage}
                                    className="bg-green-500 hover:bg-green-600"
                                >
                                    {sending ? (
                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    ) : (
                                        <Send className="mr-1.5 h-3 w-3" />
                                    )}
                                    Enviar Prueba
                                </Button>
                                {sendResult && (
                                    <span className={`text-xs ${sendResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                        {sendResult.text}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Templates Tab — Variant Cards */}
                {tab === 'templates' && (
                    <div className="space-y-4">
                        {TEMPLATE_KEY_ORDER.map((templateKey) => {
                            const variants = templatesByKey[templateKey] || [];
                            if (variants.length === 0) return null;
                            const meta = TEMPLATE_LABELS[templateKey] || { label: templateKey, icon: '📄', color: 'text-foreground' };
                            const enabledCount = variants.filter(v => v.enabled).length;
                            const rotationIdx = rotations[templateKey] ?? 0;
                            // Find which variant number is "next" — map rotation index to enabled variants
                            const enabledVariants = variants.filter(v => v.enabled);
                            const nextVariant = enabledVariants.length > 0
                                ? enabledVariants[(rotationIdx + 1) % enabledVariants.length]
                                : null;

                            return (
                                <div key={templateKey} className="rounded-xl border border-border bg-card overflow-hidden">
                                    {/* Header row */}
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">{meta.icon}</span>
                                            <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({enabledCount}/{variants.length} activos)
                                            </span>
                                        </div>
                                        {nextVariant && (
                                            <div className="flex items-center gap-1.5 rounded-full bg-green-400/10 px-2.5 py-1 text-xs font-medium text-green-400">
                                                <ArrowLeftRight className="h-3 w-3" />
                                                Siguiente: V{nextVariant.variant}
                                            </div>
                                        )}
                                    </div>

                                    {/* Variant cards — horizontal scroll */}
                                    <div className="overflow-x-auto">
                                        <div className="flex gap-3 p-3" style={{ minWidth: 'max-content' }}>
                                            {variants.map((tmpl) => {
                                                const isEditing = editingTemplate === tmpl.id;
                                                const isNext = nextVariant?.id === tmpl.id;

                                                return (
                                                    <div
                                                        key={tmpl.id}
                                                        className={`relative flex flex-col rounded-lg border p-3 transition-all ${
                                                            isNext
                                                                ? 'border-green-400/50 bg-green-400/5 ring-1 ring-green-400/20'
                                                                : tmpl.enabled
                                                                    ? 'border-border bg-background'
                                                                    : 'border-border/50 bg-muted/20 opacity-60'
                                                        }`}
                                                        style={{ width: 280, minHeight: 200 }}
                                                    >
                                                        {/* Variant header */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                                                    isNext
                                                                        ? 'bg-green-400 text-black'
                                                                        : tmpl.enabled
                                                                            ? 'bg-muted text-foreground'
                                                                            : 'bg-muted/50 text-muted-foreground'
                                                                }`}>
                                                                    {tmpl.variant}
                                                                </span>
                                                                {isNext && (
                                                                    <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">
                                                                        Siguiente
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => handleToggleTemplate(tmpl.id, !tmpl.enabled)}
                                                                    className={`relative h-4 w-8 rounded-full transition-colors ${
                                                                        tmpl.enabled ? 'bg-green-400' : 'bg-muted'
                                                                    }`}
                                                                >
                                                                    <span
                                                                        className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                                                                            tmpl.enabled ? 'translate-x-4' : ''
                                                                        }`}
                                                                    />
                                                                </button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        if (isEditing) {
                                                                            setEditingTemplate(null);
                                                                        } else {
                                                                            setEditingTemplate(tmpl.id);
                                                                            setEditMessage(tmpl.message);
                                                                        }
                                                                    }}
                                                                    className="h-6 w-6 p-0"
                                                                >
                                                                    {isEditing ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {/* Content */}
                                                        {isEditing ? (
                                                            <div className="flex flex-col flex-1 gap-2">
                                                                <textarea
                                                                    value={editMessage}
                                                                    onChange={(e) => setEditMessage(e.target.value)}
                                                                    rows={7}
                                                                    className="flex-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground font-mono placeholder:text-muted-foreground focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 resize-none"
                                                                />
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <p className="text-[9px] text-muted-foreground leading-tight">
                                                                        {'{nombre}'} {'{plataforma}'} {'{email}'} {'{password}'} {'{perfil}'} {'{pin}'} {'{fecha_vencimiento}'} {'{dias_restantes}'} {'{precio}'}
                                                                    </p>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => saveTemplate(tmpl.id)}
                                                                        className="bg-green-500 hover:bg-green-600 h-6 text-[10px] px-2"
                                                                    >
                                                                        <Check className="mr-1 h-2.5 w-2.5" /> Guardar
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <pre className="flex-1 whitespace-pre-wrap rounded bg-muted/30 p-2 text-[10px] leading-relaxed text-muted-foreground font-mono overflow-y-auto max-h-48">
                                                                {tmpl.message}
                                                            </pre>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {Object.keys(templatesByKey).length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-8">
                                No hay templates configurados. Ejecute la migración SQL para inicializar.
                            </p>
                        )}
                    </div>
                )}

                {/* Logs Tab */}
                {tab === 'logs' && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-muted-foreground">Últimos mensajes enviados</h3>
                            <Button variant="outline" size="sm" onClick={fetchLogs} className="text-xs">
                                <RefreshCw className="mr-1.5 h-3 w-3" />
                                Actualizar
                            </Button>
                        </div>
                        {logs.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">
                                Aún no se han enviado mensajes por WhatsApp.
                            </p>
                        ) : (
                            <div className="max-h-[400px] overflow-y-auto space-y-1.5">
                                {logs.map((log) => {
                                    const instanceAlias = settings
                                        ? (log.instance_used === settings.instance_1_name ? settings.instance_1_alias
                                            : log.instance_used === settings.instance_2_name ? settings.instance_2_alias
                                                : log.instance_used)
                                        : log.instance_used;

                                    return (
                                        <div
                                            key={log.id}
                                            className="flex items-center justify-between rounded border border-border p-2 text-xs"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={log.status === 'sent' ? 'text-green-400' : 'text-red-400'}>
                                                    {log.status === 'sent' ? '✅' : '❌'}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{log.phone}</p>
                                                    <p className="text-muted-foreground truncate max-w-[200px]">
                                                        {log.template_key ? TEMPLATE_LABELS[log.template_key]?.label || log.template_key : 'Manual'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleString('es-PY', {
                                                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </p>
                                                <p className={`font-medium ${log.status === 'sent' ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                                    {log.status === 'sent' ? '✓ Enviado' : '✗ Falló'} · desde: {instanceAlias || log.instance_used}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
