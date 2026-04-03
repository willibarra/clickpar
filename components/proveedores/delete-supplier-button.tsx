'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteSupplier } from '@/lib/actions/suppliers';

export function DeleteSupplierButton({ supplierId, supplierName }: { supplierId: string, supplierName: string }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirm(`¿Estás seguro de eliminar el proveedor "${supplierName}"? Todas sus cuentas pasarán a "SIN PROVEEDOR".`)) {
            return;
        }

        setLoading(true);
        const res = await deleteSupplier(supplierId);
        if (res.error) {
            alert(res.error);
            setLoading(false);
        } else {
            router.push('/proveedores');
        }
    };

    return (
        <button
            onClick={handleDelete}
            disabled={loading}
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171',
                opacity: loading ? 0.5 : 1
            }}
        >
            <Trash2 className="h-4 w-4" />
            {loading ? 'Eliminando...' : 'Eliminar'}
        </button>
    );
}
