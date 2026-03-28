'use client';

import { useState } from 'react';
import { UserPlus, X, Eye, EyeOff } from 'lucide-react';
import { createUser } from '@/lib/actions/users';

interface Props {
    onCreated?: () => void;
}

export function NewResellerUserModal({ onCreated }: Props) {
    const [open, setOpen] = useState(false);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const reset = () => {
        setFullName(''); setEmail(''); setPhone(''); setPassword('');
        setStatus('idle'); setErrorMsg('');
    };

    const handleOpen = () => { reset(); setOpen(true); };
    const handleClose = () => { setOpen(false); reset(); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName || !email || !password) return;
        setStatus('loading');

        const result = await createUser({
            email,
            password,
            fullName,
            phoneNumber: phone || undefined,
            role: 'reseller',
        });

        if (result.error) {
            setStatus('error');
            setErrorMsg(result.error);
        } else {
            setStatus('success');
            setTimeout(() => {
                handleClose();
                window.location.reload();
            }, 1200);
        }
    };

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
                <UserPlus className="h-4 w-4" />
                Nuevo Revendedor
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
                    <div
                        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl z-10"
                        style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-white">Nuevo Revendedor</h2>
                                <p className="text-xs mt-0.5" style={{ color: '#8b8ba7' }}>
                                    Se creará un usuario con rol <span style={{ color: '#a5b4fc' }}>reseller</span>
                                </p>
                            </div>
                            <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                                <X className="h-4 w-4 text-white" />
                            </button>
                        </div>

                        {status === 'success' ? (
                            <div className="py-8 text-center">
                                <div className="h-14 w-14 mx-auto mb-3 flex items-center justify-center rounded-full" style={{ background: 'rgba(134,239,172,0.2)' }}>
                                    <UserPlus className="h-7 w-7 text-green-400" />
                                </div>
                                <p className="text-white font-semibold">¡Revendedor creado!</p>
                                <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                                    Ya puede iniciar sesión en <code className="text-indigo-400">clickpar.shop</code>
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Full name */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Nombre completo <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        placeholder="Ej: Juan Pérez"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Email <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="revendedor@email.com"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Phone */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">Teléfono / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="Ej: 0981123456"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Contraseña <span className="text-red-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            minLength={6}
                                            placeholder="Mínimo 6 caracteres"
                                            className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Info box */}
                                <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                    <p className="text-xs" style={{ color: '#a5b4fc' }}>
                                        ✓ El revendedor iniciará sesión en <strong>clickpar.shop</strong> y será redirigido automáticamente a su panel en <strong>/reseller</strong>.
                                    </p>
                                </div>

                                {status === 'error' && (
                                    <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                                        {errorMsg}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={status === 'loading' || !fullName || !email || !password}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                >
                                    {status === 'loading' ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <UserPlus className="h-4 w-4" />
                                            Crear Revendedor
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
