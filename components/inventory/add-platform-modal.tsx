'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Users, Tv, Pencil, Trash2, ArrowLeft, Layers, X, Tag } from 'lucide-react';
import { getPlatforms, createPlatform, updatePlatform, deletePlatform } from '@/lib/actions/platforms';

const defaultColors = [
    '#E50914', // Netflix red
    '#1DB954', // Spotify green
    '#5c16c5', // HBO purple
    '#0063e5', // Disney blue
    '#00a8e1', // Amazon cyan
    '#ff0000', // YouTube red
    '#F47521', // Crunchyroll orange
    '#0064FF', // Paramount blue
    '#C724B1', // Star+ pink
    '#000000', // Black
    '#FFD700', // Gold
    '#4A90D9', // Steel blue
];

interface Platform {
    id: string;
    name: string;
    slug: string;
    business_type: string;
    icon_color: string;
    default_max_slots: number;
    default_slot_price_gs: number;
    slot_label: string;
    nicknames?: string[];
}

type ModalView = 'list' | 'form';

export function AddPlatformModal() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<ModalView>('list');
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedColor, setSelectedColor] = useState(defaultColors[0]);
    const [businessType, setBusinessType] = useState<'profile_sharing' | 'family_account'>('profile_sharing');
    const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [formName, setFormName] = useState('');
    const [nicknames, setNicknames] = useState<string[]>([]);
    const [nicknameInput, setNicknameInput] = useState('');

    // Sorted platforms alphabetically
    const sortedPlatforms = useMemo(() =>
        [...platforms].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [platforms]
    );

    // Load platforms when modal opens
    useEffect(() => {
        if (open) {
            loadPlatforms();
            setView('list');
            setEditingPlatform(null);
            setError(null);
        }
    }, [open]);

    async function loadPlatforms() {
        setLoadingList(true);
        const data = await getPlatforms();
        setPlatforms(data);
        setLoadingList(false);
    }

    function openCreateForm() {
        setEditingPlatform(null);
        setFormName('');
        setNicknames([]);
        setNicknameInput('');
        setSelectedColor(defaultColors[0]);
        setBusinessType('profile_sharing');
        setError(null);
        setView('form');
    }

    function openEditForm(platform: Platform) {
        setEditingPlatform(platform);
        setFormName(platform.name);
        setNicknames(platform.nicknames || []);
        setNicknameInput('');
        setSelectedColor(platform.icon_color || defaultColors[0]);
        setBusinessType((platform.business_type as 'profile_sharing' | 'family_account') || 'profile_sharing');
        setError(null);
        setView('form');
    }

    function goBackToList() {
        setView('list');
        setError(null);
        setEditingPlatform(null);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const trimmedName = formName.trim();

        // Auto-add any pending nickname text (user may not have pressed Enter)
        let finalNicknames = [...nicknames];
        if (nicknameInput.trim() && !finalNicknames.includes(nicknameInput.trim())) {
            finalNicknames = [...finalNicknames, nicknameInput.trim()];
        }

        // Client-side duplicate check
        const isDuplicate = platforms.some(p =>
            p.name.toLowerCase() === trimmedName.toLowerCase() &&
            p.id !== editingPlatform?.id
        );
        if (isDuplicate) {
            setError('Ya existe una plataforma con ese nombre');
            setLoading(false);
            return;
        }

        const formData = new FormData();
        formData.set('name', trimmedName);
        formData.set('icon_color', selectedColor);
        formData.set('business_type', businessType);
        formData.set('default_max_slots', '5');
        formData.set('default_slot_price_gs', '30000');
        formData.set('slot_label', businessType === 'family_account' ? 'Miembro' : 'Perfil');
        formData.set('nicknames', JSON.stringify(finalNicknames));

        let result;
        if (editingPlatform) {
            result = await updatePlatform(editingPlatform.id, formData);
        } else {
            result = await createPlatform(formData);
        }

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setLoading(false);
            await loadPlatforms();
            setView('list');
            router.refresh();
        }
    }

    async function handleDelete(id: string) {
        setDeleteLoading(true);
        const result = await deletePlatform(id);
        if (result.error) {
            setError(result.error);
        } else {
            setDeletingId(null);
            await loadPlatforms();
            router.refresh();
        }
        setDeleteLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-dashed">
                    <Layers className="mr-2 h-4 w-4" />
                    Plataforma
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
                {view === 'list' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Plataformas</DialogTitle>
                            <DialogDescription>
                                Gestiona las plataformas de streaming disponibles
                            </DialogDescription>
                        </DialogHeader>

                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <div className="max-h-[400px] overflow-y-auto space-y-1 py-2">
                            {loadingList ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : sortedPlatforms.length === 0 ? (
                                <div className="text-center py-8">
                                    <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                                    <p className="text-muted-foreground text-sm">No hay plataformas registradas</p>
                                </div>
                            ) : (
                                sortedPlatforms.map((platform) => (
                                    <div key={platform.id}>
                                        {deletingId === platform.id ? (
                                            // Delete confirmation row
                                            <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-3 transition-all">
                                                <span className="text-sm text-red-400">
                                                    ¿Eliminar <strong>{platform.name}</strong>?
                                                </span>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                                        onClick={() => setDeletingId(null)}
                                                        disabled={deleteLoading}
                                                    >
                                                        No
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        className="h-7 text-xs"
                                                        onClick={() => handleDelete(platform.id)}
                                                        disabled={deleteLoading}
                                                    >
                                                        {deleteLoading ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : 'Sí, eliminar'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            // Normal platform row
                                            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5 hover:bg-muted/30 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                                        style={{ backgroundColor: platform.icon_color || '#666' }}
                                                    >
                                                        {platform.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-foreground text-sm">{platform.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {platform.business_type === 'family_account' ? 'Familia' : 'Perfiles'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                        onClick={() => openEditForm(platform)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                                        onClick={() => setDeletingId(platform.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                onClick={openCreateForm}
                                className="w-full bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Nueva Plataforma
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={goBackToList}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <div>
                                    <DialogTitle>
                                        {editingPlatform ? 'Editar Plataforma' : 'Nueva Plataforma'}
                                    </DialogTitle>
                                    <DialogDescription>
                                        {editingPlatform
                                            ? `Editando: ${editingPlatform.name}`
                                            : 'Agrega una nueva plataforma de streaming'}
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <form onSubmit={handleSubmit}>
                            {error && (
                                <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                                    {error}
                                </div>
                            )}

                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre de la Plataforma</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="Ej: Netflix, Spotify, HBO..."
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        required
                                    />
                                </div>

                                {/* Nicknames / Apodos */}
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5">
                                        <Tag className="h-3.5 w-3.5" />
                                        Apodos para WhatsApp
                                    </Label>
                                    <p className="text-xs text-muted-foreground -mt-1">
                                        Nombres alternativos usados en mensajes de WhatsApp
                                    </p>

                                    {/* Tags display */}
                                    {nicknames.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {nicknames.map((nick, idx) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-1 rounded-full bg-[#86EFAC]/15 border border-[#86EFAC]/30 px-2.5 py-0.5 text-xs font-medium text-[#86EFAC]"
                                                >
                                                    {nick}
                                                    <button
                                                        type="button"
                                                        onClick={() => setNicknames(prev => prev.filter((_, i) => i !== idx))}
                                                        className="text-[#86EFAC]/60 hover:text-[#86EFAC] transition-colors ml-0.5"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Input for new nickname */}
                                    <Input
                                        placeholder="Escribí un apodo y presioná Enter"
                                        value={nicknameInput}
                                        onChange={(e) => setNicknameInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if ((e.key === 'Enter' || e.key === ',') && nicknameInput.trim()) {
                                                e.preventDefault();
                                                const newNick = nicknameInput.trim().replace(/,/g, '');
                                                if (newNick && !nicknames.includes(newNick)) {
                                                    setNicknames(prev => [...prev, newNick]);
                                                }
                                                setNicknameInput('');
                                            }
                                        }}
                                    />
                                </div>

                                {/* Business Type Selection */}
                                <div className="space-y-3">
                                    <Label>Tipo de Modelo</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setBusinessType('profile_sharing')}
                                            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-all ${businessType === 'profile_sharing'
                                                ? 'border-[#86EFAC] bg-[#86EFAC]/10'
                                                : 'border-border hover:border-muted-foreground'
                                                }`}
                                        >
                                            <Tv className={`h-8 w-8 ${businessType === 'profile_sharing' ? 'text-[#86EFAC]' : 'text-muted-foreground'}`} />
                                            <div className="text-center">
                                                <p className="font-medium text-foreground">Perfiles</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Como Netflix, Disney+
                                                </p>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setBusinessType('family_account')}
                                            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-all ${businessType === 'family_account'
                                                ? 'border-[#F97316] bg-[#F97316]/10'
                                                : 'border-border hover:border-muted-foreground'
                                                }`}
                                        >
                                            <Users className={`h-8 w-8 ${businessType === 'family_account' ? 'text-[#F97316]' : 'text-muted-foreground'}`} />
                                            <div className="text-center">
                                                <p className="font-medium text-foreground">Familia</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Como Spotify, YouTube
                                                </p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* Color Selection */}
                                <div className="space-y-2">
                                    <Label>Color de la Plataforma</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {defaultColors.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => setSelectedColor(color)}
                                                className={`h-8 w-8 rounded-full transition-all ${selectedColor === color
                                                    ? 'ring-2 ring-white ring-offset-2 ring-offset-background'
                                                    : 'hover:scale-110'
                                                    }`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={goBackToList}>
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        editingPlatform ? 'Guardar Cambios' : 'Agregar Plataforma'
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
