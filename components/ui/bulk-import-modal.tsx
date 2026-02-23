'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

export interface ImportFieldMapping {
    dbField: string;
    label: string;
    required: boolean;
    validator?: (value: any) => boolean;
}

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityType: 'customers' | 'mother_accounts';
    fieldMappings: ImportFieldMapping[];
    onImport: (data: any[], options: { updateDuplicates: boolean }) => Promise<{ success: number; duplicates: number; errors: string[] }>;
}

type Step = 'upload' | 'mapping' | 'validation';

export function BulkImportModal({ isOpen, onClose, entityType, fieldMappings, onImport }: BulkImportModalProps) {
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [rawData, setRawData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [updateDuplicates, setUpdateDuplicates] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: number; duplicates: number; errors: string[] } | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const entityLabels = {
        customers: 'Clientes',
        mother_accounts: 'Cuentas Madre'
    };

    const resetState = () => {
        setStep('upload');
        setFile(null);
        setRawData([]);
        setHeaders([]);
        setColumnMapping({});
        setDuplicates([]);
        setUpdateDuplicates(false);
        setResult(null);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const parseFile = async (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length > 0) {
                    const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
                    const rows = jsonData.slice(1).filter((row: any) => row.some((cell: any) => cell !== null && cell !== undefined && cell !== ''));

                    setHeaders(headers);
                    setRawData(rows.map((row: any) => {
                        const obj: Record<string, any> = {};
                        headers.forEach((h, i) => {
                            obj[h] = row[i];
                        });
                        return obj;
                    }));

                    // Auto-map columns with similar names
                    const autoMapping: Record<string, string> = {};
                    fieldMappings.forEach(field => {
                        const match = headers.find(h =>
                            h.toLowerCase().includes(field.dbField.toLowerCase()) ||
                            h.toLowerCase().includes(field.label.toLowerCase()) ||
                            field.label.toLowerCase().includes(h.toLowerCase())
                        );
                        if (match) {
                            autoMapping[field.dbField] = match;
                        }
                    });
                    setColumnMapping(autoMapping);
                    setStep('mapping');
                }
            } catch (error) {
                console.error('Error parsing file:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                setFile(file);
                parseFile(file);
            }
        }
    }, [fieldMappings]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFile(file);
            parseFile(file);
        }
    };

    const getMappedData = () => {
        return rawData.map(row => {
            const mappedRow: Record<string, any> = {};
            fieldMappings.forEach(field => {
                const sourceColumn = columnMapping[field.dbField];
                if (sourceColumn) {
                    mappedRow[field.dbField] = row[sourceColumn];
                }
            });
            return mappedRow;
        });
    };

    const validateAndProceed = async () => {
        setLoading(true);
        try {
            // Simular detección de duplicados (en producción esto consultaría la BD)
            const mappedData = getMappedData();
            // Por ahora, pasar a importación
            setDuplicates([]);
            setStep('validation');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        setLoading(true);
        try {
            const mappedData = getMappedData();
            const result = await onImport(mappedData, { updateDuplicates });
            setResult(result);
        } catch (error: any) {
            setResult({
                success: 0,
                duplicates: 0,
                errors: [error.message || 'Error desconocido']
            });
        } finally {
            setLoading(false);
        }
    };

    const requiredFieldsMapped = fieldMappings
        .filter(f => f.required)
        .every(f => columnMapping[f.dbField]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto rounded-lg border border-border bg-card p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">
                            Importar {entityLabels[entityType]}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {step === 'upload' && 'Sube un archivo CSV o Excel'}
                            {step === 'mapping' && 'Mapea las columnas de tu archivo'}
                            {step === 'validation' && 'Revisa y confirma la importación'}
                        </p>
                    </div>
                    <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-2 mb-6">
                    {(['upload', 'mapping', 'validation'] as Step[]).map((s, i) => (
                        <div key={s} className="flex items-center">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step === s
                                    ? 'bg-[#86EFAC] text-black'
                                    : i < ['upload', 'mapping', 'validation'].indexOf(step)
                                        ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                        : 'bg-muted text-muted-foreground'
                                }`}>
                                {i + 1}
                            </div>
                            {i < 2 && (
                                <div className={`h-0.5 w-12 mx-2 ${i < ['upload', 'mapping', 'validation'].indexOf(step)
                                        ? 'bg-[#86EFAC]'
                                        : 'bg-muted'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step 1: Upload */}
                {step === 'upload' && (
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive
                                ? 'border-[#86EFAC] bg-[#86EFAC]/10'
                                : 'border-border hover:border-muted-foreground'
                            }`}
                    >
                        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-lg font-medium text-foreground mb-2">
                            Arrastra tu archivo aquí
                        </p>
                        <p className="text-sm text-muted-foreground mb-4">
                            o haz clic para seleccionar
                        </p>
                        <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileInput}
                            className="hidden"
                            id="file-upload"
                        />
                        <label htmlFor="file-upload">
                            <Button variant="outline" asChild>
                                <span>
                                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                                    Seleccionar archivo
                                </span>
                            </Button>
                        </label>
                        <p className="text-xs text-muted-foreground mt-4">
                            Formatos soportados: .csv, .xlsx, .xls
                        </p>
                    </div>
                )}

                {/* Step 2: Mapping */}
                {step === 'mapping' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileSpreadsheet className="h-4 w-4" />
                            <span>{file?.name}</span>
                            <span className="text-foreground font-medium">
                                ({rawData.length} filas)
                            </span>
                        </div>

                        <div className="border border-border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-foreground">
                                            Campo de BD
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-foreground">
                                            Columna del archivo
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-foreground">
                                            Vista previa
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fieldMappings.map(field => (
                                        <tr key={field.dbField} className="border-t border-border">
                                            <td className="px-4 py-3">
                                                <span className="text-foreground">{field.label}</span>
                                                {field.required && (
                                                    <span className="text-red-500 ml-1">*</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={columnMapping[field.dbField] || ''}
                                                    onChange={(e) => setColumnMapping({
                                                        ...columnMapping,
                                                        [field.dbField]: e.target.value
                                                    })}
                                                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-foreground"
                                                >
                                                    <option value="">-- Sin mapear --</option>
                                                    {headers.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {columnMapping[field.dbField] && rawData[0]
                                                    ? String(rawData[0][columnMapping[field.dbField]] || '-')
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!requiredFieldsMapped && (
                            <div className="flex items-center gap-2 text-yellow-500 text-sm">
                                <AlertCircle className="h-4 w-4" />
                                Mapea todos los campos requeridos (*) para continuar
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Validation */}
                {step === 'validation' && !result && (
                    <div className="space-y-4">
                        <div className="bg-muted rounded-lg p-4">
                            <h3 className="font-medium text-foreground mb-2">Resumen de importación</h3>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• <span className="text-foreground font-medium">{rawData.length}</span> registros a importar</li>
                                <li>• <span className="text-foreground font-medium">{duplicates.length}</span> posibles duplicados detectados</li>
                            </ul>
                        </div>

                        {duplicates.length > 0 && (
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={updateDuplicates}
                                        onChange={(e) => setUpdateDuplicates(e.target.checked)}
                                        className="rounded"
                                    />
                                    <span className="text-foreground">
                                        Actualizar registros existentes (duplicados)
                                    </span>
                                </label>
                            </div>
                        )}

                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                                <div className="text-sm">
                                    <p className="text-yellow-500 font-medium">Confirmar importación</p>
                                    <p className="text-muted-foreground">
                                        Esta acción agregará {rawData.length} registros a la base de datos.
                                        Esta acción no se puede deshacer.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className="space-y-4">
                        <div className={`rounded-lg p-6 text-center ${result.errors.length === 0 ? 'bg-[#86EFAC]/20' : 'bg-red-500/10'
                            }`}>
                            {result.errors.length === 0 ? (
                                <>
                                    <Check className="h-12 w-12 mx-auto mb-3 text-[#86EFAC]" />
                                    <h3 className="text-lg font-medium text-foreground mb-2">
                                        ¡Importación exitosa!
                                    </h3>
                                    <p className="text-muted-foreground">
                                        Se importaron <span className="text-[#86EFAC] font-medium">{result.success}</span> registros correctamente.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-500" />
                                    <h3 className="text-lg font-medium text-foreground mb-2">
                                        Importación con errores
                                    </h3>
                                    <p className="text-muted-foreground mb-4">
                                        Se importaron {result.success} de {rawData.length} registros.
                                    </p>
                                    <div className="text-left bg-red-500/10 rounded p-3 text-sm text-red-400">
                                        {result.errors.slice(0, 5).map((err, i) => (
                                            <p key={i}>• {err}</p>
                                        ))}
                                        {result.errors.length > 5 && (
                                            <p>... y {result.errors.length - 5} errores más</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                    <div>
                        {step !== 'upload' && !result && (
                            <Button
                                variant="ghost"
                                onClick={() => setStep(step === 'validation' ? 'mapping' : 'upload')}
                                disabled={loading}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Atrás
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose}>
                            {result ? 'Cerrar' : 'Cancelar'}
                        </Button>
                        {step === 'mapping' && (
                            <Button
                                onClick={validateAndProceed}
                                disabled={!requiredFieldsMapped || loading}
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <ArrowRight className="h-4 w-4 mr-2" />
                                )}
                                Siguiente
                            </Button>
                        )}
                        {step === 'validation' && !result && (
                            <Button
                                onClick={handleImport}
                                disabled={loading}
                                className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4 mr-2" />
                                )}
                                Confirmar Importación
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
