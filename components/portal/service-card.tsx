'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Check, Search, RefreshCw, ExternalLink } from 'lucide-react';
import { CodeIframeModal } from './code-iframe-modal';

interface ServiceCardProps {
    saleId?: string;
    platform: string;
    email: string;
    password: string;
    pin?: string | null;
    profile?: string | null;
    expiresAt: string | null;
    renewalDate?: string | null;
    supplierName?: string | null;
    needsCode?: boolean;
    codeUrl?: string | null;
    isCanje?: boolean;
}

const PLATFORM_ICONS: Record<string, { emoji: string; gradient: string }> = {
    Netflix: { emoji: '🎬', gradient: 'from-red-600 to-red-800' },
    'HBO Max': { emoji: '💜', gradient: 'from-purple-600 to-purple-800' },
    'Disney+': { emoji: '🏰', gradient: 'from-blue-600 to-blue-800' },
    'Amazon Prime Video': { emoji: '📦', gradient: 'from-blue-500 to-cyan-600' },
    'Prime Video': { emoji: '📦', gradient: 'from-blue-500 to-cyan-600' },
    Spotify: { emoji: '🎧', gradient: 'from-green-500 to-green-700' },
    'YouTube Premium': { emoji: '▶️', gradient: 'from-red-500 to-red-700' },
    Crunchyroll: { emoji: '🍥', gradient: 'from-orange-500 to-orange-700' },
    VIX: { emoji: '📺', gradient: 'from-amber-500 to-amber-700' },
    'Paramount+': { emoji: '⛰️', gradient: 'from-blue-700 to-blue-900' },
    iCloud: { emoji: '☁️', gradient: 'from-sky-400 to-sky-600' },
};

function getExpiryBadge(expiresAt: string | null, isCanje?: boolean) {
    if (isCanje) return { label: '🎬 Canje — Sin vencimiento', color: 'bg-[#818CF8]/20 text-[#818CF8]', daysLeft: null };
    if (!expiresAt) return { label: 'Sin vencimiento', color: 'bg-muted text-muted-foreground', daysLeft: null };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(expiresAt);
    exp.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { label: `Vencido hace ${Math.abs(daysLeft)}d`, color: 'bg-red-500/20 text-red-400', daysLeft };
    if (daysLeft === 0) return { label: 'Vence hoy', color: 'bg-red-500/20 text-red-400 animate-pulse', daysLeft };
    if (daysLeft <= 3) return { label: `Vence en ${daysLeft}d`, color: 'bg-orange-500/20 text-orange-400', daysLeft };
    if (daysLeft <= 7) return { label: `Vence en ${daysLeft}d`, color: 'bg-yellow-500/20 text-yellow-400', daysLeft };
    return { label: `${daysLeft} días restantes`, color: 'bg-emerald-500/20 text-emerald-400', daysLeft };
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={`Copiar ${label}`}
        >
            {copied ? <Check className="h-3.5 w-3.5 text-[#86EFAC]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );
}

function VerCodeButton({ platform, codeUrl }: { platform: string; codeUrl: string }) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 py-2.5 text-sm font-medium text-[#86EFAC] transition-all hover:bg-[#86EFAC]/20"
            >
                <Search className="h-4 w-4" />
                Consultar Código
            </button>
            <CodeIframeModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                codeUrl={codeUrl}
                platform={platform}
            />
        </>
    );
}

function RenewButton({ saleId }: { saleId: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRenew = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/pagopar/crear-pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sale_id: saleId }),
            });
            const data = await res.json();
            if (data.success && data.paymentUrl) {
                // Open PagoPar payment page in new tab
                window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
            } else {
                setError(data.error || 'Error al generar el pago');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <button
                onClick={handleRenew}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] px-6 py-2.5 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
                {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                    <ExternalLink className="h-4 w-4" />
                )}
                {loading ? 'Generando pago…' : 'Renovar ahora'}
            </button>
            {error && (
                <p className="text-center text-xs text-red-400">{error}</p>
            )}
        </div>
    );
}

export function ServiceCard({ saleId, platform, email, password, pin, profile, expiresAt, supplierName, needsCode, codeUrl, isCanje }: ServiceCardProps) {
    const [showPassword, setShowPassword] = useState(false);
    const platformInfo = PLATFORM_ICONS[platform] || { emoji: '📱', gradient: 'from-gray-600 to-gray-800' };
    const expiryBadge = getExpiryBadge(expiresAt, isCanje);
    const showVerCode = needsCode && codeUrl;

    // Show Renovar button when <= 7 days remaining or expired (and not a canje)
    const showRenovar = !isCanje && saleId && expiryBadge.daysLeft !== null && expiryBadge.daysLeft <= 7;

    const handleShowPassword = () => {
        if (!showPassword) {
            // Log credential view
            fetch('/api/portal/log-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType: 'view_credentials',
                    metadata: { saleId, platform },
                }),
            }).catch(() => {}); // Non-blocking
        }
        setShowPassword(!showPassword);
    };

    const formattedDate = isCanje
        ? null
        : expiresAt
            ? new Date(expiresAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
            : null;

    return (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card transition-all hover:border-border">
            {/* Platform header */}
            <div className={`bg-gradient-to-r ${platformInfo.gradient} px-5 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{platformInfo.emoji}</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">{platform}</h3>
                            {profile && <p className="text-xs text-white/70">Perfil: {profile}</p>}
                        </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${expiryBadge.color}`}>
                        {expiryBadge.label}
                    </span>
                </div>
            </div>

            {/* Credentials */}
            <div className="space-y-3 p-5">
                {/* Email */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Correo de acceso
                    </label>
                    <div className="flex items-center rounded-lg bg-muted/50 px-3 py-2">
                        <span className="flex-1 text-sm font-mono text-foreground">{email}</span>
                        <CopyButton text={email} label="correo" />
                    </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Contraseña
                    </label>
                    <div className="flex items-center rounded-lg bg-muted/50 px-3 py-2">
                        <span className="flex-1 text-sm font-mono text-foreground">
                            {showPassword ? password : '••••••••••'}
                        </span>
                        <button
                            onClick={handleShowPassword}
                            className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={showPassword ? 'Ocultar' : 'Mostrar'}
                        >
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <CopyButton text={password} label="contraseña" />
                    </div>
                </div>

                {/* PIN if exists */}
                {pin && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            PIN / Código
                        </label>
                        <div className="flex items-center rounded-lg bg-muted/50 px-3 py-2">
                            <span className="flex-1 text-sm font-mono text-foreground">{pin}</span>
                            <CopyButton text={pin} label="PIN" />
                        </div>
                    </div>
                )}

                {/* Ver Código button */}
                {showVerCode && <VerCodeButton platform={platform} codeUrl={codeUrl} />}

                {/* Expiry date */}
                {formattedDate && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <span>Vence el</span>
                        <span className="font-medium text-foreground">{formattedDate}</span>
                    </div>
                )}

                {/* Renovar button — only when <= 7 days or expired */}
                {showRenovar && <RenewButton saleId={saleId!} />}
            </div>
        </div>
    );
}
