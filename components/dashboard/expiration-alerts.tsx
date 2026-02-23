'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Calendar, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ExpiringAccount {
    id: string;
    platform: string;
    email: string;
    renewal_date: string;
}

interface ExpiringSale {
    id: string;
    end_date: string;
    amount_gs: number;
    customers: { full_name: string; phone: string } | null;
    sale_slots: {
        slot_identifier: string | null;
        mother_accounts: { platform: string; email: string } | null;
    } | null;
}

interface ExpirationAlertsProps {
    accounts: ExpiringAccount[];
    expiringSales?: ExpiringSale[];
}

export function ExpirationAlerts({ accounts, expiringSales = [] }: ExpirationAlertsProps) {
    const getDaysUntil = (dateStr: string): number => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        target.setHours(0, 0, 0, 0);
        return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    // Contar cuentas madre por urgencia
    const accountsExpired = accounts.filter(a => getDaysUntil(a.renewal_date) < 0).length;
    const accountsToday = accounts.filter(a => getDaysUntil(a.renewal_date) === 0).length;
    const accountsSoon = accounts.filter(a => getDaysUntil(a.renewal_date) > 0 && getDaysUntil(a.renewal_date) <= 3).length;

    // Contar ventas de clientes por urgencia
    const salesExpired = expiringSales.filter(s => getDaysUntil(s.end_date) < 0).length;
    const salesToday = expiringSales.filter(s => getDaysUntil(s.end_date) === 0).length;
    const salesSoon = expiringSales.filter(s => getDaysUntil(s.end_date) > 0 && getDaysUntil(s.end_date) <= 3).length;

    const totalExpired = accountsExpired + salesExpired;
    const totalToday = accountsToday + salesToday;
    const totalSoon = accountsSoon + salesSoon;
    const totalAlerts = accounts.length + expiringSales.length;

    // Sin vencimientos
    if (totalAlerts === 0) {
        return (
            <Card className="border-border bg-[#1a1a1a]">
                <CardContent className="py-8">
                    <div className="flex flex-col items-center justify-center text-center">
                        <div className="rounded-full bg-[#86EFAC]/20 p-4">
                            <Clock className="h-8 w-8 text-[#86EFAC]" />
                        </div>
                        <p className="mt-4 text-muted-foreground">
                            No hay vencimientos próximos
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const hasUrgent = totalToday > 0 || totalExpired > 0;

    return (
        <Link href="/renewals">
            <Card className={`border-border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${hasUrgent
                ? 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-[#1a1a1a] hover:border-red-500/70'
                : 'bg-gradient-to-br from-[#F97316]/10 to-[#1a1a1a] hover:border-[#F97316]/50'
                }`}>
                <CardContent className="py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`rounded-full p-3 ${hasUrgent ? 'bg-red-500/20' : 'bg-[#F97316]/20'}`}>
                                <AlertTriangle className={`h-7 w-7 ${hasUrgent ? 'text-red-500 animate-pulse' : 'text-[#F97316]'}`} />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Vencimientos</p>
                                <p className="text-3xl font-bold text-foreground">{totalAlerts}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Desglose */}
                            <div className="flex flex-col gap-1.5 text-right">
                                {totalExpired > 0 && (
                                    <div className="flex items-center gap-2 justify-end">
                                        <span className="text-sm font-medium text-red-500">
                                            {totalExpired} vencido{totalExpired > 1 ? 's' : ''}
                                        </span>
                                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                    </div>
                                )}
                                {totalToday > 0 && (
                                    <div className="flex items-center gap-2 justify-end">
                                        <span className="text-sm font-medium text-red-400">
                                            {totalToday} hoy
                                        </span>
                                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                    </div>
                                )}
                                {totalSoon > 0 && (
                                    <div className="flex items-center gap-2 justify-end">
                                        <span className="text-sm font-medium text-[#F97316]">
                                            {totalSoon} en 1-3 días
                                        </span>
                                        <div className="h-2 w-2 rounded-full bg-[#F97316]" />
                                    </div>
                                )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
