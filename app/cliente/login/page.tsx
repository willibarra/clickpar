'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Loader2, Zap, Eye, EyeOff, ChevronDown } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

/* ── Country codes ────────────────────────────────── */
const COUNTRIES = [
    { code: '595', flag: '🇵🇾', name: 'Paraguay', localPrefix: '0' },
    { code: '54',  flag: '🇦🇷', name: 'Argentina', localPrefix: '' },
    { code: '55',  flag: '🇧🇷', name: 'Brasil', localPrefix: '' },
    { code: '56',  flag: '🇨🇱', name: 'Chile', localPrefix: '' },
    { code: '57',  flag: '🇨🇴', name: 'Colombia', localPrefix: '' },
    { code: '593', flag: '🇪🇨', name: 'Ecuador', localPrefix: '' },
    { code: '51',  flag: '🇵🇪', name: 'Perú', localPrefix: '' },
    { code: '598', flag: '🇺🇾', name: 'Uruguay', localPrefix: '' },
    { code: '58',  flag: '🇻🇪', name: 'Venezuela', localPrefix: '' },
    { code: '1',   flag: '🇺🇸', name: 'Estados Unidos', localPrefix: '' },
    { code: '34',  flag: '🇪🇸', name: 'España', localPrefix: '' },
];

/**
 * Normalizes phone input to a clean international number.
 * For Paraguay (595):
 *   - "0981123456"   → "595981123456"
 *   - "981123456"    → "595981123456"
 *   - "595981123456" → "595981123456"
 * For other countries: just prepends country code to cleaned digits.
 */
function normalizeToEmail(rawPhone: string, countryCode: string): string[] {
    const digits = rawPhone.replace(/\D/g, '');
    const variants: string[] = [];

    if (countryCode === '595') {
        // Paraguay-specific normalization
        if (digits.startsWith('595')) {
            // Already has full code
            variants.push(`${digits}@clickpar.shop`);
        } else if (digits.startsWith('0')) {
            // Local format: 0981... → 595981...
            variants.push(`595${digits.slice(1)}@clickpar.shop`);
        } else if (digits.startsWith('9') && digits.length >= 9) {
            // Short local: 981... → 595981...
            variants.push(`595${digits}@clickpar.shop`);
        } else {
            // Fallback: prepend 595
            variants.push(`595${digits}@clickpar.shop`);
        }
        // Also try the raw digits as-is (in case stored differently)
        variants.push(`${digits}@clickpar.shop`);
    } else {
        // International: prepend country code if not already there
        if (digits.startsWith(countryCode)) {
            variants.push(`${digits}@clickpar.shop`);
        } else {
            variants.push(`${countryCode}${digits}@clickpar.shop`);
        }
        variants.push(`${digits}@clickpar.shop`);
    }

    // Deduplicate
    return [...new Set(variants)];
}

