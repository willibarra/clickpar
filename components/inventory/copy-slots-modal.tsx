'use client';

import { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Slot {
    id: string;
    status: string;
    slot_identifier: string;
    pin_code: string | null;
    sales?: Array<{
        id: string;
        end_date: string | null;
        is_active: boolean;
        customers: { id: string; full_name: string | null; phone: string | null } | null;
    }>;
}

interface Account {
    id: string;
    platform: string;
    email: string;
    password: string;
    max_slots: number;
    renewal_date: string;
    created_at: string;
    sale_slots: Slot[];
}

interface CopySlotsModalProps {
    open: boolean;
    onClose: () => void;
    accounts: Account[];
    selectedIds: string[];
}

type Column = {
    id: string;
    label: string;
    valueGetter: (account: Account, slot: Slot, activeSale: any) => string;
};

const COLUMNS: Column[] = [
    {
        id: 'customer_name',
        label: 'Nombre del Cliente',
        valueGetter: (a, s, sale) => sale?.customers?.full_name || '',
    },
    {
        id: 'customer_phone',
        label: 'Teléfono',
        valueGetter: (a, s, sale) => sale?.customers?.phone || '',
    },
    {
        id: 'slot_pin',
        label: 'Contraseña (PIN)',
        valueGetter: (a, s, sale) => s.pin_code || '',
    },
    {
        id: 'account_email',
        label: 'Email Cuenta Madre',
        valueGetter: (a, s, sale) => a.email || '',
    },
    {
        id: 'account_password',
        label: 'Contraseña Cuenta',
        valueGetter: (a, s, sale) => a.password || '',
    },
    {
        id: 'platform',
        label: 'Plataforma',
        valueGetter: (a, s, sale) => a.platform || '',
    },
    {
        id: 'renewal_date',
        label: 'Fecha Vencimiento',
        valueGetter: (a, s, sale) => sale?.end_date || a.renewal_date || '',
    },
];

export function CopySlotsModal({ open, onClose, accounts, selectedIds }: CopySlotsModalProps) {
    const [selectedColumns, setSelectedColumns] = useState<string[]>([
        'customer_name', 'customer_phone', 'slot_pin'
    ]);
    const [copied, setCopied] = useState(false);
    const [exportMode, setExportMode] = useState<'slots' | 'mothers'>('slots');

    // Get all slots from selected accounts
    const allSlots = useMemo(() => {
        const selected = accounts.filter(a => selectedIds.includes(a.id));
        const list: { account: Account; slot: Slot; activeSale: any }[] = [];

        selected.forEach(account => {
            if (account.sale_slots) {
                // sort slots numerically by identifier (e.g., Perfil 1, Perfil 2)
                const sortedSlots = [...account.sale_slots].sort((a, b) => {
                    const numA = parseInt(a.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                    const numB = parseInt(b.slot_identifier?.match(/\d+/)?.[0] ?? '0');
                    return numA - numB;
                });

                sortedSlots.forEach(slot => {
                    // Try to find an active sale for this slot
                    const activeSale = slot.sales?.find(s => s.is_active);
                    list.push({ account, slot, activeSale });
                });
            }
        });

        return list;
    }, [accounts, selectedIds]);

    const selectedMotherAccounts = useMemo(() => {
        return accounts.filter(a => selectedIds.includes(a.id));
    }, [accounts, selectedIds]);

    const toggleColumn = (colId: string) => {
        setSelectedColumns(prev => {
            if (prev.includes(colId)) {
                return prev.filter(id => id !== colId);
            }
            return [...prev, colId];
        });
    };

    const handleCopy = async () => {
        if (selectedColumns.length === 0) return;
        if (exportMode === 'slots' && allSlots.length === 0) return;
        if (exportMode === 'mothers' && selectedMotherAccounts.length === 0) return;

        // Ensure columns are in the original requested order (as defined in COLUMNS)
        const orderedSelectedColumns = COLUMNS.filter(c => selectedColumns.includes(c.id));

        let rows: string[] = [];

        if (exportMode === 'slots') {
            rows = allSlots.map((item, index) => {
                const rowData = orderedSelectedColumns.map(col => {
                    const val = col.valueGetter(item.account, item.slot, item.activeSale);
                    return val ? val.replace(/[\t\n\r]/g, ' ') : '';
                });
                return [`${index + 1}.`, ...rowData].join('\t');
            });
        } else {
            rows = selectedMotherAccounts.map((account, index) => {
                const rowData = orderedSelectedColumns.map(col => {
                    // Pass empty slot/sale data since we are at the account level
                    const val = col.valueGetter(account, {} as any, null);
                    return val ? val.replace(/[\t\n\r]/g, ' ') : '';
                });
                return [`${index + 1}.`, ...rowData].join('\t');
            });
        }

        // Join everything
        // const tsvText = [header, ...rows].join('\n');
        // Actually, let's omit headers to make pasting cleaner, as usually requested
        const tsvText = rows.join('\n');

        try {
            await navigator.clipboard.writeText(tsvText);
            setCopied(true);
            const count = exportMode === 'slots' ? allSlots.length : selectedMotherAccounts.length;
            toast.success('¡Copiado al portapapeles!', {
                description: `Se han copiado ${count} filas.`
            });
            setTimeout(() => {
                setCopied(false);
                onClose();
            }, 2000);
        } catch (err) {
            console.error('Error copying to clipboard', err);
            toast.error('Error al copiar');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <FileSpreadsheet className="h-5 w-5 text-[#86EFAC]" />
                        Copiar Slots (Formato Sheets)
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/40">
                        <div className="space-y-0.5">
                            <Label className="text-base font-medium">Extraer con Clientes (Slots)</Label>
                            <p className="text-xs text-muted-foreground cursor-pointer">
                                {exportMode === 'slots' 
                                  ? 'Copia 1 fila por cada perfil (ej. 100 filas)'
                                  : 'Copia solo la Cuenta Madre general (ej. 20 filas)'}
                            </p>
                        </div>
                        <Switch 
                            checked={exportMode === 'slots'} 
                            onCheckedChange={(c) => {
                                setExportMode(c ? 'slots' : 'mothers');
                                if (!c) {
                                    // if switching to mothers, disable client-specific columns
                                    setSelectedColumns(prev => prev.filter(cId => !['customer_name', 'customer_phone', 'slot_pin'].includes(cId)));
                                } else {
                                    // re-add basics
                                    setSelectedColumns(['customer_name', 'customer_phone', 'slot_pin']);
                                }
                            }}
                            className="data-[state=checked]:bg-[#86EFAC]"
                        />
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Se extraerán <strong>{exportMode === 'slots' ? allSlots.length : selectedMotherAccounts.length}</strong> {exportMode === 'slots' ? 'slots (perfiles)' : 'cuentas'} de las {selectedIds.length} cuentas seleccionadas. 
                        Seleccioná las columnas que querés incluir.
                    </p>

                    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                        {COLUMNS.map(col => {
                            const isClientCol = ['customer_name', 'customer_phone', 'slot_pin'].includes(col.id);
                            const disabled = exportMode === 'mothers' && isClientCol;

                            return (
                                <div key={col.id} className={`flex items-center space-x-2 ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                    <Checkbox
                                        id={col.id}
                                        checked={selectedColumns.includes(col.id)}
                                        onCheckedChange={() => toggleColumn(col.id)}
                                        className="data-[state=checked]:bg-[#86EFAC] data-[state=checked]:text-black"
                                        disabled={disabled}
                                    />
                                <label
                                    htmlFor={col.id}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    {col.label}
                                </label>
                            </div>
                            );
                        })}
                    </div>

                    <div className="p-3 bg-secondary/50 rounded text-xs text-muted-foreground">
                        💡 Tip: El formato copiado usa separadores de tabulación (TSV), por lo que al pegar en Google Sheets o Excel, cada dato ocupará una columna limpia.
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleCopy}
                            disabled={selectedColumns.length === 0 || copied}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 gap-2"
                        >
                            {copied ? (
                                <>
                                    <Check className="h-4 w-4" /> Copiado!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" /> Copiar {exportMode === 'slots' ? allSlots.length : selectedMotherAccounts.length} filas
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
