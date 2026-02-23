'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataExportButton, ExportColumn } from '@/components/ui/data-export-button';
import { BulkImportModal, ImportFieldMapping } from '@/components/ui/bulk-import-modal';
import { bulkImportMotherAccounts } from '@/lib/actions/import';

interface InventoryDataActionsProps {
    accounts: any[];
}

const exportColumns: ExportColumn[] = [
    { key: 'platform', header: 'Plataforma', width: 15 },
    { key: 'email', header: 'Email', width: 30 },
    { key: 'password', header: 'Contraseña', width: 20 },
    { key: 'renewal_date', header: 'Fecha Renovación', width: 15 },
    { key: 'provider', header: 'Proveedor', width: 15 },
    { key: 'purchase_cost_gs', header: 'Costo (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
    { key: 'slot_price_gs', header: 'Precio Venta (Gs)', width: 15, format: (v) => v?.toLocaleString('es-PY') || '0' },
    { key: 'max_slots', header: 'Max Slots', width: 10 },
    { key: 'status', header: 'Estado', width: 12 },
];

const importFieldMappings: ImportFieldMapping[] = [
    { dbField: 'platform', label: 'Plataforma', required: true },
    { dbField: 'email', label: 'Email', required: true },
    { dbField: 'password', label: 'Contraseña', required: false },
    { dbField: 'renewal_date', label: 'Fecha Renovación', required: false },
    { dbField: 'provider', label: 'Proveedor', required: false },
    { dbField: 'purchase_cost_gs', label: 'Costo (Gs)', required: false },
    { dbField: 'slot_price_gs', label: 'Precio Venta (Gs)', required: false },
    { dbField: 'max_slots', label: 'Max Slots', required: false },
];

export function InventoryDataActions({ accounts }: InventoryDataActionsProps) {
    const [importOpen, setImportOpen] = useState(false);

    return (
        <>
            <DataExportButton
                data={accounts}
                columns={exportColumns}
                filename="inventario_cuentas"
                title="Inventario de Cuentas Madre"
                subtitle={`Total: ${accounts.length} cuentas`}
            />
            <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="gap-2"
            >
                <Upload className="h-4 w-4" />
                Importar
            </Button>

            <BulkImportModal
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                entityType="mother_accounts"
                fieldMappings={importFieldMappings}
                onImport={bulkImportMotherAccounts}
            />
        </>
    );
}
