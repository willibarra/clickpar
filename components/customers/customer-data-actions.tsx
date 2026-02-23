'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataExportButton, ExportColumn } from '@/components/ui/data-export-button';
import { BulkImportModal, ImportFieldMapping } from '@/components/ui/bulk-import-modal';
import { bulkImportCustomers } from '@/lib/actions/import';

interface CustomerDataActionsProps {
    customers: any[];
}

const exportColumns: ExportColumn[] = [
    { key: 'name', header: 'Nombre', width: 25 },
    { key: 'phone', header: 'Teléfono', width: 20 },
    { key: 'total_spent', header: 'Total Gastado (Gs)', width: 18, format: (v) => v?.toLocaleString('es-PY') || '0' },
    { key: 'active_subscriptions', header: 'Suscripciones Activas', width: 18 },
    { key: 'notes', header: 'Notas', width: 30 },
    { key: 'created_at', header: 'Fecha Registro', width: 15, format: (v) => v ? new Date(v).toLocaleDateString('es-PY') : '' },
];

const importFieldMappings: ImportFieldMapping[] = [
    { dbField: 'name', label: 'Nombre', required: false },
    { dbField: 'phone', label: 'Teléfono', required: true },
    { dbField: 'notes', label: 'Notas', required: false },
];

export function CustomerDataActions({ customers }: CustomerDataActionsProps) {
    const [importOpen, setImportOpen] = useState(false);

    return (
        <>
            <DataExportButton
                data={customers}
                columns={exportColumns}
                filename="clientes"
                title="Lista de Clientes"
                subtitle={`Total: ${customers.length} clientes`}
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
                entityType="customers"
                fieldMappings={importFieldMappings}
                onImport={bulkImportCustomers}
            />
        </>
    );
}
