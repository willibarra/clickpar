'use client';

import { DataExportButton, ExportColumn } from '@/components/ui/data-export-button';

interface SalesDataActionsProps {
    sales: any[];
}

const exportColumns: ExportColumn[] = [
    { key: 'id', header: 'ID Venta', width: 12 },
    { key: 'customer_name', header: 'Cliente', width: 20 },
    { key: 'customer_phone', header: 'Teléfono', width: 15 },
    { key: 'platform', header: 'Plataforma', width: 15 },
    { key: 'amount_gs', header: 'Monto (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
    {
        key: 'payment_method', header: 'Método Pago', width: 12, format: (v) => {
            const methods: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', qr: 'QR' };
            return methods[v] || v;
        }
    },
    { key: 'start_date', header: 'Fecha Inicio', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
    { key: 'end_date', header: 'Fecha Fin', width: 12, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
    { key: 'is_active', header: 'Estado', width: 10, format: (v) => v ? 'Activo' : 'Inactivo' },
];

export function SalesDataActions({ sales }: SalesDataActionsProps) {
    // Transformar datos para incluir info de customer y platform
    const transformedSales = sales.map((sale: any) => ({
        ...sale,
        customer_name: sale.customer?.name || 'Sin nombre',
        customer_phone: sale.customer?.phone || '-',
        platform: sale.slot?.mother_account?.platform || '-',
    }));

    return (
        <DataExportButton
            data={transformedSales}
            columns={exportColumns}
            filename="ventas"
            title="Reporte de Ventas"
            subtitle={`Total: ${sales.length} transacciones`}
        />
    );
}
