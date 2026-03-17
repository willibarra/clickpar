'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, AlertTriangle, Clock, ShoppingCart } from 'lucide-react';

interface StockForecastItem {
    platform: string;
    color: string;
    available: number;
    avgPerDay: number;
    daysLeft: number; // Infinity if avgPerDay === 0
    recommendBuy: number; // recommended units to buy for 2 weeks
}

interface StockForecastProps {
    data: StockForecastItem[];
}

function urgencyLevel(daysLeft: number): 'critical' | 'warning' | 'ok' {
    if (daysLeft <= 3) return 'critical';
    if (daysLeft <= 7) return 'warning';
    return 'ok';
}

const urgencyStyles = {
    critical: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-400',
        label: '⚠️ Crítico',
    },
    warning: {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        text: 'text-orange-400',
        badge: 'bg-orange-500/20 text-orange-400',
        label: '⏰ Bajo',
    },
    ok: {
        bg: 'bg-[#86EFAC]/5',
        border: 'border-[#86EFAC]/20',
        text: 'text-[#86EFAC]',
        badge: 'bg-[#86EFAC]/20 text-[#86EFAC]',
        label: '✅ OK',
    },
};

export function StockForecast({ data }: StockForecastProps) {
    // Sort: critical first, then warning, then ok
    const sorted = [...data].sort((a, b) => a.daysLeft - b.daysLeft);

    if (sorted.length === 0) {
        return (
            <Card className="border-border bg-card">
                <CardContent className="flex flex-col items-center justify-center py-10">
                    <Package className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">Sin datos de stock</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-400" />
                    <CardTitle className="text-base">Predicción de Stock</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Estimación de días hasta agotar existencias</p>
            </CardHeader>
            <CardContent className="space-y-3">
                {sorted.map((item) => {
                    const urgency = urgencyLevel(item.daysLeft);
                    const style = urgencyStyles[urgency];
                    const isInfinite = !isFinite(item.daysLeft);

                    return (
                        <div
                            key={item.platform}
                            className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className="h-3 w-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="font-medium text-foreground">{item.platform}</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${style.badge}`}>
                                    {style.label}
                                </span>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{item.available}</p>
                                    <p className="text-[10px] text-muted-foreground">Disponibles</p>
                                </div>
                                <div>
                                    <p className={`text-lg font-bold tabular-nums ${style.text}`}>
                                        {isInfinite ? '∞' : item.daysLeft}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Días restantes</p>
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{item.avgPerDay.toFixed(1)}</p>
                                    <p className="text-[10px] text-muted-foreground">Ventas/día</p>
                                </div>
                            </div>

                            {item.recommendBuy > 0 && !isInfinite && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <ShoppingCart className="h-3 w-3" />
                                    <span>
                                        Recomendado: comprar <strong className="text-foreground">{item.recommendBuy}</strong> para cubrir 2 semanas
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
