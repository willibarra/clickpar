'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
    requestId: string;
    resellerId: string;
}

export function StockRequestActions({ requestId, resellerId }: Props) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
    const [adminNotes, setAdminNotes] = useState('');
    const [showNotes, setShowNotes] = useState(false);

    const take = async (action: 'approved' | 'rejected') => {
        setStatus('loading');
        await fetch('/api/reseller/stock-request-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, status: action, admin_notes: adminNotes }),
        });
        setStatus('done');
        setTimeout(() => window.location.reload(), 800);
    };

    if (status === 'done') return <span className="text-xs text-green-400">✓ Procesado</span>;

    return (
        <div className="shrink-0 space-y-2">
            {showNotes && (
                <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={2}
                    placeholder="Nota para el revendedor (opcional)..."
                    className="w-48 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-500 resize-none focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
            )}
            <div className="flex gap-2">
                <button
                    onClick={() => setShowNotes(v => !v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                    style={{ color: '#8b8ba7' }}
                >
                    {showNotes ? 'Ocultar nota' : 'Añadir nota'}
                </button>
                <button
                    onClick={() => take('approved')}
                    disabled={status === 'loading'}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'rgba(134,239,172,0.2)', border: '1px solid rgba(134,239,172,0.4)', color: '#86efac' }}
                >
                    <Check className="h-3 w-3" /> Aprobar
                </button>
                <button
                    onClick={() => take('rejected')}
                    disabled={status === 'loading'}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171' }}
                >
                    <X className="h-3 w-3" /> Rechazar
                </button>
            </div>
        </div>
    );
}
