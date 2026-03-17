'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

interface PlatformVelocity {
    platform: string;
    color: string;
    today: number;
    thisWeek: number;
    thisMonth: number;
    avgPerDay: number;
    prevWeek: number; // for comparison
}

interface SalesVelocityTableProps {
    data: PlatformVelocity[];
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
    if (previous === 0 && current === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    if (previous === 0) return <TrendingUp className="h-3.5 w-3.5 text-[#86EFAC]" />;
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 5) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    if (pct > 0) return (
        <span className="flex items-center gap-0.5 text-xs text-[#86EFAC]">
            <TrendingUp className="h-3.5 w-3.5" />
            +{Math.round(pct)}%
        </span>
    );
    return (
        <span className="flex items-center gap-0.5 text-xs text-red-400">
            <TrendingDown className="h-3.5 w-3.5" />
            {Math.round(pct)}%
        </span>
    );
}

export function SalesVelocityTable({ data }: SalesVelocityTableProps) {
    if (data.length === 0) {
        return (
            <Card className="border-border bg-card">
                <CardContent className="flex flex-col items-center justify-center py-10">
                    <Zap className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">Sin datos de velocidad</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[#86EFAC]" />
                    <CardTitle className="text-base">Velocidad de Ventas</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Cuántos perfiles se venden por período</p>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/50">
                                <th className="pb-2 text-left font-medium text-muted-foreground">Plataforma</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Hoy</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Esta Semana</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Este Mes</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Prom/Día</th>
                                <th className="pb-2 text-center font-medium text-muted-foreground">Tendencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row) => (
                                <tr key={row.platform} className="border-b border-border/20 last:border-0">
                                    <td className="py-2.5">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="h-3 w-3 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: row.color }}
                                            />
                                            <span className="font-medium text-foreground">{row.platform}</span>
                                        </div>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <span className={`font-bold tabular-nums ${row.today > 0 ? 'text-[#86EFAC]' : 'text-muted-foreground'}`}>
                                            {row.today}
                                        </span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <span className="font-semibold tabular-nums text-foreground">{row.thisWeek}</span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <span className="font-semibold tabular-nums text-foreground">{row.thisMonth}</span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <span className="font-semibold tabular-nums text-blue-400">
                                            {row.avgPerDay.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                        <TrendIndicator current={row.thisWeek} previous={row.prevWeek} />
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
