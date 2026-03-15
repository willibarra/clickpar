'use client';

import { DataExportButton, ExportColumn } from '@/components/ui/data-export-button';

interface FinanceDataActionsProps {
    sales: any[];
    expenses: any[];
    inventoryPurchases: any[];
    totalIncome: number;
    totalExpenses: number;
}

const reportColumns: ExportColumn[] = [
    { key: 'fecha', header: 'Fecha', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
    { key: 'tipo', header: 'Tipo', width: 18 },
    { key: 'descripcion', header: 'Descripción', width: 40 },
    { key: 'categoria', header: 'Categoría', width: 16 },
    { key: 'monto', header: 'Monto (Gs)', width: 16, format: (v) => v?.toLocaleString('es-PY') || '0' },
];

export function FinanceDataActions({
    sales,
    expenses,
    inventoryPurchases,
    totalIncome,
    totalExpenses,
}: FinanceDataActionsProps) {
    const combinedData = [
        ...sales.map((s: any) => ({
            fecha: s.created_at,
            tipo: 'Ingreso',
            descripcion: `Venta de servicio`,
            categoria: 'Venta',
            monto: Number(s.amount_gs) || 0,
        })),
        ...expenses.map((e: any) => ({
            fecha: e.created_at,
            tipo: e.expense_type === 'renewal' ? 'Egreso — Renovación' : 'Egreso — Gasto Op.',
            descripcion: e.description || 'Gasto operativo',
            categoria: e.expense_type || 'operativo',
            monto: -(Number(e.amount_gs) || 0),
        })),
        ...inventoryPurchases.map((p: any) => ({
            fecha: p.created_at,
            tipo: 'Egreso — Compra Inventario',
            descripcion: `${p.platform} — ${p.email}`,
            categoria: 'inventario',
            monto: -(Number(p.purchase_cost_gs) || 0),
        })),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const netProfit = totalIncome - totalExpenses;

    return (
        <DataExportButton
            data={combinedData}
            columns={reportColumns}
            filename="reporte_financiero"
            title="Reporte Financiero — ClickPar"
            subtitle={`Ingresos: ${totalIncome.toLocaleString('es-PY')} Gs | Egresos: ${totalExpenses.toLocaleString('es-PY')} Gs | Balance: ${netProfit.toLocaleString('es-PY')} Gs`}
        />
    );
}
