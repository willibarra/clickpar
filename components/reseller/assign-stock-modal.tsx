'use client';

import { useState } from 'react';
import { Package, X, Check } from 'lucide-react';

interface SlotOption {
    id: string;
    slot_identifier: string;
    mother_accounts: { platform: string } | null;
}

interface Props {
    resellerId: string;
    availableSlots: SlotOption[];
}

function groupByPlatform(slots: SlotOption[]) {
    const map = new Map<string, SlotOption[]>();
    slots.forEach(s => {
        const platform = (s.mother_accounts as any)?.platform || 'Desconocido';
        if (!map.has(platform)) map.set(platform, []);
        map.get(platform)!.push(s);
    });
    return map;
}

export function AssignStockModal({ resellerId, availableSlots }: Props) {
    const [open, setOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [salePrice, setSalePrice] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const platformGroups = groupByPlatform(availableSlots);

    const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleAssign = async () => {
        if (selectedIds.size === 0) return;
        setStatus('loading');
        try {
            const res = await fetch('/api/reseller/assign-stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reseller_id: resellerId,
                    slot_ids: Array.from(selectedIds),
                    sale_price_gs: salePrice ? parseFloat(salePrice) : null,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al asignar stock');
            }
            setStatus('success');
            setTimeout(() => { setOpen(false); window.location.reload(); }, 1200);
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <>
            <button
                onClick={() => { setOpen(true); setStatus('idle'); setSelectedIds(new Set()); setSalePrice(''); }}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
                <Package className="h-4 w-4" />
                Asignar Stock
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-lg rounded-2xl p-6 z-10 max-h-[80vh] flex flex-col" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center justify-between mb-5 shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-white">Asignar Stock</h2>
                                <p className="text-xs mt-0.5" style={{ color: '#8b8ba7' }}>Seleccioná los perfiles a asignar</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                                <X className="h-4 w-4 text-white" />
                            </button>
                        </div>

                        {status === 'success' ? (
                            <div className="py-8 text-center">
                                <Check className="h-12 w-12 mx-auto mb-3 text-green-400" />
                                <p className="text-white font-semibold">¡Stock asignado!</p>
                            </div>
                        ) : availableSlots.length === 0 ? (
                            <div className="py-8 text-center">
                                <Package className="h-10 w-10 mx-auto mb-3" style={{ color: '#8b8ba7' }} />
                                <p className="text-white">Sin slots disponibles para asignar</p>
                            </div>
                        ) : (
                            <>
                                {/* Price input */}
                                <div className="mb-4 shrink-0">
                                    <label className="block text-xs font-medium text-white mb-1.5">Precio de venta sugerido (Gs.)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={salePrice}
                                        onChange={(e) => setSalePrice(e.target.value)}
                                        placeholder="Ej: 45000"
                                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                {/* Slot list grouped by platform */}
                                <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                                    {Array.from(platformGroups.entries()).map(([platform, slots]) => (
                                        <div key={platform}>
                                            <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-2">{platform}</p>
                                            <div className="space-y-1">
                                                {slots.map(slot => (
                                                    <button
                                                        key={slot.id}
                                                        type="button"
                                                        onClick={() => toggle(slot.id)}
                                                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                                                        style={{
                                                            background: selectedIds.has(slot.id) ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                                            border: `1px solid ${selectedIds.has(slot.id) ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
                                                        }}
                                                    >
                                                        <div className={`h-4 w-4 rounded flex items-center justify-center shrink-0 transition-colors`} style={{ background: selectedIds.has(slot.id) ? '#6366f1' : 'rgba(255,255,255,0.1)' }}>
                                                            {selectedIds.has(slot.id) && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                        <span className="text-sm text-white">{slot.slot_identifier}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {status === 'error' && (
                                    <div className="mt-3 rounded-xl px-3 py-2 text-sm text-red-300 shrink-0" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                                        {errorMsg}
                                    </div>
                                )}

                                <button
                                    onClick={handleAssign}
                                    disabled={selectedIds.size === 0 || status === 'loading'}
                                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shrink-0 transition-all hover:opacity-90 disabled:opacity-40"
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                >
                                    {status === 'loading' ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : `Asignar ${selectedIds.size} perfil${selectedIds.size !== 1 ? 'es' : ''}`}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
