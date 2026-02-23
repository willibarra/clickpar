'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Platform {
    id: string;
    name: string;
    stock_alert_threshold: number;
}

export function StockAlertSettings() {
    const supabase = createClient();
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchPlatforms();
    }, []);

    async function fetchPlatforms() {
        const { data } = await supabase
            .from('platforms')
            .select('id, name, stock_alert_threshold')
            .eq('is_active', true)
            .order('name');
        setPlatforms((data || []) as Platform[]);
        setLoading(false);
    }

    function updateThreshold(id: string, value: number) {
        setPlatforms(prev => prev.map(p => p.id === id ? { ...p, stock_alert_threshold: value } : p));
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        let hasError = false;

        for (const p of platforms) {
            const { error } = await (supabase.from('platforms') as any)
                .update({ stock_alert_threshold: p.stock_alert_threshold })
                .eq('id', p.id);
            if (error) {
                hasError = true;
                setMessage({ type: 'error', text: 'Error al guardar: ' + error.message });
                break;
            }
        }

        if (!hasError) {
            setMessage({ type: 'success', text: 'Umbrales guardados correctamente' });
        }
        setSaving(false);
    }

    if (loading) return null;

    return (
        <Card className="border-border bg-card">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-[#F97316]" />
                    <CardTitle>Alertas de Stock Bajo</CardTitle>
                </div>
                <CardDescription>
                    Configura el número mínimo de perfiles disponibles por plataforma antes de recibir una alerta
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-[#86EFAC]/20 text-[#86EFAC]' : 'bg-red-500/20 text-red-500'}`}>
                        {message.text}
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {platforms.map(p => (
                        <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-[#0d0d0d] p-3">
                            <span className="text-sm font-medium text-foreground flex-1">{p.name}</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Min:</span>
                                <Input
                                    type="number"
                                    value={p.stock_alert_threshold}
                                    onChange={(e) => updateThreshold(p.id, parseInt(e.target.value) || 0)}
                                    min={0}
                                    className="w-16 h-8 text-sm text-center"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <Button
                    onClick={handleSave}
                    className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                    disabled={saving}
                >
                    {saving ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                    ) : (
                        <><Save className="mr-2 h-4 w-4" /> Guardar Umbrales</>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
