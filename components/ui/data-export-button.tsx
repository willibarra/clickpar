'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn {
    key: string;
    header: string;
    width?: number;
    format?: (value: any) => string;
}

interface DataExportButtonProps {
    data: any[];
    columns: ExportColumn[];
    filename: string;
    title: string;
    subtitle?: string;
}

export function DataExportButton({ data, columns, filename, title, subtitle }: DataExportButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const formatValue = (value: any, column: ExportColumn): string => {
        if (value === null || value === undefined) return '';
        if (column.format) return column.format(value);
        if (typeof value === 'number') return value.toLocaleString('es-PY');
        if (value instanceof Date) return value.toLocaleDateString('es-PY');
        return String(value);
    };

    const exportToExcel = async () => {
        setLoading(true);
        try {
            // Preparar datos para Excel
            const excelData = data.map(row => {
                const rowData: Record<string, any> = {};
                columns.forEach(col => {
                    rowData[col.header] = formatValue(row[col.key], col);
                });
                return rowData;
            });

            // Crear workbook
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, title);

            // Ajustar ancho de columnas
            const colWidths = columns.map(col => ({
                wch: col.width || Math.max(col.header.length, 15)
            }));
            worksheet['!cols'] = colWidths;

            // Generar archivo
            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `${filename}_${dateStr}.xlsx`);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
        } finally {
            setLoading(false);
            setIsOpen(false);
        }
    };

    const exportToPDF = async () => {
        setLoading(true);
        try {
            const doc = new jsPDF('landscape', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // Header con estilo ClickPar
            doc.setFillColor(134, 239, 172); // #86EFAC
            doc.rect(0, 0, pageWidth, 25, 'F');

            // Logo placeholder (rayo)
            doc.setFillColor(0, 0, 0);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text('⚡ ClickPar', 14, 16);

            // Título del reporte
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(title, pageWidth - 14, 12, { align: 'right' });

            // Fecha de generación
            doc.setFontSize(9);
            const dateStr = new Date().toLocaleDateString('es-PY', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            doc.text(`Generado: ${dateStr}`, pageWidth - 14, 18, { align: 'right' });

            // Subtítulo si existe
            if (subtitle) {
                doc.setTextColor(100, 100, 100);
                doc.setFontSize(10);
                doc.text(subtitle, 14, 35);
            }

            // Preparar datos para la tabla
            const tableHeaders = columns.map(col => col.header);
            const tableData = data.map(row =>
                columns.map(col => formatValue(row[col.key], col))
            );

            // Tabla con autoTable
            autoTable(doc, {
                head: [tableHeaders],
                body: tableData,
                startY: subtitle ? 40 : 32,
                styles: {
                    fontSize: 8,
                    cellPadding: 3,
                },
                headStyles: {
                    fillColor: [30, 30, 30],
                    textColor: [134, 239, 172],
                    fontStyle: 'bold',
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245],
                },
                margin: { left: 14, right: 14 },
            });

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Página ${i} de ${pageCount}`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                );
            }

            // Guardar
            const fileDateStr = new Date().toISOString().split('T')[0];
            doc.save(`${filename}_${fileDateStr}.pdf`);
        } catch (error) {
            console.error('Error exporting to PDF:', error);
        } finally {
            setLoading(false);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading || data.length === 0}
                className="gap-2"
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Download className="h-4 w-4" />
                )}
                Exportar
                <ChevronDown className="h-3 w-3" />
            </Button>

            {isOpen && !loading && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-card shadow-lg">
                        <button
                            onClick={exportToExcel}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                            <FileSpreadsheet className="h-4 w-4 text-green-500" />
                            Exportar Excel (.xlsx)
                        </button>
                        <button
                            onClick={exportToPDF}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                            <FileText className="h-4 w-4 text-red-500" />
                            Exportar PDF
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
