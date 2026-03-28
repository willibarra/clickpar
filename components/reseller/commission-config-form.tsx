'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

interface Props {
    resellerId: string;
    currentPercent: number;
}

export function CommissionConfigForm({ resellerId, currentPercent }: Props) {
    const [percent, setPercent] = useState(String(currentPercent));
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const handleSave = async () => {
        setStatus('loading');
        try {
            const res = await fetch('/api/reseller/commission-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reseller_id: resellerId, commission_percent: parseFloat(percent) }),
            });
            if (!res.ok) throw new Error('Error al guardar');
            setStatus('success');
            setTimeout(() => setStatus('idle'), 2000);
        } catch {
            setStatus('error');
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <label className="block text-xs font-medium text-white mb-1.5">Porcentaje de comisión (%)</label>
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={percent}
                        onChange={(e) => setPercent(e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                </div>
                <button
                    onClick={handleSave}
                    disabled={status === 'loading'}
                    className="mt-5 flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                    {status === 'loading' ? (
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : status === 'success' ? (
                        <><Check className="h-4 w-4" /> Guardado</>
                    ) : 'Guardar'}
                </button>
            </div>
            {status === 'error' && (
                <p className="text-xs text-red-400">Error al guardar. Intentá de nuevo.</p>
            )}
            <p className="text-xs" style={{ color: '#8b8ba7' }}>
                El cambio aplica a las próximas ventas. Las comisiones ya calculadas no cambian.
            </p>
        </div>
    );
}
