'use client';

import { DataExportButton, ExportColumn } from '@/components/ui/data-export-button';

interface FinanceDataActionsProps {
    sales: any[];
    expenses: any[];
    totalIncome: number;
    totalExpenses: number;
}

const salesColumns: ExportColumn[] = [
    { key: 'date', header: 'Fecha', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
    { key: 'customer', header: 'Cliente', width: 20 },
    { key: 'platform', header: 'Plataforma', width: 15 },
    { key: 'amount', header: 'Monto (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
    { key: 'method', header: 'Método', width: 12 },
];

const expensesColumns: ExportColumn[] = [
    { key: 'date', header: 'Fecha', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
    { key: 'description', header: 'Descripción', width: 30 },
    { key: 'category', header: 'Categoría', width: 15 },
    { key: 'amount', header: 'Monto (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
];

export function FinanceDataActions({ sales, expenses, totalIncome, totalExpenses }: FinanceDataActionsProps) {
    // Combinar ingresos y gastos para reporte general
    const combinedData = [
        ...sales.map((s: any) => ({
            tipo: 'Ingreso',
            fecha: s.start_date,
            descripcion: `Venta ${s.slot?.mother_account?.platform || 'Servicio'}`,
            categoria: 'Venta',
            monto: s.amount_gs,
        })),
        ...expenses.map((e: any) => ({
            tipo: 'Gasto',
            fecha: e.date,
            descripcion: e.description,
            categoria: e.category,
            monto: -e.amount,
        }))
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const reportColumns: ExportColumn[] = [
        { key: 'fecha', header: 'Fecha', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
        { key: 'tipo', header: 'Tipo', width: 10 },
        { key: 'descripcion', header: 'Descripción', width: 35 },
        { key: 'categoria', header: 'Categoría', width: 15 },
        { key: 'monto', header: 'Monto (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
    ];

    const netProfit = totalIncome - totalExpenses;

    return (
        <DataExportButton
            data={combinedData}
            columns={reportColumns}
            filename="reporte_financiero"
            title="Reporte Financiero - Cierre de Caja"
            subtitle={`Ingresos: ${totalIncome.toLocaleString('es-PY')} Gs | Gastos: ${totalExpenses.toLocaleString('es-PY')} Gs | Balance: ${netProfit.toLocaleString('es-PY')} Gs`}
        />
    );
}
