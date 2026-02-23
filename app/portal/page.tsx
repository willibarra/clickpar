'use client';

import { useEffect, useState } from 'react';
import { ServiceCard } from '@/components/portal/service-card';
import { Loader2, Tv, AlertTriangle, ShieldCheck } from 'lucide-react';

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
}

export default function PortalDashboard() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState('');

    useEffect(() => {
        fetch('/api/portal/services')
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setServices(data.services);
                    setCustomerName(data.customer?.name || '');
                } else {
                    setError(data.error || 'Error al cargar servicios');
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    }, []);

    // Count expiring soon
    const expiringSoon = services.filter((s) => {
        if (!s.expiresAt) return false;
        const days = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 3;
    });

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

    return (
        <div className="space-y-6">
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
