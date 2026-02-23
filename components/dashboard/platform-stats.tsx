'use client';

import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Platform {
    id: string;
    name: string;
    color: string;
    icon_letter: string;
}

interface PlatformStatsProps {
    platforms: Platform[];
    stats: Record<string, { available: number; total: number; price: number }>;
}

export function PlatformStats({ platforms, stats }: PlatformStatsProps) {
    // Top 4 plataformas con más slots
    const topPlatforms = platforms
        .filter(p => stats[p.name])
        .sort((a, b) => (stats[b.name]?.total || 0) - (stats[a.name]?.total || 0))
        .slice(0, 4);

    if (topPlatforms.length === 0) {
        return null;
    }

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Plataformas</h2>
                <Link href="/inventory" className="text-sm text-muted-foreground hover:text-foreground">
                    Ver todo →
                </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {topPlatforms.map((platform) => {
                    const stat = stats[platform.name] || { available: 0, total: 0, price: 25000 };
                    const occupancy = stat.total > 0 ? ((stat.total - stat.available) / stat.total) * 100 : 0;

                    return (
                        <Card
                            key={platform.id}
                            className="border-border transition-transform hover:scale-[1.02]"
                            style={{
                                background: `linear-gradient(135deg, ${platform.color}20 0%, #1a1a1a 100%)`
                            }}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-white font-bold"
                                        style={{ backgroundColor: platform.color }}
                                    >
                                        {platform.icon_letter}
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{platform.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {stat.available} disponibles
                                        </p>
                                    </div>
                                </div>

                                {/* Occupancy Bar */}
                                <div className="mt-3">
                                    <div className="mb-1 flex justify-between text-xs">
                                        <span className="text-muted-foreground">Ocupación</span>
                                        <span className="text-foreground">{Math.round(occupancy)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-[#333]">
                                        <div
                                            className="h-1.5 rounded-full transition-all"
                                            style={{
                                                width: `${occupancy}%`,
                                                backgroundColor: occupancy > 80 ? '#F97316' : '#86EFAC'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <p className="text-xl font-bold text-foreground">
                                        Gs. {stat.price.toLocaleString('es-PY')}
                                    </p>
                                    <p className="text-xs text-[#86EFAC]">
                                        {stat.total - stat.available} / {stat.total} vendidos
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
