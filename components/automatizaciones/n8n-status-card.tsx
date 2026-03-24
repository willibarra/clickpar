'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, ShieldCheck, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface N8NStatusCardProps {
    n8nEnabled: boolean;
    whitelistEnabled: boolean;
    onRefresh: () => void;
}

export function N8NStatusCard({ n8nEnabled, whitelistEnabled, onRefresh }: N8NStatusCardProps) {
    const [togglingN8n, setTogglingN8n] = useState(false);
    const [togglingWl, setTogglingWl] = useState(false);
    const [localN8n, setLocalN8n] = useState(n8nEnabled);
    const [localWl, setLocalWl] = useState(whitelistEnabled);
    const [saved, setSaved] = useState<string | null>(null);

    async function toggle(key: string, current: boolean, setter: (v: boolean) => void, setLoading: (v: boolean) => void) {
        setLoading(true);
        try {
            const res = await fetch('/api/automatizaciones/queue-stats', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(!current) }),
            });
            if (res.ok) {
                setter(!current);
                setSaved(key);
                setTimeout(() => setSaved(null), 2000);
                onRefresh();
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5 text-blue-400" />
                    Estado del Sistema
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* N8N AI */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            localN8n ? 'bg-[#86EFAC] shadow-[0_0_6px_#86EFAC]' : 'bg-muted-foreground'
                        )} />
                        <div>
                            <p className="text-sm font-medium text-foreground">N8N IA</p>
                            <p className="text-xs text-muted-foreground">
                                {localN8n ? 'Mensajes personalizados con IA' : 'Usando plantillas estáticas'}
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant={localN8n ? 'default' : 'outline'}
                        onClick={() => toggle('use_n8n_ai', localN8n, setLocalN8n, setTogglingN8n)}
                        disabled={togglingN8n || togglingWl}
                        className={cn('h-8 text-xs', localN8n && 'bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90')}
                    >
                        {togglingN8n ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : saved === 'use_n8n_ai' ? (
                            <><Check className="mr-1 h-3 w-3" /> Guardado</>
                        ) : (
                            localN8n ? 'Activo' : 'Inactivo'
                        )}
                    </Button>
                </div>

                {/* Whitelist */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            localWl ? 'bg-orange-400 shadow-[0_0_6px_theme(colors.orange.400)]' : 'bg-muted-foreground'
                        )} />
                        <div>
                            <p className="text-sm font-medium text-foreground">Modo Prueba</p>
                            <p className="text-xs text-muted-foreground">
                                {localWl ? 'Solo envía a teléfonos en whitelist' : 'Envía a todos los clientes'}
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant={localWl ? 'default' : 'outline'}
                        onClick={() => toggle('wa_whitelist_enabled', localWl, setLocalWl, setTogglingWl)}
                        disabled={togglingN8n || togglingWl}
                        className={cn('h-8 text-xs', localWl && 'bg-orange-400 text-black hover:bg-orange-400/90')}
                    >
                        {togglingWl ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : saved === 'wa_whitelist_enabled' ? (
                            <><Check className="mr-1 h-3 w-3" /> Guardado</>
                        ) : (
                            localWl ? 'Activo' : 'Inactivo'
                        )}
                    </Button>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefresh}
                    className="w-full text-muted-foreground hover:text-foreground text-xs"
                >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Actualizar estado
                </Button>
            </CardContent>
        </Card>
    );
}
