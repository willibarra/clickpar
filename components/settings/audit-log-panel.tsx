'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CardContent } from '@/components/ui/card';
import { Loader2, User, RefreshCw, Box, ShoppingCart, Users, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuditLog {
    id: string;
    action: string;
    resource_type: string;
    details: any;
    created_at: string;
    user_id: string;
    profiles: {
        full_name: string;
    } | null;
}

export function AuditLogPanel() {
    const supabase = createClient();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []);

    async function fetchLogs() {
        setLoading(true);
        const { data, error } = await supabase
            .from('audit_log')
            .select(`
                *,
                profiles:user_id(full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(50); // Últimos 50 movimientos

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    }

    function getActionIcon(type: string) {
        switch (type) {
            case 'user': return <User className="h-4 w-4 text-blue-400" />;
            case 'mother_account': return <Box className="h-4 w-4 text-purple-400" />;
            case 'slot': return <Box className="h-4 w-4 text-purple-400" />;
            case 'sale': return <ShoppingCart className="h-4 w-4 text-green-400" />;
            case 'bundle': return <ShoppingCart className="h-4 w-4 text-green-400" />;
            case 'combo': return <ShoppingCart className="h-4 w-4 text-green-400" />;
            case 'customer': return <Users className="h-4 w-4 text-indigo-400" />;
            default: return <Activity className="h-4 w-4 text-gray-400" />;
        }
    }

    function formatTime(dateStr: string) {
        return new Date(dateStr).toLocaleString('es-PY', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    }

    const filteredLogs = logs.filter(log => {
        if (!search) return true;
        const msg = (log.details?.message || '').toLowerCase();
        const user = (log.profiles?.full_name || '').toLowerCase();
        const s = search.toLowerCase();
        return msg.includes(s) || user.includes(s);
    });

    return (
        <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
                <div className="relative w-full sm:w-72">
                    <Input
                        placeholder="Buscar movimiento..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-background"
                    />
                </div>
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-secondary/20">
                    No hay registros de auditoría aún.
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredLogs.map(log => (
                        <div key={log.id} className="flex gap-4 items-start p-3 rounded-lg hover:bg-secondary/30 transition-colors border border-transparent hover:border-border">
                            <div className="mt-1 flex items-center justify-center h-8 w-8 rounded-full bg-secondary text-muted-foreground border border-border shrink-0">
                                {getActionIcon(log.resource_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                    <span className="font-semibold text-primary">{log.profiles?.full_name || 'Sistema'}</span>{' '}
                                    <span className="text-muted-foreground font-normal">{log.details?.message || `Realizó ${log.action}`}</span>
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    {formatTime(log.created_at)}
                                    <span className="opacity-50 mx-1">•</span>
                                    <span className="opacity-50 font-mono">ID: {log.id.slice(0, 8)}</span>
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
    );
}
