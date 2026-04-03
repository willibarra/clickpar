'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Edit3, Trash2, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { deleteSupplier } from '@/lib/actions/suppliers';

function formatGs(amount: number): string {
    if (amount >= 1_000_000_000) return `Gs. ${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${Math.round(amount).toLocaleString('es-PY')}`;
}

interface SupplierProps {
    supplier: {
        id: string;
        name: string;
        contact_info: string | null;
        total_accounts?: number;
        total_cost_gs?: number;
        platforms?: string[];
    };
    platformBadges: React.ReactNode[];
}

export function SupplierCard({ supplier, platformBadges }: SupplierProps) {
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const isSinProveedor = supplier.id === '00000000-0000-0000-0000-000000000001';

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`¿Estás seguro de eliminar a ${supplier.name}? Todas sus cuentas pasarán a "SIN PROVEEDOR".`)) return;
        
        setDeleting(true);
        const res = await deleteSupplier(supplier.id);
        setDeleting(false);
        if (res.error) {
            alert(res.error);
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        router.push(`/proveedores/${supplier.id}/editar`);
    };

    const handleClick = () => {
        router.push(`/proveedores/${supplier.id}`);
    };

    return (
        <div
            onClick={handleClick}
            className={`flex items-center gap-5 rounded-2xl p-5 transition-all cursor-pointer group block hover:border-white/15 ${deleting ? 'opacity-50 pointer-events-none' : ''}`}
            style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${isSinProveedor ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.08)'}`,
            }}
        >
            {/* Avatar */}
            <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{
                    background: isSinProveedor
                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                        : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                }}
            >
                {supplier.name.charAt(0)}
            </div>

            {/* Name & platforms */}
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate px-1">{supplier.name}</p>
                {supplier.contact_info && (
                    <p className="text-xs truncate px-1 mt-0.5" style={{ color: '#8b8ba7' }}>
                        {supplier.contact_info}
                    </p>
                )}
                {(supplier.platforms?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 px-1">
                        {platformBadges}
                        {(supplier.platforms?.length ?? 0) > 6 && (
                            <span className="text-[11px] self-center ml-1" style={{ color: '#8b8ba7' }}>
                                +{(supplier.platforms?.length ?? 0) - 6} más
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-8 shrink-0">
                <div className="text-right">
                    <p className="text-lg font-bold text-white">{supplier.total_accounts}</p>
                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Cuentas</p>
                </div>
                <div className="text-right">
                    <p className="text-base font-bold" style={{ color: '#86efac' }}>
                        {formatGs(supplier.total_cost_gs || 0)}
                    </p>
                    <p className="text-xs" style={{ color: '#8b8ba7' }}>Inversión</p>
                </div>
            </div>

            <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ml-2" style={{ color: '#8b8ba7' }} />
            
            {/* Context Menu for Actions */}
            {!isSinProveedor && (
                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white">
                                <MoreVertical className="h-5 w-5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleEdit} className="cursor-pointer gap-2">
                                <Edit3 className="h-4 w-4" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-red-400 gap-2 focus:text-red-400">
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </div>
    );
}
