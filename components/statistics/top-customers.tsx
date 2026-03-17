'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Crown } from 'lucide-react';

interface TopCustomer {
    name: string;
    phone: string | null;
    totalSales: number;
    totalAmount: number;
    renewals: number;
    expired: number;
    renewalRate: number; // 0-100
    platforms: string[];
}

interface TopCustomersProps {
    data: TopCustomer[];
    globalRenewalRate: number;
    globalChurnRate: number;
}

function RenewalBadge({ rate }: { rate: number }) {
    const color = rate >= 70 ? 'text-[#86EFAC] bg-[#86EFAC]/10' :
        rate >= 40 ? 'text-orange-400 bg-orange-400/10' :
            'text-red-400 bg-red-400/10';
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums ${color}`}>
            {rate}%
        </span>
    );
}

export function TopCustomers({ data, globalRenewalRate, globalChurnRate }: TopCustomersProps) {
    if (data.length === 0) return null;

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#F97316]" />
                        <CardTitle className="text-base">Top Clientes</CardTitle>
                    </div>
                    <div className="flex gap-3">
                        <div className="text-right">
                            <p className="text-xs text-muted-foreground">Tasa Renovación</p>
                            <p className={`text-sm font-bold tabular-nums ${globalRenewalRate >= 60 ? 'text-[#86EFAC]' : 'text-orange-400'}`}>
                                {globalRenewalRate}%
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-muted-foreground">Churn</p>
                            <p className={`text-sm font-bold tabular-nums ${globalChurnRate <= 20 ? 'text-[#86EFAC]' : 'text-red-400'}`}>
                                {globalChurnRate}%
                            </p>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/50">
                                <th className="pb-2 text-left font-medium text-muted-foreground">#</th>
                                <th className="pb-2 text-left font-medium text-muted-foreground">Cliente</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Compras</th>
                                <th className="pb-2 text-right font-medium text-muted-foreground">Total Gs.</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Renovación</th>
                                <th className="pb-2 text-left font-medium text-muted-foreground">Plataformas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((customer, i) => (
                                <tr key={customer.phone || customer.name} className="border-b border-border/20 last:border-0">
                                    <td className="py-2.5">
                                        {i < 3 ? (
                                            <Crown className={`h-4 w-4 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-orange-600'}`} />
                                        ) : (
                                            <span className="text-muted-foreground text-xs">{i + 1}</span>
                                        )}
                                    </td>
                                    <td className="py-2.5">
                                        <p className="font-medium text-foreground truncate max-w-[140px]">{customer.name}</p>
                                        {customer.phone && (
                                            <p className="text-[10px] text-muted-foreground">{customer.phone}</p>
                                        )}
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <span className="font-bold tabular-nums text-foreground">{customer.totalSales}</span>
                                    </td>
                                    <td className="py-2.5 text-right">
                                        <span className="font-semibold tabular-nums text-[#86EFAC]">
                                            {customer.totalAmount.toLocaleString('es-PY')}
                                        </span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <RenewalBadge rate={customer.renewalRate} />
                                    </td>
                                    <td className="py-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {customer.platforms.slice(0, 3).map(p => (
                                                <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                    {p}
                                                </span>
                                            ))}
                                            {customer.platforms.length > 3 && (
                                                <span className="text-[10px] text-muted-foreground">+{customer.platforms.length - 3}</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
