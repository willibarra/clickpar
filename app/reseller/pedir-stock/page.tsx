'use client';

import { useState } from 'react';
import { PackagePlus, Send, CheckCircle } from 'lucide-react';

const PLATFORMS = ['Netflix', 'Disney+', 'HBO Max', 'Amazon Prime', 'Spotify', 'YouTube Premium', 'Crunchyroll', 'Apple TV+', 'Paramount+', 'Star+'];

export default function PedirStockPage() {
    const [platform, setPlatform] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!platform || !quantity) return;

        setStatus('loading');
        setErrorMsg('');

        try {
            const res = await fetch('/api/reseller/stock-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, quantity_requested: parseInt(quantity), notes }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al enviar la solicitud');
            }

            setStatus('success');
            setPlatform('');
            setQuantity('');
            setNotes('');
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold text-white">Pedir Stock</h1>
                <p className="text-sm mt-0.5" style={{ color: '#8b8ba7' }}>
                    Solicitá más perfiles a ClickPar. Te avisarán cuando esté disponible.
                </p>
            </div>

            {status === 'success' ? (
                <div className="glass-card rounded-2xl p-10 text-center">
                    <CheckCircle className="h-14 w-14 mx-auto mb-4 text-green-400" />
                    <h2 className="text-lg font-bold text-white mb-2">¡Solicitud enviada!</h2>
                    <p className="text-sm mb-6" style={{ color: '#8b8ba7' }}>
                        ClickPar recibirá una notificación y se pondrá en contacto con vos.
                    </p>
                    <button
                        onClick={() => setStatus('idle')}
                        className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-80"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                        Hacer otra solicitud
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-5">
                    {/* Platform */}
                    <div>
                        <label className="block text-sm font-medium text-white mb-2">
                            Plataforma <span className="text-red-400">*</span>
                        </label>
                        <select
                            value={platform}
                            onChange={(e) => setPlatform(e.target.value)}
                            required
                            className="w-full rounded-xl px-4 py-3 text-sm text-white bg-transparent border transition-colors focus:outline-none"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <option value="" disabled style={{ background: '#1a1a2e' }}>Seleccioná una plataforma...</option>
                            {PLATFORMS.map(p => (
                                <option key={p} value={p} style={{ background: '#1a1a2e' }}>{p}</option>
                            ))}
                            <option value="otro" style={{ background: '#1a1a2e' }}>Otro</option>
                        </select>
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="block text-sm font-medium text-white mb-2">
                            Cantidad de perfiles <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            required
                            placeholder="Ej: 5"
                            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none transition-colors"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-white mb-2">
                            Notas adicionales <span style={{ color: '#8b8ba7' }} className="font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Ej: Necesito los perfiles antes del viernes, tengo 3 clientes esperando..."
                            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none resize-none transition-colors"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                    </div>

                    {status === 'error' && (
                        <div className="rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                            {errorMsg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={status === 'loading' || !platform || !quantity}
                        className="w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                        {status === 'loading' ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                Enviar Solicitud
                            </>
                        )}
                    </button>

                    <p className="text-xs text-center" style={{ color: '#8b8ba7' }}>
                        <PackagePlus className="inline h-3 w-3 mr-1" />
                        ClickPar recibirá la solicitud y te asignará el stock disponible.
                    </p>
                </form>
            )}
        </div>
    );
}
