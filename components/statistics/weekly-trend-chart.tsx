'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface WeeklyTrendData {
    platform: string;
    color: string;
    weeks: { label: string; count: number }[]; // 4 weeks, oldest first
}

interface WeeklyTrendChartProps {
    data: WeeklyTrendData[];
}

function MiniBarChart({ weeks, color }: { weeks: { label: string; count: number }[]; color: string }) {
    const max = Math.max(...weeks.map(w => w.count), 1);

    return (
        <div className="flex items-end gap-1.5 h-12">
            {weeks.map((week, i) => {
                const height = (week.count / max) * 100;
                const isLast = i === weeks.length - 1;
                return (
                    <div key={week.label} className="flex flex-col items-center gap-0.5 flex-1">
                        <span className="text-[9px] text-muted-foreground tabular-nums">{week.count}</span>
                        <div
                            className="w-full rounded-sm transition-all duration-500 min-h-[2px]"
                            style={{
                                height: `${Math.max(height, 4)}%`,
                                backgroundColor: color,
                                opacity: isLast ? 1 : 0.4 + (i * 0.15),
                            }}
                        />
                        <span className="text-[8px] text-muted-foreground">{week.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

function WeekComparison({ weeks }: { weeks: { count: number }[] }) {
    if (weeks.length < 2) return null;
    const current = weeks[weeks.length - 1].count;
    const previous = weeks[weeks.length - 2].count;

    if (previous === 0 && current === 0) {
        return <span className="text-xs text-muted-foreground">Sin cambio</span>;
    }
    if (previous === 0) {
        return <span className="text-xs text-[#86EFAC]">+{current} nuevas</span>;
    }

    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 5) {
        return <span className="text-xs text-muted-foreground">≈ Igual</span>;
    }
    if (pct > 0) {
        return <span className="text-xs text-[#86EFAC]">↑ {Math.round(pct)}% vs anterior</span>;
    }
    return <span className="text-xs text-red-400">↓ {Math.round(Math.abs(pct))}% vs anterior</span>;
}

export function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
    if (data.length === 0) return null;

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-400" />
                    <CardTitle className="text-base">Tendencia Semanal</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Ventas por semana — últimas 4 semanas</p>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.map((item) => (
                        <div
                            key={item.platform}
                            className="rounded-lg border border-border/40 bg-[#1a1a1a] p-3"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-sm font-medium text-foreground">{item.platform}</span>
                                </div>
                                <WeekComparison weeks={item.weeks} />
                            </div>
                            <MiniBarChart weeks={item.weeks} color={item.color} />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
