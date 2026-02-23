'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Check, Search, Loader2, KeyRound } from 'lucide-react';

interface ServiceCardProps {
    saleId?: string;
    platform: string;
    email: string;
    password: string;
    pin?: string | null;
    profile?: string | null;
    expiresAt: string | null;
    renewalDate?: string | null;
}

const PLATFORM_ICONS: Record<string, { emoji: string; gradient: string }> = {
    Netflix: { emoji: '🎬', gradient: 'from-red-600 to-red-800' },
    'HBO Max': { emoji: '💜', gradient: 'from-purple-600 to-purple-800' },
    'Disney+': { emoji: '🏰', gradient: 'from-blue-600 to-blue-800' },
    'Amazon Prime Video': { emoji: '📦', gradient: 'from-blue-500 to-cyan-600' },
    Spotify: { emoji: '🎧', gradient: 'from-green-500 to-green-700' },
    'YouTube Premium': { emoji: '▶️', gradient: 'from-red-500 to-red-700' },
    Crunchyroll: { emoji: '🍥', gradient: 'from-orange-500 to-orange-700' },
    VIX: { emoji: '📺', gradient: 'from-amber-500 to-amber-700' },
    'Paramount+': { emoji: '⛰️', gradient: 'from-blue-700 to-blue-900' },
    iCloud: { emoji: '☁️', gradient: 'from-sky-400 to-sky-600' },
};

// Platforms that commonly need verification codes
const CODE_PLATFORMS = ['Netflix', 'Disney+', 'HBO Max', 'Amazon Prime Video', 'Paramount+', 'Crunchyroll'];

function getExpiryBadge(expiresAt: string | null) {
    if (!expiresAt) return { label: 'Sin vencimiento', color: 'bg-muted text-muted-foreground' };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(expiresAt);
    exp.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { label: `Vencido hace ${Math.abs(daysLeft)}d`, color: 'bg-red-500/20 text-red-400' };
    if (daysLeft === 0) return { label: 'Vence hoy', color: 'bg-red-500/20 text-red-400 animate-pulse' };
    if (daysLeft <= 3) return { label: `Vence en ${daysLeft}d`, color: 'bg-orange-500/20 text-orange-400' };
    if (daysLeft <= 7) return { label: `Vence en ${daysLeft}d`, color: 'bg-yellow-500/20 text-yellow-400' };
    return { label: `${daysLeft} días restantes`, color: 'bg-emerald-500/20 text-emerald-400' };
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

function VerCodeButton({ saleId }: { saleId: string }) {
    const [loading, setLoading] = useState(false);
    const [code, setCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSearch = async () => {
        setLoading(true);
        setError(null);
        setCode(null);

        try {
            const res = await fetch(`/api/portal/verification-code?saleId=${saleId}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Error al buscar código');
                return;
            }

            if (data.found && data.code) {
                setCode(data.code);
            } else {
                setError(data.message || 'No se encontró código');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!code) return;
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (code) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-[#86EFAC]/30 bg-[#86EFAC]/10 px-3 py-2">
                    <KeyRound className="h-4 w-4 text-[#86EFAC]" />
                    <span className="text-lg font-bold tracking-[0.3em] text-[#86EFAC]">{code}</span>
                </div>
                <button
                    onClick={handleCopy}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#86EFAC]/10 text-[#86EFAC] transition-colors hover:bg-[#86EFAC]/20"
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <button
                onClick={handleSearch}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 py-2.5 text-sm font-medium text-[#86EFAC] transition-all hover:bg-[#86EFAC]/20 disabled:opacity-50"
            >
                {loading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando...
                    </>
                ) : (
                    <>
                        <Search className="h-4 w-4" />
                        Ver Código
                    </>
                )}
            </button>
            {error && (
                <p className="text-xs text-center text-muted-foreground">{error}</p>
            )}
        </div>
    );
}

export function ServiceCard({ saleId, platform, email, password, pin, profile, expiresAt }: ServiceCardProps) {
    const [showPassword, setShowPassword] = useState(false);
    const platformInfo = PLATFORM_ICONS[platform] || { emoji: '📱', gradient: 'from-gray-600 to-gray-800' };
    const expiryBadge = getExpiryBadge(expiresAt);
    const showVerCode = saleId && CODE_PLATFORMS.includes(platform);

    const formattedDate = expiresAt
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
                            onClick={() => setShowPassword(!showPassword)}
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
                {showVerCode && <VerCodeButton saleId={saleId} />}

                {/* Expiry date */}
                {formattedDate && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <span>Vence el</span>
                        <span className="font-medium text-foreground">{formattedDate}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
