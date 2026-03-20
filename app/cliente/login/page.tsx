'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Phone, Lock, Loader2, Zap, Eye, EyeOff } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export default function PortalLoginPage() {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRef = useRef<HCaptcha>(null);
    const router = useRouter();
    const supabase = createClient();

    const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '';

    const getEmailVariants = (p: string): string[] => {
        const raw = p.trim().replace(/\s+/g, '').replace(/[-().]/g, '');
        const variants: string[] = [];

        // Variant 1: strip leading 0 and add 595 (most common PY format)
        if (raw.startsWith('0')) {
            variants.push(`595${raw.slice(1)}@clickpar.shop`);
        }
        // Variant 2: strip leading +
        if (raw.startsWith('+')) {
            variants.push(`${raw.slice(1)}@clickpar.shop`);
        }
        // Variant 3: already starts with 595 (no leading 0)
        if (raw.startsWith('595') && !raw.startsWith('0')) {
            variants.push(`${raw}@clickpar.shop`);
        }
        // Variant 4: short number — prepend 595
        if (!raw.startsWith('0') && !raw.startsWith('+') && !raw.startsWith('595')) {
            variants.push(`595${raw}@clickpar.shop`);
        }
        // Variant 5: raw as-is fallback
        variants.push(`${raw}@clickpar.shop`);

        // Deduplicate while preserving order
        return [...new Set(variants)];
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

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
        const emailVariants = getEmailVariants(phone);
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
                        {/* Phone */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Tu número de teléfono
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="tel"
                                    placeholder="0981 123 456"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-muted/30 py-3 pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                    required
                                />
                            </div>
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
