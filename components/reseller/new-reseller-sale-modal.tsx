'use client';

import { useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';

interface StockItem {
    id: string;
    platform: string;
    slot_identifier: string;
    sale_price_gs: number | null;
}

interface Props {
    availableStock: StockItem[];
    resellerId: string;
}

function formatGs(amount: number): string {
    if (amount >= 1000000) return `Gs. ${(amount / 1_000_000).toFixed(1)}M`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export function NewResellerSaleModal({ availableStock, resellerId }: Props) {
    const [open, setOpen] = useState(false);
    const [selectedStockId, setSelectedStockId] = useState('');
    const [clienteName, setClienteName] = useState('');
    const [clienteTel, setClienteTel] = useState('');
    const [precio, setPrecio] = useState('');
    const [endDate, setEndDate] = useState('');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const selectedItem = availableStock.find(s => s.id === selectedStockId);

    const handleOpen = () => {
        setOpen(true);
        setStatus('idle');
        setSelectedStockId('');
        setClienteName('');
        setClienteTel('');
        setPrecio('');
        setEndDate('');
        setNotes('');
        setErrorMsg('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStockId || !clienteName || !precio) return;

        setStatus('loading');
        try {
            const res = await fetch('/api/reseller/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reseller_stock_id: selectedStockId,
                    cliente_nombre: clienteName,
                    cliente_telefono: clienteTel || null,
                    precio_venta_gs: parseFloat(precio),
                    end_date: endDate || null,
                    notes: notes || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al registrar la venta');
            }
            setStatus('success');
            setTimeout(() => {
                setOpen(false);
                window.location.reload();
            }, 1200);
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
                <ShoppingCart className="h-4 w-4" />
                Nueva Venta
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl z-10" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-white">Registrar Venta</h2>
                                <p className="text-xs mt-0.5" style={{ color: '#8b8ba7' }}>Seleccioná un perfil disponible</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                                <X className="h-4 w-4 text-white" />
                            </button>
                        </div>

                        {availableStock.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-white font-medium">Sin stock disponible</p>
                                <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>
                                    Solicitá más perfiles desde{' '}
                                    <a href="/reseller/pedir-stock" className="underline" style={{ color: '#6366f1' }}>Pedir Stock</a>.
                                </p>
                            </div>
                        ) : status === 'success' ? (
                            <div className="py-8 text-center">
                                <div className="h-12 w-12 mx-auto mb-3 flex items-center justify-center rounded-full" style={{ background: 'rgba(134,239,172,0.2)' }}>
                                    <ShoppingCart className="h-6 w-6 text-green-400" />
                                </div>
                                <p className="text-white font-semibold">¡Venta registrada!</p>
                                <p className="text-sm mt-1" style={{ color: '#8b8ba7' }}>La comisión se calculó automáticamente.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Slot selector */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Perfil a vender <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        value={selectedStockId}
                                        onChange={(e) => {
                                            setSelectedStockId(e.target.value);
                                            const item = availableStock.find(s => s.id === e.target.value);
                                            if (item?.sale_price_gs) setPrecio(String(item.sale_price_gs));
                                        }}
                                        required
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value="" disabled style={{ background: '#13131a' }}>Seleccioná un perfil...</option>
                                        {availableStock.map(s => (
                                            <option key={s.id} value={s.id} style={{ background: '#13131a' }}>
                                                {s.platform} · {s.slot_identifier}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedItem && (
                                        <p className="text-xs mt-1" style={{ color: '#8b8ba7' }}>
                                            Plataforma: <strong className="text-white">{selectedItem.platform}</strong> · Perfil: <strong className="text-white">{selectedItem.slot_identifier}</strong>
                                        </p>
                                    )}
                                </div>

                                {/* Cliente */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Nombre del cliente <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={clienteName}
                                        onChange={(e) => setClienteName(e.target.value)}
                                        required
                                        placeholder="Ej: Juan Pérez"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Teléfono */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">Teléfono del cliente</label>
                                    <input
                                        type="tel"
                                        value={clienteTel}
                                        onChange={(e) => setClienteTel(e.target.value)}
                                        placeholder="Ej: 0981123456"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Precio */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">
                                        Precio de venta (Gs.) <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={precio}
                                        onChange={(e) => setPrecio(e.target.value)}
                                        required
                                        placeholder="Ej: 45000"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                    {precio && (
                                        <p className="text-xs mt-1" style={{ color: '#8b8ba7' }}>
                                            = {formatGs(Number(precio))}
                                        </p>
                                    )}
                                </div>

                                {/* Fecha de vencimiento */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">Fecha de vencimiento del cliente</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                                    />
                                </div>

                                {/* Notas */}
                                <div>
                                    <label className="block text-xs font-medium text-white mb-1.5">Notas</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Observaciones opcionales..."
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none resize-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {status === 'error' && (
                                    <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                                        {errorMsg}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                >
                                    {status === 'loading' ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <ShoppingCart className="h-4 w-4" />
                                            Registrar Venta
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
