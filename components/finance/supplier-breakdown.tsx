import { Package } from 'lucide-react';

interface SupplierStat {
    supplier: string;
    cost: number;
    income: number;
    accounts: number;
    profit: number;
}

interface SupplierBreakdownProps {
    data: SupplierStat[];
}

export function SupplierBreakdown({ data }: SupplierBreakdownProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                Sin datos de proveedores en este período
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((item) => {
                const margin = item.income > 0
                    ? ((item.profit / item.income) * 100)
                    : item.cost > 0 ? -100 : 0;
                const isPositive = item.profit >= 0;

                return (
                    <div
                        key={item.supplier}
                        className="rounded-lg border border-border bg-card/50 p-4 space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-muted p-1.5">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <span className="font-semibold text-sm">{item.supplier || 'Sin proveedor'}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{item.accounts} cta{item.accounts !== 1 ? 's' : ''}</span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Invertido:</span>
                                <span className="text-orange-400 tabular-nums">Gs. {item.cost.toLocaleString('es-PY')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Ingresos:</span>
                                <span className="text-[#86EFAC] tabular-nums">Gs. {item.income.toLocaleString('es-PY')}</span>
                            </div>
                            <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                                <span>Ganancia:</span>
                                <span
                                    className={`tabular-nums ${isPositive ? 'text-[#86EFAC]' : 'text-red-400'}`}
                                >
                                    {isPositive ? '+' : ''}Gs. {item.profit.toLocaleString('es-PY')}
                                </span>
                            </div>
                        </div>

                        <div className="pt-1">
                            <div className="text-xs text-muted-foreground mb-1">
                                Margen: <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
                                    {margin.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isPositive ? 'bg-[#86EFAC]' : 'bg-red-400'}`}
                                    style={{ width: `${Math.min(Math.abs(margin), 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
