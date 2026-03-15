import { TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AccountROI {
    id: string;
    email: string;
    platform: string;
    cost: number;
    income: number;
    profit: number;
    margin: number;
    activeSales: number;
}

interface AccountROITableProps {
    data: AccountROI[];
}

export function AccountROITable({ data }: AccountROITableProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                Sin datos en este período
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Cuenta</th>
                        <th className="pb-2 text-right font-medium">Costo</th>
                        <th className="pb-2 text-right font-medium">Ingresos</th>
                        <th className="pb-2 text-right font-medium">Ganancia</th>
                        <th className="pb-2 text-right font-medium">Margen</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                    {data.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 pr-4">
                                <div className="flex items-center gap-2">
                                    <div>
                                        <p className="font-medium text-foreground truncate max-w-[200px]">{row.email}</p>
                                        <p className="text-xs text-muted-foreground">{row.platform} · {row.activeSales} ventas</p>
                                    </div>
                                </div>
                            </td>
                            <td className="py-2.5 text-right text-orange-400 tabular-nums">
                                Gs. {row.cost.toLocaleString('es-PY')}
                            </td>
                            <td className="py-2.5 text-right text-[#86EFAC] tabular-nums">
                                Gs. {row.income.toLocaleString('es-PY')}
                            </td>
                            <td className="py-2.5 text-right tabular-nums">
                                <span className={row.profit >= 0 ? 'text-[#86EFAC]' : 'text-red-400'}>
                                    {row.profit >= 0 ? '+' : ''}Gs. {row.profit.toLocaleString('es-PY')}
                                </span>
                            </td>
                            <td className="py-2.5 text-right">
                                <Badge
                                    variant="outline"
                                    className={`text-xs tabular-nums ${row.margin >= 0
                                        ? 'border-green-500/30 text-green-400'
                                        : 'border-red-500/30 text-red-400'
                                        }`}
                                >
                                    {row.margin >= 0
                                        ? <TrendingUp className="inline h-3 w-3 mr-1" />
                                        : <TrendingDown className="inline h-3 w-3 mr-1" />
                                    }
                                    {row.margin.toFixed(1)}%
                                </Badge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
