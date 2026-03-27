'use client';

import { useEffect, useState } from 'react';
import { ServiceCard } from '@/components/portal/service-card';
import { Loader2, Tv, AlertTriangle, ShieldCheck, Copy, Check, Zap, Lock } from 'lucide-react';

interface Service {
    saleId: string;
    platform: string;
    email: string;
    password: string;
    pin: string | null;
    profile: string | null;
    startDate: string;
    expiresAt: string | null;
    renewalDate: string | null;
    amount: number;
    supplierName: string | null;
    needsCode: boolean;
    codeUrl: string | null;
}

export default function PortalDashboard() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerType, setCustomerType] = useState<string>('cliente');
    const [creatorSlug, setCreatorSlug] = useState<string | null>(null);
    const [copiedSlug, setCopiedSlug] = useState(false);
    const [panelDisabled, setPanelDisabled] = useState(false);

    useEffect(() => {
        fetch('/api/portal/services')
            .then((r) => {
                // If API returns 401, redirect to login immediately
                if (r.status === 401) {
                    window.location.href = '/cliente/login';
                    return null;
                }
                return r.json();
            })
            .then((data) => {
                if (!data) return; // redirecting
                if (data.success) {
                    setServices(data.services);
                    setCustomerName(data.customer?.name || '');
                    setCustomerType(data.customer?.customerType || 'cliente');
                    setCreatorSlug(data.customer?.creatorSlug || null);
                    setPanelDisabled(data.customer?.panelDisabled ?? false);
                } else {
                    // If error is auth-related, redirect to login
                    if (data.error === 'No autenticado' || data.error?.includes('autenticado')) {
                        window.location.href = '/cliente/login';
                        return;
                    }
                    setError(data.error || 'Error al cargar servicios');
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    }, []);

    const expiringSoon = services.filter((s) => {
        if (!s.expiresAt) return false;
        const days = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 3;
    });

    const handleCopySlug = async () => {
        if (!creatorSlug) return;
        await navigator.clipboard.writeText(`clickpar.net/${creatorSlug}`);
        setCopiedSlug(true);
        setTimeout(() => setCopiedSlug(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-full bg-red-500/10 p-4">
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    // Fix 3 — Panel disabled: show "Plan vencido" screen
    if (panelDisabled) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center px-4">
                <div className="rounded-full bg-muted/50 p-6">
                    <Lock className="h-10 w-10 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Tu plan ha vencido</h2>
                    <p className="text-sm text-muted-foreground max-w-xs">
                        Tu acceso a los servicios de streaming fue suspendido.
                        Renová para volver a disfrutar de tu contenido favorito.
                    </p>
                </div>
                <a
                    href="https://wa.me/595994540904?text=Hola%2C%20quisiera%20renovar%20mi%20plan"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#86EFAC] px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90 active:scale-95"
                >
                    Renovar vía WhatsApp
                </a>
                <p className="text-xs text-muted-foreground">
                    Si creés que es un error, contactá al soporte.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Creator URL banner — only for creadores with a slug */}
            {customerType === 'creador' && creatorSlug && (
                <div className="overflow-hidden rounded-2xl border border-[#818CF8]/40 bg-gradient-to-r from-[#818CF8]/10 to-[#86EFAC]/10">
                    <div className="flex items-center gap-2 border-b border-[#818CF8]/20 bg-[#818CF8]/10 px-4 py-2">
                        <Zap className="h-4 w-4 text-[#818CF8]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#818CF8]">Tu URL de Creador</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Compartí este link para que te reconozcan como creador</p>
                            <p className="font-mono text-sm font-semibold text-foreground truncate">
                                clickpar.net/<span className="text-[#86EFAC]">{creatorSlug}</span>
                            </p>
                        </div>
                        <button
                            onClick={handleCopySlug}
                            className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                                copiedSlug
                                    ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                    : 'bg-[#818CF8]/20 text-[#818CF8] hover:bg-[#818CF8]/30'
                            }`}
                        >
                            {copiedSlug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedSlug ? 'Copiado!' : 'Copiar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Welcome */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    Hola{customerName ? `, ${customerName.split(' ')[0]}` : ''} 👋
                </h1>
                <p className="text-sm text-muted-foreground">
                    {services.length > 0
                        ? `Tenés ${services.length} servicio${services.length !== 1 ? 's' : ''} activo${services.length !== 1 ? 's' : ''}`
                        : 'No tenés servicios activos'}
                </p>
            </div>

            {/* Expiring soon alert */}
            {expiringSoon.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-400" />
                    <div>
                        <p className="text-sm font-medium text-orange-300">
                            {expiringSoon.length} servicio{expiringSoon.length !== 1 ? 's' : ''} por vencer
                        </p>
                        <p className="mt-1 text-xs text-orange-400/80">
                            Renová a tiempo para no perder acceso. Escribinos al 0994 540 904.
                        </p>
                    </div>
                </div>
            )}

            {/* Services grid */}
            {services.length > 0 ? (
                <div className="space-y-4">
                    {services.map((service) => (
                        <ServiceCard
                            key={service.saleId}
                            saleId={service.saleId}
                            platform={service.platform}
                            email={service.email}
                            password={service.password}
                            pin={service.pin}
                            profile={service.profile}
                            expiresAt={service.expiresAt}
                            supplierName={service.supplierName}
                            needsCode={service.needsCode}
                            codeUrl={service.codeUrl}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-16 text-center">
                    <div className="rounded-full bg-muted p-4">
                        <Tv className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-medium text-foreground">Sin servicios activos</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Escribinos para contratar tu streaming favorito
                        </p>
                    </div>
                    <a
                        href="https://wa.me/595994540904?text=Hola%20quiero%20contratar%20un%20servicio"
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#86EFAC] px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-[#86EFAC]/90"
                    >
                        Contratar vía WhatsApp
                    </a>
                </div>
            )}

            {/* Security note */}
            <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#86EFAC]" />
                <p className="text-xs text-muted-foreground">
                    Tus credenciales son privadas. No las compartas con nadie.
                    Si necesitás cambiar tu contraseña, contactá a soporte.
                </p>
            </div>
        </div>
    );
}
