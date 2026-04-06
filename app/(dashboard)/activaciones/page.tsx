'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Copy, CopyCheck } from 'lucide-react';
import { toast } from 'sonner';

interface PendingActivation {
    id: string;
    sale_id: string;
    customer_id: string;
    platform: string;
    activation_type: string;
    email: string;
    password?: string;
    status: string;
    created_at: string;
    customers: {
        full_name: string;
        phone: string;
    };
}

export default function ActivacionesPage() {
    const [activations, setActivations] = useState<PendingActivation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const [copiedContent, setCopiedContent] = useState<string | null>(null);

    const fetchActivations = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/activaciones');
            const data = await res.json();
            if (data.success) {
                setActivations(data.pending);
            } else {
                setError(data.error || 'Error al obtener activaciones');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivations();
    }, []);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedContent(text);
        toast.success('Copiado al portapapeles');
        setTimeout(() => setCopiedContent(null), 2000);
    };

    const handleActivate = async (id: string, sale_id: string) => {
        setProcessing(id);
        try {
            const res = await fetch('/api/admin/activaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activation_id: id, sale_id }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('¡Activación completada!');
                fetchActivations();
            } else {
                toast.error(data.error || 'Error al completar activación');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setProcessing(null);
        }
    };

    if (loading && activations.length === 0) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
                <button onClick={fetchActivations} className="text-sm underline hover:text-foreground">Reintentar</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Activaciones Pendientes</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Solicitudes de cuentas Familiares o Bajo Demanda asíncronas
                    </p>
                </div>
            </div>

            {activations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-card py-16 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                    <p className="font-medium text-foreground">Todo al día</p>
                    <p className="text-sm text-muted-foreground">No hay activaciones pendientes.</p>
                </div>
            ) : (
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Cliente</th>
                                    <th className="px-4 py-3">Solicitud</th>
                                    <th className="px-4 py-3">Credenciales</th>
                                    <th className="px-4 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activations.map((a) => (
                                    <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                                            {new Date(a.created_at).toLocaleDateString()} {new Date(a.created_at).toLocaleTimeString().slice(0, 5)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-foreground">{a.customers?.full_name}</p>
                                            <a href={`https://wa.me/${a.customers?.phone?.replace('+', '')}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                                                {a.customers?.phone}
                                            </a>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center rounded bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-100">
                                                {a.platform}
                                            </span>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {a.activation_type === 'own_email' ? 'Usar su correo' : 'Generado (Nuevo)'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            <div className="flex items-center gap-2 group">
                                                <span className="truncate max-w-[150px]" title={a.email}>{a.email}</span>
                                                <button onClick={() => handleCopy(a.email)} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {copiedContent === a.email ? <CopyCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                </button>
                                            </div>
                                            {a.password && (
                                                <div className="flex items-center gap-2 group mt-1">
                                                    <span className="text-muted-foreground">Pwd: </span>
                                                    <span className="truncate max-w-[150px]">{a.password}</span>
                                                    <button onClick={() => handleCopy(a.password!)} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {copiedContent === a.password ? <CopyCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleActivate(a.id, a.sale_id)}
                                                disabled={processing === a.id}
                                                className="inline-flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                                            >
                                                {processing === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                                Activar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
