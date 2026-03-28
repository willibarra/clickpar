'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, Shield } from 'lucide-react';

declare global {
    interface Window {
        grecaptcha: any;
    }
}

export default function StaffLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [recaptchaReady, setRecaptchaReady] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';

    // Load reCAPTCHA v3 script
    useEffect(() => {
        if (!siteKey) {
            setRecaptchaReady(true); // Skip if no key configured
            return;
        }

        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.async = true;
        script.onload = () => setRecaptchaReady(true);
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, [siteKey]);

    const executeRecaptcha = useCallback(async (): Promise<string | null> => {
        if (!siteKey || !window.grecaptcha) return null;

        try {
            const token = await window.grecaptcha.execute(siteKey, { action: 'login' });
            return token;
        } catch {
            return null;
        }
    }, [siteKey]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // On localhost, skip reCAPTCHA entirely
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            let captchaToken: string | undefined;

            if (!isDev && siteKey) {
                const token = await executeRecaptcha();
                if (token) {
                    try {
                        // Optionally verify score server-side
                        const verifyRes = await fetch('/api/auth/verify-recaptcha', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token }),
                        });
                        const verifyData = await verifyRes.json();
                        if (!verifyData.success || (verifyData.score !== undefined && verifyData.score < 0.3)) {
                            setError('Verificación de seguridad fallida. Intenta de nuevo.');
                            setLoading(false);
                            return;
                        }
                        captchaToken = token;
                    } catch {
                        // If reCAPTCHA verification fetch fails (network error), skip it and proceed
                        console.warn('[Login] reCAPTCHA verify fetch failed, proceeding without captcha');
                    }
                }
            }

            // Supabase login (captcha already verified independently)
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
                setLoading(false);
                return;
            }

            // Redirect to admin dashboard — use absolute URL to ensure correct domain
            const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
            if (isProd) {
                window.location.href = 'https://clickpar.shop/';
            } else {
                router.push('/');
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || 'Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-border bg-card">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#86EFAC]">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="h-9 w-9 text-black"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <CardTitle className="text-2xl font-bold text-foreground">
                        ClickPar Staff
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Ingreso exclusivo para equipo de trabajo
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10"
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    placeholder="Contraseña"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 font-semibold"
                            disabled={loading || (!recaptchaReady && !!siteKey)}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Ingresando...
                                </>
                            ) : (
                                <>
                                    <Shield className="mr-2 h-4 w-4" />
                                    Ingresar
                                </>
                            )}
                        </Button>
                    </form>

                    {siteKey && (
                        <p className="text-[10px] text-muted-foreground/50 text-center">
                            Protegido por Google reCAPTCHA
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
