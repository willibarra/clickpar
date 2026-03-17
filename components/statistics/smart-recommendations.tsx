'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users, Package } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

type Priority = 'high' | 'medium' | 'info';

interface Recommendation {
    id: string;
    title: string;
    description: string;
    priority: Priority;
    icon: 'trending_up' | 'trending_down' | 'alert' | 'dollar' | 'users' | 'package';
    category: string;
}

interface SmartRecommendationsProps {
    recommendations: Recommendation[];
}

const iconMap: Record<string, LucideIcon> = {
    trending_up: TrendingUp,
    trending_down: TrendingDown,
    alert: AlertTriangle,
    dollar: DollarSign,
    users: Users,
    package: Package,
};

const priorityStyles: Record<Priority, { bg: string; border: string; iconColor: string }> = {
    high: {
        bg: 'bg-red-500/5',
        border: 'border-red-500/20',
        iconColor: 'text-red-400',
    },
    medium: {
        bg: 'bg-orange-500/5',
        border: 'border-orange-500/20',
        iconColor: 'text-orange-400',
    },
    info: {
        bg: 'bg-blue-500/5',
        border: 'border-blue-500/20',
        iconColor: 'text-blue-400',
    },
};

export function SmartRecommendations({ recommendations }: SmartRecommendationsProps) {
    if (recommendations.length === 0) {
        return (
            <Card className="border-border bg-card">
                <CardContent className="flex flex-col items-center justify-center py-10">
                    <Lightbulb className="mb-3 h-10 w-10 text-[#86EFAC]" />
                    <p className="text-foreground font-medium">¡Todo bien!</p>
                    <p className="text-muted-foreground text-sm">No hay recomendaciones por ahora</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-400" />
                    <CardTitle className="text-base">Recomendaciones</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Insights basados en tus datos de ventas</p>
            </CardHeader>
            <CardContent className="space-y-2">
                {recommendations.map((rec) => {
                    const style = priorityStyles[rec.priority];
                    const Icon = iconMap[rec.icon] || Lightbulb;

                    return (
                        <div
                            key={rec.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 ${style.bg} ${style.border}`}
                        >
                            <div className={`mt-0.5 flex-shrink-0 ${style.iconColor}`}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">{rec.title}</p>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                                        {rec.category}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
