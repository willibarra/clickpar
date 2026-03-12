'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAvailableSlots, type AvailableSlot } from '@/lib/actions/sales';

interface Slot extends AvailableSlot { }

interface SlotSelectorModalProps {
    isOpen: boolean;
    platform: string;
    onClose: () => void;
    onSelect: (slot: Slot) => void;
}

export function SlotSelectorModal({ isOpen, platform, onClose, onSelect }: SlotSelectorModalProps) {
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && platform) {
            loadAvailableSlots();
        }
    }, [isOpen, platform]);

    const loadAvailableSlots = async () => {
        setLoading(true);
        const result = await getAvailableSlots(platform);

        if (!result.error && result.data) {
            setSlots(result.data);
        } else {
            console.error('Error loading slots:', result.error);
            setSlots([]);
        }
        setLoading(false);
    };


    const filteredSlots = slots.filter(slot => {
        const query = searchQuery.toLowerCase();
        return (
            slot.mother_account?.email?.toLowerCase().includes(query) ||
            slot.slot_identifier?.toLowerCase().includes(query)
        );
    });

    // Group slots by mother account
    const groupedSlots = filteredSlots.reduce((acc, slot) => {
        const accountId = slot.mother_account?.id;
        if (!accountId) return acc;
        if (!acc[accountId]) {
            acc[accountId] = {
                account: slot.mother_account,
                slots: []
            };
        }
        acc[accountId].slots.push(slot);
        return acc;
    }, {} as Record<string, { account: Slot['mother_account']; slots: Slot[] }>);

    const handleConfirm = () => {
        const selected = slots.find(s => s.id === selectedSlotId);
        if (selected) {
            onSelect(selected);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Seleccionar Slot</h2>
                        <p className="text-sm text-muted-foreground">
                            Slots disponibles para {platform}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-[#333]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por email o perfil..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Slots List */}
                <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
                        </div>
                    ) : Object.keys(groupedSlots).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No hay slots disponibles para {platform}
                        </div>
                    ) : (
                        Object.values(groupedSlots).map(({ account, slots }) => (
                            <div key={account.id} className="rounded-lg border border-border bg-[#1a1a1a] overflow-hidden">
                                {/* Account Header */}
                                <div className="px-4 py-2 border-b border-border bg-[#222]">
                                    <p className="font-medium text-foreground text-sm">{account.email}</p>
                                    {account.renewal_date && (
                                        <p className="text-xs text-muted-foreground">
                                            Vence: {new Date(account.renewal_date + 'T12:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>
                                {/* Slots */}
                                <div className="p-2 grid grid-cols-4 gap-2">
                                    {slots.map((slot) => (
                                        <button
                                            key={slot.id}
                                            onClick={() => setSelectedSlotId(slot.id)}
                                            className={`rounded-lg p-2 text-center transition-all ${selectedSlotId === slot.id
                                                ? 'bg-[#86EFAC] text-black ring-2 ring-[#86EFAC]'
                                                : 'bg-[#333] hover:bg-[#444] text-foreground'
                                                }`}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                {selectedSlotId === slot.id && (
                                                    <Check className="h-3 w-3" />
                                                )}
                                                <span className="text-xs font-medium">
                                                    {slot.slot_identifier || 'Slot'}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 mt-4 border-t border-border">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex-1"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedSlotId}
                        className="flex-1 bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                    >
                        Confirmar Selección
                    </Button>
                </div>
            </div>
        </div>
    );
}
