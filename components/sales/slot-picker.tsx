'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Target,
    ChevronDown,
    ChevronUp,
    Info,
    Zap,
    Calendar,
    Layers
} from 'lucide-react';
import {
    SlotWithAccount,
    TetrisResult,
    rankSlotsByTetris,
    filterSlotsByPlatform
} from '@/lib/utils/tetris-algorithm';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface SlotPickerProps {
    availableSlots: SlotWithAccount[];
    platform: string;
    selectedSlotId: string | null;
    onSlotSelect: (slotId: string, defaultPrice: number | null) => void;
    durationDays?: number;
}

export function SlotPicker({
    availableSlots,
    platform,
    selectedSlotId,
    onSlotSelect,
    durationDays = 30,
}: SlotPickerProps) {
    const [showAlternatives, setShowAlternatives] = useState(false);

    // Filtrar por plataforma y rankear con Tetris
    const rankedSlots = useMemo(() => {
        const filtered = platform
            ? filterSlotsByPlatform(availableSlots, platform)
            : availableSlots;
        return rankSlotsByTetris(filtered, new Date(), durationDays);
    }, [availableSlots, platform, durationDays]);

    // Slot recomendado (el primero del ranking)
    const recommendedSlot = rankedSlots[0];

    // Slot actualmente seleccionado
    const selectedResult = rankedSlots.find(r => r.slot.id === selectedSlotId);
    const displaySlot = selectedResult || recommendedSlot;

    // Auto-seleccionar el slot recomendado si no hay ninguno seleccionado
    useEffect(() => {
        if (!selectedSlotId && recommendedSlot) {
            onSlotSelect(
                recommendedSlot.slot.id,
                recommendedSlot.slot.mother_accounts?.default_slot_price_gs || null
            );
        }
    }, [selectedSlotId, recommendedSlot, onSlotSelect]);

    if (rankedSlots.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                    No hay slots disponibles para {platform || 'esta plataforma'}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Slot Seleccionado */}
            {displaySlot && (
                <div className={`rounded-lg border p-4 transition-all ${displaySlot === recommendedSlot
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-yellow-500/50 bg-yellow-500/5'
                    }`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                {displaySlot === recommendedSlot ? (
                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                        <Target className="mr-1 h-3 w-3" />
                                        Recomendado
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">
                                        Selección Manual
                                    </Badge>
                                )}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            <div className="space-y-1 text-xs">
                                                <p><strong>Puntuación Tetris:</strong> {displaySlot.score}/100</p>
                                                <p><Zap className="inline h-3 w-3 mr-1" />Sincronización: {displaySlot.details.syncScore}/40</p>
                                                <p><Calendar className="inline h-3 w-3 mr-1" />Urgencia: {displaySlot.details.urgencyScore}/30</p>
                                                <p><Layers className="inline h-3 w-3 mr-1" />Ocupación: {displaySlot.details.occupancyScore}/30</p>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            <p className="font-medium">
                                {displaySlot.slot.mother_accounts?.platform} - {displaySlot.slot.slot_identifier}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {displaySlot.slot.mother_accounts?.email}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Vence: {new Date((displaySlot.slot.mother_accounts?.renewal_date || '') + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>

                            <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                {displaySlot.reason}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Botón para cambiar */}
            {rankedSlots.length > 1 && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAlternatives(!showAlternatives)}
                >
                    {showAlternatives ? (
                        <>
                            <ChevronUp className="mr-2 h-4 w-4" />
                            Ocultar alternativas
                        </>
                    ) : (
                        <>
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Cambiar Cuenta Asignada ({rankedSlots.length - 1} más)
                        </>
                    )}
                </Button>
            )}

            {/* Lista de alternativas */}
            {showAlternatives && (
                <div className="space-y-2 pl-2 border-l-2 border-muted">
                    {rankedSlots
                        .filter(r => r.slot.id !== selectedSlotId)
                        .map((result, idx) => (
                            <button
                                key={result.slot.id}
                                type="button"
                                onClick={() => {
                                    onSlotSelect(
                                        result.slot.id,
                                        result.slot.mother_accounts?.default_slot_price_gs || null
                                    );
                                    setShowAlternatives(false);
                                }}
                                className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-all"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium">
                                            {result.slot.mother_accounts?.platform} - {result.slot.slot_identifier}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {result.slot.mother_accounts?.email}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <Badge variant="outline" className="text-xs">
                                            {result.score} pts
                                        </Badge>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {result.reason}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
}
