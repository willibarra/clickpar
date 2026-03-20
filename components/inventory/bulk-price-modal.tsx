'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bulkUpdateAvailableSlotPrices } from '@/lib/actions/inventory';
import { Tag, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BulkPriceModalProps {
    open: boolean;
    onClose: () => void;
    platforms: string[];
}

export function BulkPriceModal({ open, onClose, platforms }: BulkPriceModalProps) {
    const [price, setPrice] = useState('');
    const [platform, setPlatform] = useState('all');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

    async function handleSubmit() {
        const numericPrice = parseFloat(price.replace(/\./g, '').replace(',', '.'));
        if (!numericPrice || numericPrice <= 0) {
            setResult({ error: 'Ingresá un precio válido mayor a 0' });
            return;
        }

        setLoading(true);
        setResult(null);

        const res = await bulkUpdateAvailableSlotPrices(numericPrice, platform);
        setResult(res);
        setLoading(false);

        if (res.success) {
            setTimeout(() => {
                handleClose();
            }, 1500);
        }
    }

    function handleClose() {
        setPrice('');
        setPlatform('all');
        setResult(null);
        setLoading(false);
        onClose();
    }

    const formattedPreview = price
        ? `Gs. ${parseFloat(price.replace(/\./g, '').replace(',', '.') || '0').toLocaleString('es-PY')}`
        : null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="sm:max-w-md bg-[#0d1117] border border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <Tag className="h-5 w-5 text-[#86EFAC]" />
                        Actualizar precio — Perfiles Libres
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                        Actualiza el <span className="text-foreground font-medium">precio de venta</span> de todas
                        las cuentas madre que tengan al menos un perfil disponible.
                    </p>

                    {/* Plataforma */}
                    <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground">Plataforma</Label>
                        <Select value={platform} onValueChange={setPlatform}>
                            <SelectTrigger className="bg-card border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">🌐 Todas las plataformas</SelectItem>
                                {platforms.map(p => (
                                    <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Precio */}
                    <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground">Nuevo precio (Gs.)</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">Gs.</span>
                            <Input
                                type="number"
                                min={0}
                                placeholder="Ej: 35000"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                className="pl-10 bg-card border-border focus:border-[#86EFAC]/50"
                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            />
                        </div>
                        {formattedPreview && (
                            <p className="text-xs text-[#86EFAC]/70">→ {formattedPreview} por perfil</p>
                        )}
                    </div>

                    {/* Result feedback */}
                    {result && (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                            result.success
                                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                                : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        }`}>
                            {result.success
                                ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                : <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            }
                            {result.success
                                ? `✅ Precio actualizado correctamente`
                                : result.error
                            }
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={loading}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !price}
                        className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 font-medium"
                    >
                        {loading ? 'Actualizando...' : 'Actualizar precios'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