export default function PortalLoginPage() {
    const [countryCode, setCountryCode] = useState('595');
    const [showCountryPicker, setShowCountryPicker] = useState(false);
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    // True while we verify whether the user is already authenticated
    const [checkingSession, setCheckingSession] = useState(true);
    // Magic Link auto-login state
    const [magicLinkLoading, setMagicLinkLoading] = useState(false);
    const captchaRef = useRef<HCaptcha>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '';

    // ── Magic Link error messages from redirect ──
    const MAGIC_ERRORS: Record<string, string> = {
        invalid: 'El enlace no es válido. Pedí uno nuevo a tu vendedor.',
        used: 'Este enlace ya fue utilizado. Pedí uno nuevo.',
        expired: 'El enlace expiró. Pedí uno nuevo a tu vendedor.',
    };

    // ── Guard: if already authenticated, redirect immediately ─────────────
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                router.replace('/cliente');
            } else {
                setCheckingSession(false);
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Magic Link: auto-verify if ?magic={token_hash}&type=email ──
    useEffect(() => {
        const magicToken = searchParams.get('magic');
        const tokenType = searchParams.get('type');
        const magicError = searchParams.get('magic_error');

        // Show redirect errors from the magic link handler
        if (magicError && MAGIC_ERRORS[magicError]) {
            setError(MAGIC_ERRORS[magicError]);
            return;
        }

        if (!magicToken || tokenType !== 'email') return;

        // Prevent double-execution
        setMagicLinkLoading(true);
        setError(null);

        supabase.auth.verifyOtp({
            token_hash: magicToken,
            type: 'email',
        }).then(({ error: verifyError }) => {
            if (verifyError) {
                console.error('[magic-link] verifyOtp error:', verifyError.message);
                setError('El enlace mágico expiró o no es válido. Iniciá sesión con tu contraseña.');
                setMagicLinkLoading(false);
                // Clean the URL params to avoid re-triggering
                router.replace('/cliente/login');
                return;
            }

            // Success — log and redirect
            fetch('/api/portal/log-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventType: 'magic_link_login', metadata: {} }),
            }).catch(() => {}); // non-blocking

            router.push('/cliente');
            router.refresh();
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const selectedCountry = useMemo(
        () => COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0],
        [countryCode]
    );

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Safety check: abort if there is already an active session
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
            router.replace('/cliente');
            return;
        }

        // Verify captcha first
        if (hcaptchaSiteKey && !captchaToken) {
            setError('Por favor completá el captcha');
            setLoading(false);
            return;
        }

        if (hcaptchaSiteKey && captchaToken) {
            try {
                const captchaRes = await fetch('/api/portal/verify-captcha', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: captchaToken }),
                });
                const captchaData = await captchaRes.json();
                if (!captchaData.success) {
                    setError('Verificación de captcha fallida. Intentá de nuevo.');
                    captchaRef.current?.resetCaptcha();
                    setCaptchaToken(null);
                    setLoading(false);
                    return;
                }
            } catch {
                setError('Error al verificar captcha');
                setLoading(false);
                return;
            }
        }

        // Try multiple email variants derived from the phone number
        const emailVariants = normalizeToEmail(phone, countryCode);
        let loginSuccess = false;

        for (const email of emailVariants) {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (!signInError) {
                loginSuccess = true;
                try {
                    await fetch('/api/portal/log-access', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ eventType: 'login', metadata: { phone } }),
                    });
                } catch { /* non-blocking */ }
                router.push('/cliente');
                router.refresh();
                return;
            }

            // Stop on non-credentials errors
            if (!signInError.message.includes('Invalid login credentials')) {
                setError(signInError.message);
                captchaRef.current?.resetCaptcha();
                setCaptchaToken(null);
                setLoading(false);
                return;
            }
        }

        if (!loginSuccess) {
            setError('Teléfono o contraseña incorrectos. Verificá tus datos.');
            captchaRef.current?.resetCaptcha();
            setCaptchaToken(null);
            setLoading(false);
        }
    };

    // While we verify the session or magic link, show a neutral loading screen
    if (checkingSession || magicLinkLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC] mx-auto" />
                    {magicLinkLoading && (
                        <p className="text-sm text-muted-foreground animate-pulse">Ingresando con enlace mágico...</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm">
                {/* Logo & Title */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#86EFAC] to-emerald-400 shadow-lg shadow-[#86EFAC]/20">
                        <Zap className="h-8 w-8 text-black" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">ClickPar</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Portal del Cliente
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-border/50 bg-card p-6">
                    {error && (
                        <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        {/* Phone with country code */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Tu número de teléfono
                            </label>
                            <div className="flex gap-2">
                                {/* Country code selector */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowCountryPicker(!showCountryPicker)}
                                        className="flex h-[46px] items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground transition-colors hover:bg-muted/50 focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                    >
                                        <span className="text-lg">{selectedCountry.flag}</span>
                                        <span className="text-muted-foreground">+{countryCode}</span>
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    
                                    {/* Dropdown */}
                                    {showCountryPicker && (
                                        <>
                                            <div 
                                                className="fixed inset-0 z-40" 
                                                onClick={() => setShowCountryPicker(false)} 
                                            />
                                            <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                                                <div className="max-h-60 overflow-y-auto py-1">
                                                    {COUNTRIES.map(c => (
                                                        <button
                                                            key={c.code}
                                                            type="button"
                                                            onClick={() => {
                                                                setCountryCode(c.code);
                                                                setShowCountryPicker(false);
                                                            }}
                                                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-secondary ${
                                                                countryCode === c.code ? 'bg-[#86EFAC]/10 text-[#86EFAC]' : 'text-foreground'
                                                            }`}
                                                        >
                                                            <span className="text-lg">{c.flag}</span>
                                                            <span className="flex-1 text-left">{c.name}</span>
                                                            <span className="text-xs text-muted-foreground">+{c.code}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Phone number input */}
                                <input
                                    type="tel"
                                    placeholder={countryCode === '595' ? '0981 123 456' : 'Número de teléfono'}
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="flex-1 rounded-xl border border-border bg-muted/30 py-3 px-4 text-foreground placeholder:text-muted-foreground focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                    required
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {countryCode === '595'
                                    ? 'Podés escribir con 0 al inicio o sin él. Ej: 0981123456 o 981123456'
                                    : `Ingresá tu número sin el código de país (+${countryCode})`
                                }
                            </p>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="CP-xxxx-xxxx"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-muted/30 py-3 pl-11 pr-12 text-foreground placeholder:text-muted-foreground focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {/* hCaptcha */}
                        {hcaptchaSiteKey && (
                            <div className="flex justify-center">
                                <HCaptcha
                                    sitekey={hcaptchaSiteKey}
                                    onVerify={(token) => setCaptchaToken(token)}
                                    onExpire={() => setCaptchaToken(null)}
                                    ref={captchaRef}
                                    theme="dark"
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !phone.trim() || !password.trim()}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#86EFAC] py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Ingresar'
                            )}
                        </button>
                    </form>

                    {/* Info note */}
                    <div className="mt-4 rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground text-center leading-relaxed">
                            Tus datos de acceso te fueron enviados por <strong className="text-foreground">WhatsApp</strong> al momento de tu compra.
                            Si no los tenés, contactá a soporte.
                        </p>
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    ¿Necesitás ayuda? Escribinos al{' '}
                    <a href="https://wa.me/595994540904" className="text-[#86EFAC] hover:underline">
                        0994 540 904
                    </a>
                </p>
            </div>
        </div>
    );
}
