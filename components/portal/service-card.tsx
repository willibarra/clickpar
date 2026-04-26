'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Check, Search, RefreshCw, ExternalLink, Send, Wallet, ChevronDown, ListChecks } from 'lucide-react';
import { CodeIframeModal } from './code-iframe-modal';
import { CodeRequestModal } from './code-request-modal';

interface CodeButtonItem {
    label: string;
    source: string;
    url: string | null;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
}

interface ServiceCardProps {
    saleId?: string;
    platform: string;
    displayName?: string;
    email: string;
    password: string;
    pin?: string | null;
    profile?: string | null;
    expiresAt: string | null;
    renewalDate?: string | null;
    amount?: number;
    supplierName?: string | null;
    needsCode?: boolean;
    codeUrl?: string | null;
    codeSource?: string;
    codeButtons?: CodeButtonItem[];
    helpSteps?: string[];
    isCanje?: boolean;
}

const PLATFORM_CONFIG: Record<string, { blurColor: string }> = {
    Netflix: { blurColor: 'rgba(220,38,38,0.5)' },
    'HBO Max': { blurColor: 'rgba(147,51,234,0.5)' },
    'Disney+': { blurColor: 'rgba(37,99,235,0.5)' },
    'Amazon Prime Video': { blurColor: 'rgba(14,165,233,0.45)' },
    'Prime Video': { blurColor: 'rgba(14,165,233,0.45)' },
    Spotify: { blurColor: 'rgba(34,197,94,0.45)' },
    'YouTube Premium': { blurColor: 'rgba(239,68,68,0.45)' },
    Crunchyroll: { blurColor: 'rgba(249,115,22,0.45)' },
    VIX: { blurColor: 'rgba(245,158,11,0.45)' },
    Vix: { blurColor: 'rgba(245,158,11,0.45)' },
    'Paramount+': { blurColor: 'rgba(29,78,216,0.5)' },
    iCloud: { blurColor: 'rgba(56,189,248,0.45)' },
    FLUJOTV: { blurColor: 'rgba(99,102,241,0.45)' },
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

function TelegramCodeButton({ saleId, platform }: { saleId: string; platform: string }) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#818CF8]/30 bg-[#818CF8]/10 py-2.5 text-sm font-medium text-[#818CF8] transition-all hover:bg-[#818CF8]/20"
            >
                <Send className="h-4 w-4" />
                Pedir Código
            </button>
            <CodeRequestModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                saleId={saleId}
                platform={platform}
            />
        </>
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

    return null;
}

function RenewWithBalanceButton({ saleId, amount }: { saleId: string; amount?: number }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleRenew = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/portal/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sale_id: saleId }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(true);
                // Reload to update card info
                setTimeout(() => window.location.reload(), 1500);
            } else if (data.code === 'INSUFFICIENT_BALANCE') {
                // Redirect to wallet recharge
                window.location.href = '/cliente/extracto';
            } else {
                setError(data.error || 'Error al renovar');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 py-2.5 text-sm font-medium text-emerald-400">
                <Check className="h-4 w-4" />
                ¡Renovado con éxito!
            </div>
        );
    }

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
                    <Wallet className="h-4 w-4" />
                )}
                {loading ? 'Renovando…' : `Renovar con Saldo${amount ? ` (Gs. ${amount.toLocaleString('es-PY')})` : ''}`}
            </button>
            {error && (
                <p className="text-center text-xs text-red-400">{error}</p>
            )}
        </div>
    );
}

export function ServiceCard({ saleId, platform, displayName, email, password, pin, profile, expiresAt, amount, supplierName, needsCode, codeUrl, codeSource, codeButtons, helpSteps, isCanje }: ServiceCardProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [showSteps, setShowSteps] = useState(false);
    const config = PLATFORM_CONFIG[platform] || { blurColor: 'rgba(120,120,120,0.4)' };
    const expiryBadge = getExpiryBadge(expiresAt, isCanje);
    const hasCodeButtons = codeButtons && codeButtons.length > 0;
    const showVerCode = !hasCodeButtons && needsCode && codeUrl && codeSource !== 'telegram_bot';
    const showTelegramCode = !hasCodeButtons && needsCode && codeSource === 'telegram_bot' && saleId;

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

    // Use displayName (alias) if provided, otherwise fall back to platform name
    const shownName = displayName || platform;

    return (
        <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#111118]">
            {/* Bokeh Header */}
            <div className="relative overflow-hidden px-5 py-7 text-center">
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
                {/* Expiry badge */}
                <div className="absolute top-3 right-3 flex flex-col items-end gap-0.5">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${expiryBadge.color}`}>
                        {expiryBadge.label}
                    </span>
                    {formattedDate && (
                        <span className="text-[10px] text-white/50">
                            Vence: {formattedDate}
                        </span>
                    )}
                </div>
                <h3 className="relative text-xl font-bold text-white tracking-wide">
                    {shownName}
                </h3>
                {profile && <p className="relative mt-1 text-sm text-white/50">Perfil: {profile}</p>}
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
                            PIN
                        </label>
                        <div className="flex items-center rounded-lg bg-muted/50 px-3 py-2">
                            <span className="flex-1 text-sm font-mono text-foreground">{pin}</span>
                            <CopyButton text={pin} label="PIN" />
                        </div>
                    </div>
                )}

                {/* Ver Código button (Gmail/iframe) — legacy single-button fallback */}
                {showVerCode && <VerCodeButton platform={platform} codeUrl={codeUrl} />}

                {/* Telegram code request button — legacy single-button fallback */}
                {showTelegramCode && <TelegramCodeButton saleId={saleId!} platform={platform} />}

                {/* Custom code buttons from provider_support_config */}
                {hasCodeButtons && saleId && (
                    <div className={`flex gap-2 ${codeButtons!.length > 1 ? 'flex-row' : ''}`}>
                        {codeButtons!.map((btn, i) => (
                            <CodeActionButton key={i} btn={btn} saleId={saleId} platform={platform} />
                        ))}
                    </div>
                )}

                {/* Renovar button — only when <= 7 days or expired */}
                {showRenovar && <RenewWithBalanceButton saleId={saleId!} amount={amount} />}

                {/* Help steps accordion — shown when provider has instructions */}
                {helpSteps && helpSteps.length > 0 && (
                    <div className="-mx-5 -mb-5 border-t border-white/[0.06]">
                        <button
                            onClick={() => setShowSteps(!showSteps)}
                            className="flex w-full items-center justify-between px-5 py-3 text-sm text-foreground/70 transition-colors hover:bg-white/[0.03]"
                        >
                            <span className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                Instrucciones de acceso ({helpSteps.length})
                            </span>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSteps ? 'rotate-180' : ''}`} />
                        </button>
                        {showSteps && (
                            <div className="space-y-1.5 px-5 pb-4">
                                {helpSteps.map((step, i) => (
                                    <div key={i} className="flex items-start gap-3 rounded-lg bg-white/[0.03] px-3.5 py-2.5">
                                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#86EFAC]/15 text-[10px] font-bold text-[#86EFAC]">
                                            {i + 1}
                                        </span>
                                        <span className="text-sm text-foreground/80 leading-relaxed">{step}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
