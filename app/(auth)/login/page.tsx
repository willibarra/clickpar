'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, Phone, MessageSquare } from 'lucide-react';

type AuthMethod = 'email' | 'phone';
type PhoneStep = 'input' | 'verify';

export default function LoginPage() {
    // Auth method toggle
    const [authMethod, setAuthMethod] = useState<AuthMethod>('email');

    // Email auth state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Phone auth state
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
    const [countdown, setCountdown] = useState(0);

    // Shared state
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // Email login handler
    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.push('/');
            router.refresh();
        }
    };

    // Phone OTP send handler
    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Format phone number (ensure +595 prefix for Paraguay)
        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+595' + formattedPhone.replace(/^0/, '');
        }

        const { error } = await supabase.auth.signInWithOtp({
            phone: formattedPhone,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            setPhoneStep('verify');
            setLoading(false);
            startCountdown();
        }
    };

    // Phone OTP verify handler
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+595' + formattedPhone.replace(/^0/, '');
        }

        const { error } = await supabase.auth.verifyOtp({
            phone: formattedPhone,
            token: otp,
            type: 'sms',
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.push('/');
            router.refresh();
        }
    };

    // Countdown timer for resend
    const startCountdown = () => {
        setCountdown(60);
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Resend OTP
    const handleResendOtp = async () => {
        if (countdown > 0) return;

        setLoading(true);
        setError(null);

        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+595' + formattedPhone.replace(/^0/, '');
        }

        const { error } = await supabase.auth.signInWithOtp({
            phone: formattedPhone,
        });

        if (error) {
            setError(error.message);
        } else {
            startCountdown();
        }
        setLoading(false);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-border bg-card">
                <CardHeader className="text-center">
                    {/* Logo */}
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#86EFAC]">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="h-8 w-8 text-black"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <CardTitle className="text-2xl font-bold text-foreground">ClickPar</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Ingresa a tu cuenta para continuar
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Auth Method Tabs */}
                    <div className="flex rounded-lg bg-[#1a1a1a] p-1 mb-6">
                        <button
                            type="button"
                            onClick={() => { setAuthMethod('phone'); setError(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${authMethod === 'phone'
                                ? 'bg-[#86EFAC] text-black'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <MessageSquare className="h-4 w-4" />
                            WhatsApp
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAuthMethod('email'); setError(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${authMethod === 'email'
                                ? 'bg-[#86EFAC] text-black'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Mail className="h-4 w-4" />
                            Email
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 mb-4">
                            {error}
                        </div>
                    )}

                    {/* Email Login Form */}
                    {authMethod === 'email' && (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Correo electrónico
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="email"
                                        placeholder="admin@clickpar.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Ingresando...
                                    </>
                                ) : (
                                    'Ingresar'
                                )}
                            </Button>
                        </form>
                    )}

                    {/* Phone Login Form - Step 1: Input Phone */}
                    {authMethod === 'phone' && phoneStep === 'input' && (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Número de WhatsApp
                                </label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="tel"
                                        placeholder="+595 981 123 456"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Te enviaremos un código de verificación por SMS
                                </p>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enviando código...
                                    </>
                                ) : (
                                    <>
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                        Enviar código
                                    </>
                                )}
                            </Button>
                        </form>
                    )}

                    {/* Phone Login Form - Step 2: Verify OTP */}
                    {authMethod === 'phone' && phoneStep === 'verify' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <div className="text-center mb-4">
                                <p className="text-sm text-muted-foreground">
                                    Código enviado a <span className="text-foreground font-medium">{phone}</span>
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setPhoneStep('input')}
                                    className="text-xs text-[#86EFAC] hover:underline"
                                >
                                    Cambiar número
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Código de verificación
                                </label>
                                <Input
                                    type="text"
                                    placeholder="123456"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="text-center text-2xl tracking-widest"
                                    maxLength={6}
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                disabled={loading || otp.length !== 6}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verificando...
                                    </>
                                ) : (
                                    'Verificar código'
                                )}
                            </Button>

                            <div className="text-center">
                                {countdown > 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Reenviar código en <span className="text-foreground">{countdown}s</span>
                                    </p>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResendOtp}
                                        className="text-sm text-[#86EFAC] hover:underline"
                                        disabled={loading}
                                    >
                                        Reenviar código
                                    </button>
                                )}
                            </div>
                        </form>
                    )}

                    {/* Test Users - Temporary */}
                    <div className="mt-6 p-3 rounded-lg bg-[#1a1a1a] border border-border">
                        <p className="text-xs text-muted-foreground mb-2 text-center">Usuarios de prueba (contraseña: Admin123!)</p>
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={() => { setAuthMethod('email'); setEmail('admin@clickpar.com'); setPassword('Admin123!'); }}
                                className="w-full text-left px-2 py-1 text-sm rounded hover:bg-[#86EFAC]/10 text-foreground flex justify-between"
                            >
                                <span>admin@clickpar.com</span>
                                <span className="text-xs text-[#86EFAC]">Admin</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthMethod('email'); setEmail('vendedora@clickpar.com'); setPassword('Admin123!'); }}
                                className="w-full text-left px-2 py-1 text-sm rounded hover:bg-[#86EFAC]/10 text-foreground flex justify-between"
                            >
                                <span>vendedora@clickpar.com</span>
                                <span className="text-xs text-blue-400">Vendedor</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthMethod('email'); setEmail('cliente@clickpar.com'); setPassword('Admin123!'); }}
                                className="w-full text-left px-2 py-1 text-sm rounded hover:bg-[#86EFAC]/10 text-foreground flex justify-between"
                            >
                                <span>cliente@clickpar.com</span>
                                <span className="text-xs text-orange-400">Cliente</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 text-center text-sm text-muted-foreground">
                        ¿No tienes cuenta?{' '}
                        <Link href="/register" className="text-[#86EFAC] hover:underline">
                            Registrarse
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
