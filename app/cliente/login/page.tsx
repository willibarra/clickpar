'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Phone, Loader2, MessageSquare, Zap, ArrowLeft } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

type Step = 'phone' | 'verify';

export default function PortalLoginPage() {
    const [step, setStep] = useState<Step>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRef = useRef<HCaptcha>(null);
    const router = useRouter();
    const supabase = createClient();

    const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '';

    const formatPhone = (p: string) => {
        let formatted = p.trim();
        if (!formatted.startsWith('+')) {
            formatted = '+595' + formatted.replace(/^0/, '');
        }
        return formatted;
    };

    const handleSendOtp = async (e: React.FormEvent) => {
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

        const { error } = await supabase.auth.signInWithOtp({
            phone: formatPhone(phone),
        });

        if (error) {
            setError(error.message);
        } else {
            setStep('verify');
            startCountdown();
        }
        setLoading(false);
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.verifyOtp({
            phone: formatPhone(phone),
            token: otp,
            type: 'sms',
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            // Log successful login
            try {
                await fetch('/api/portal/log-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        eventType: 'login',
                        metadata: { phone: formatPhone(phone) },
                    }),
                });
            } catch {
                // Non-blocking
            }
            router.push('/cliente');
            router.refresh();
        }
    };

    const startCountdown = () => {
        setCountdown(60);
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const handleResend = async () => {
        if (countdown > 0) return;
        setLoading(true);
        const { error } = await supabase.auth.signInWithOtp({
            phone: formatPhone(phone),
        });
        if (error) setError(error.message);
        else startCountdown();
        setLoading(false);
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

                    {/* Step 1: Phone number */}
                    {step === 'phone' && (
                        <form onSubmit={handleSendOtp} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Tu número de WhatsApp
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
                                <p className="text-xs text-muted-foreground">
                                    Te enviaremos un código de verificación por SMS
                                </p>
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
                                disabled={loading || !phone.trim()}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#86EFAC] py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <MessageSquare className="h-4 w-4" />
                                        Enviar código
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Step 2: Verify OTP */}
                    {step === 'verify' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-5">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                    Código enviado a <span className="font-medium text-foreground">{phone}</span>
                                </p>
                                <button
                                    type="button"
                                    onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
                                    className="mt-1 inline-flex items-center gap-1 text-xs text-[#86EFAC] hover:underline"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Cambiar número
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Código de verificación
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="123456"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full rounded-xl border border-border bg-muted/30 py-3 text-center text-2xl font-bold tracking-[0.5em] text-foreground placeholder:text-muted-foreground placeholder:tracking-[0.3em] placeholder:text-lg focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                    maxLength={6}
                                    required
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || otp.length !== 6}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#86EFAC] py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Verificar código'
                                )}
                            </button>

                            <div className="text-center">
                                {countdown > 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Reenviar en <span className="text-foreground font-medium">{countdown}s</span>
                                    </p>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        disabled={loading}
                                        className="text-sm text-[#86EFAC] hover:underline"
                                    >
                                        Reenviar código
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
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
