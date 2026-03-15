interface PlatformStat {
    platform: string;
    income: number;
    sales: number;
}

interface PlatformBreakdownProps {
    data: PlatformStat[];
    total: number;
}

const PLATFORM_COLORS: Record<string, string> = {
    spotify:     '#1DB954',
    netflix:     '#E50914',
    disney:      '#113CCF',
    hbo:         '#5822E3',
    youtube:     '#FF0000',
    amazon:      '#00A8E1',
    paramount:   '#0064FF',
    crunchyroll: '#F47521',
    vix:         '#FF6B35',
    flujo:       '#9B59B6',
};

function getPlatformColor(name: string): string {
    const key = name.toLowerCase();
    for (const [k, v] of Object.entries(PLATFORM_COLORS)) {
        if (key.includes(k)) return v;
    }
    return '#6B7280';
}

export function PlatformBreakdown({ data, total }: PlatformBreakdownProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                Sin ventas en este período
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {data.map((item) => {
                const pct = total > 0 ? (item.income / total) * 100 : 0;
                const color = getPlatformColor(item.platform);

                return (
                    <div key={item.platform} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span
                                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="font-medium text-foreground">{item.platform}</span>
                                <span className="text-xs text-muted-foreground">({item.sales} ventas)</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                                <span className="font-semibold" style={{ color }}>
                                    Gs. {item.income.toLocaleString('es-PY')}
                                </span>
                            </div>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
