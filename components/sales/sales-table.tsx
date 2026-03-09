'use client';

import { useState, useMemo } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { NewSaleModal } from '@/components/sales/new-sale-modal';
import { CancelSubscriptionButton } from '@/components/sales/cancel-subscription-button';

interface SalesTableProps {
    sales: any[];
}

export function SalesTable({ sales }: SalesTableProps) {
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState(1);

    // Format date helper
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PY');
    };

    // Paginate sales
    const paginatedSales = useMemo(() => {
        if (pageSize === 0) return sales;
        const start = (currentPage - 1) * pageSize;
        return sales.slice(start, start + pageSize);
    }, [sales, currentPage, pageSize]);

    const totalPages = pageSize === 0 ? 1 : Math.ceil(sales.length / pageSize);

    return (
        <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Historial de Ventas</CardTitle>
                {sales.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Mostrar:</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}
                        >
                            <SelectTrigger className="w-24 bg-[#1a1a1a] border-border h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">30</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="0">Todos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                {sales && sales.length > 0 ? (
                    <div className="space-y-4">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border text-left text-sm text-muted-foreground">
                                        <th className="pb-3 font-medium">Cliente</th>
                                        <th className="pb-3 font-medium">Plataforma</th>
                                        <th className="pb-3 font-medium">Slot</th>
                                        <th className="pb-3 font-medium">Precio</th>
                                        <th className="pb-3 font-medium">Fecha Inicio</th>
                                        <th className="pb-3 font-medium">Vencimiento</th>
                                        <th className="pb-3 font-medium">Estado</th>
                                        <th className="pb-3 font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {paginatedSales.map((sale: any) => (
                                        <tr key={sale.id} className="border-b border-border/50">
                                            <td className="py-3">
                                                <div>
                                                    <p className="font-medium text-foreground">
                                                        {sale.customers?.full_name || 'Sin nombre'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {sale.customers?.phone || 'Sin teléfono'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-3 text-foreground">
                                                {sale.sale_slots?.mother_accounts?.platform || '-'}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {sale.sale_slots?.slot_identifier || '-'}
                                            </td>
                                            <td className="py-3 font-medium text-foreground">
                                                Gs. {sale.amount_gs?.toLocaleString('es-PY')}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {formatDate(sale.start_date)}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {formatDate(sale.end_date || sale.start_date)}
                                            </td>
                                            <td className="py-3">
                                                <span className={`rounded-full px-2 py-1 text-xs font-medium ${sale.is_active
                                                    ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                                    : 'bg-red-500/20 text-red-500'
                                                    }`}>
                                                    {sale.is_active ? 'Activa' : 'Cancelada'}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                {sale.is_active && (
                                                    <CancelSubscriptionButton
                                                        subscriptionId={sale.id}
                                                        slotId={sale.sale_slots?.id}
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {pageSize !== 0 && totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-border/50 pt-4">
                                <span className="text-xs text-muted-foreground">
                                    Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, sales.length)} de {sales.length}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-xs text-muted-foreground px-2">
                                        Pág. {currentPage} de {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                        <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">No hay ventas registradas</p>
                        <div className="mt-4">
                            <NewSaleModal />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
