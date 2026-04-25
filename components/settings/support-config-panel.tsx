'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Pencil, Trash2, Loader2, Check, X, ChevronDown, ChevronRight,
    HelpCircle, ListChecks, Link, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlatformIcon } from '@/components/ui/platform-icon';
import { createBrowserClient } from '@supabase/ssr';

interface FaqItem {
    q: string;
    a: string;
}

interface CodeButton {
    label: string;
    source: string;
    url: string | null;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
}

const EMPTY_BUTTON: CodeButton = {
    label: 'Consultar Código',
    source: 'iframe',
    url: null,
    telegram_bot_username: null,
    telegram_user_identifier: null,
};

interface SupportConfig {
    id: string;
    platform: string;
    supplier_name: string;
    support_instructions: string;
    help_steps: string[];
    faq_items: FaqItem[];
    needs_code: boolean;
    code_url: string | null;
    code_source: string;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
    code_buttons: CodeButton[];
}

const EMPTY_CONFIG: Omit<SupportConfig, 'id'> = {
    platform: '',
    supplier_name: '',
    support_instructions: '',
    help_steps: [],
    faq_items: [],
    needs_code: false,
    code_url: null,
    code_source: 'manual',
    telegram_bot_username: null,
    telegram_user_identifier: null,
    code_buttons: [],
};

// ─── Step List Editor ──────────────────────────────────────────────────────

function StepListEditor({
    steps,
    onChange,
}: {
    steps: string[];
    onChange: (steps: string[]) => void;
}) {
    const addStep = () => onChange([...steps, '']);
    const removeStep = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
    const updateStep = (i: number, val: string) =>
        onChange(steps.map((s, idx) => (idx === i ? val : s)));

    return (
        <div className="space-y-2">
            {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#86EFAC]/20 text-[10px] font-bold text-[#86EFAC]">
                        {i + 1}
                    </span>
                    <Input
                        value={step}
                        onChange={(e) => updateStep(i, e.target.value)}
                        placeholder={`Paso ${i + 1}`}
                        className="h-8 text-sm"
                    />
                    <button
                        onClick={() => removeStep(i)}
                        className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-red-400"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ))}
            <button
                onClick={addStep}
                className="flex items-center gap-1.5 text-xs text-[#86EFAC] hover:text-[#86EFAC]/80"
            >
                <Plus className="h-3.5 w-3.5" />
                Agregar paso
            </button>
        </div>
    );
}

// ─── FAQ List Editor ───────────────────────────────────────────────────────

function FaqListEditor({
    faqs,
    onChange,
}: {
    faqs: FaqItem[];
    onChange: (faqs: FaqItem[]) => void;
}) {
    const addFaq = () => onChange([...faqs, { q: '', a: '' }]);
    const removeFaq = (i: number) => onChange(faqs.filter((_, idx) => idx !== i));
    const updateFaq = (i: number, field: 'q' | 'a', val: string) =>
        onChange(faqs.map((f, idx) => (idx === i ? { ...f, [field]: val } : f)));

    return (
        <div className="space-y-3">
            {faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">FAQ #{i + 1}</span>
                        <button
                            onClick={() => removeFaq(i)}
                            className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <Input
                        value={faq.q}
                        onChange={(e) => updateFaq(i, 'q', e.target.value)}
                        placeholder="Pregunta"
                        className="h-8 text-sm"
                    />
                    <textarea
                        value={faq.a}
                        onChange={(e) => updateFaq(i, 'a', e.target.value)}
                        placeholder="Respuesta"
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            ))}
            <button
                onClick={addFaq}
                className="flex items-center gap-1.5 text-xs text-[#86EFAC] hover:text-[#86EFAC]/80"
            >
                <Plus className="h-3.5 w-3.5" />
                Agregar pregunta
            </button>
        </div>
    );
}

// ─── Supplier Card (expandable details within a platform) ──────────────────

function SupplierCard({
    config,
    isExpanded,
    onToggle,
    onEdit,
    onDelete,
}: {
    config: SupportConfig;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: (c: SupportConfig) => void;
    onDelete: (id: string) => void;
}) {
    const [deleting, setDeleting] = useState(false);

    return (
        <div className="rounded-lg border border-border/30 bg-muted/5 overflow-hidden transition-all">
            {/* Supplier header */}
            <button
                onClick={onToggle}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-[#86EFAC]" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                    <span className="text-sm font-medium text-foreground">{config.supplier_name}</span>
                    {config.code_buttons && config.code_buttons.length > 0 && (
                        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                            {config.code_buttons.length} botón{config.code_buttons.length !== 1 ? 'es' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{config.help_steps.length} pasos</span>
                    <span>·</span>
                    <span>{config.faq_items.length} FAQs</span>
                </div>
            </button>

            {/* Expanded details */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border/20 space-y-4">
                    {/* Instructions */}
                    {config.support_instructions && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Instrucciones</p>
                            <p className="text-sm text-foreground/80 bg-muted/10 rounded-lg px-3 py-2 border border-border/20 whitespace-pre-wrap">
                                {config.support_instructions}
                            </p>
                        </div>
                    )}

                    {/* Steps */}
                    {config.help_steps.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Pasos de ayuda</p>
                            <div className="space-y-1.5">
                                {config.help_steps.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#86EFAC]/15 text-[10px] font-bold text-[#86EFAC] mt-0.5">
                                            {i + 1}
                                        </span>
                                        <span>{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* FAQs */}
                    {config.faq_items.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Preguntas frecuentes</p>
                            <div className="space-y-2">
                                {config.faq_items.map((faq, i) => (
                                    <div key={i} className="bg-muted/10 rounded-lg px-3 py-2 border border-border/20">
                                        <p className="text-sm font-medium text-foreground/90">❓ {faq.q}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{faq.a}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Code Buttons */}
                    {config.code_buttons && config.code_buttons.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Botones de consulta ({config.code_buttons.length})</p>
                            <div className="space-y-2">
                                {config.code_buttons.map((btn: CodeButton, i: number) => (
                                    <div key={i} className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
                                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-400">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground/90 truncate">{btn.label}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {btn.source === 'manual' ? '🤝 Manual' :
                                                 btn.source === 'iframe' ? '🌐 iFrame' :
                                                 btn.source === 'telegram_bot' ? '🤖 Telegram Bot' :
                                                 btn.source === 'imap' ? '📨 IMAP' : btn.source}
                                                {btn.url && <span className="ml-1 font-mono opacity-60">· {btn.url}</span>}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEdit(config)}
                            className="text-xs h-7 gap-1.5"
                        >
                            <Pencil className="h-3 w-3" />
                            Editar
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                if (!confirm(`¿Eliminar ${config.platform} - ${config.supplier_name}?`)) return;
                                setDeleting(true);
                                await onDelete(config.id);
                                setDeleting(false);
                            }}
                            disabled={deleting}
                            className="text-xs h-7 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
                        >
                            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Eliminar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────

function EditModal({
    config,
    isNew,
    onSave,
    onClose,
}: {
    config: Partial<SupportConfig>;
    isNew: boolean;
    onSave: (data: Partial<SupportConfig>) => Promise<void>;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<Partial<SupportConfig>>({ ...config });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [openSection, setOpenSection] = useState<'instructions' | 'steps' | 'faqs' | 'code' | null>('instructions');
    const [platformOptions, setPlatformOptions] = useState<string[]>([]);
    const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);

    // Load active platforms on mount
    useEffect(() => {
        if (!isNew) return;
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        supabase.from('platforms').select('name').eq('is_active', true).order('name').then(({ data }) => {
            setPlatformOptions((data || []).map((p: any) => p.name));
        });
    }, [isNew]);

    // Load suppliers when platform changes
    useEffect(() => {
        if (!isNew || !draft.platform) {
            setSupplierOptions([]);
            return;
        }
        setLoadingSuppliers(true);
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        supabase
            .from('mother_accounts')
            .select('supplier_name')
            .eq('platform', draft.platform)
            .is('deleted_at', null)
            .then(({ data }) => {
                // Get unique supplier names
                const unique = [...new Set((data || []).map((r: any) => r.supplier_name).filter(Boolean))].sort();
                setSupplierOptions(unique as string[]);
                setLoadingSuppliers(false);
            });
    }, [isNew, draft.platform]);

    const set = (field: keyof SupportConfig, value: unknown) =>
        setDraft((d) => ({ ...d, [field]: value }));

    const handleSave = async () => {
        setSaving(true);
        await onSave(draft);
        setSaving(false);
        setSaved(true);
        setTimeout(() => { setSaved(false); onClose(); }, 800);
    };

    const toggleSection = (s: typeof openSection) =>
        setOpenSection((prev) => (prev === s ? null : s));

    const SectionHeader = ({
        id, label, icon,
    }: { id: typeof openSection; label: string; icon: React.ReactNode }) => (
        <button
            onClick={() => toggleSection(id)}
            className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-foreground hover:text-[#86EFAC] transition-colors"
        >
            <div className="flex items-center gap-2 text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            {openSection === id
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />
            }
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-foreground">
                            {isNew ? 'Nueva configuración' : 'Editar soporte'}
                        </h2>
                        {!isNew && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {draft.platform} · {draft.supplier_name}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-1">
                    {/* Platform + Supplier (only editable for new) */}
                    {isNew && (
                        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border/40">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Plataforma</label>
                                <select
                                    value={draft.platform || ''}
                                    onChange={(e) => {
                                        setDraft(d => ({ ...d, platform: e.target.value, supplier_name: '' }));
                                    }}
                                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                                >
                                    <option value="" disabled>Seleccionar...</option>
                                    {platformOptions.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                                <select
                                    value={draft.supplier_name || ''}
                                    onChange={(e) => set('supplier_name', e.target.value)}
                                    disabled={!draft.platform || loadingSuppliers}
                                    className={`w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer ${!draft.platform ? 'opacity-50' : ''}`}
                                >
                                    <option value="" disabled>
                                        {!draft.platform
                                            ? 'Elegí plataforma primero'
                                            : loadingSuppliers
                                            ? 'Cargando...'
                                            : supplierOptions.length === 0
                                            ? 'Sin proveedores'
                                            : 'Seleccionar...'}
                                    </option>
                                    {supplierOptions.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Instructions */}
                    <div className="border-b border-border/30 pb-2">
                        <SectionHeader id="instructions" label="Instrucciones generales" icon={<HelpCircle className="h-4 w-4" />} />
                        {openSection === 'instructions' && (
                            <textarea
                                value={draft.support_instructions || ''}
                                onChange={(e) => set('support_instructions', e.target.value)}
                                placeholder="Instrucciones que verá el cliente en su portal..."
                                rows={3}
                                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        )}
                    </div>

                    {/* Steps */}
                    <div className="border-b border-border/30 pb-2">
                        <SectionHeader id="steps" label={`Pasos de ayuda (${draft.help_steps?.length || 0})`} icon={<ListChecks className="h-4 w-4" />} />
                        {openSection === 'steps' && (
                            <div className="mt-2">
                                <StepListEditor
                                    steps={draft.help_steps || []}
                                    onChange={(s) => set('help_steps', s)}
                                />
                            </div>
                        )}
                    </div>

                    {/* FAQs */}
                    <div className="border-b border-border/30 pb-2">
                        <SectionHeader id="faqs" label={`FAQs (${draft.faq_items?.length || 0})`} icon={<HelpCircle className="h-4 w-4" />} />
                        {openSection === 'faqs' && (
                            <div className="mt-2">
                                <FaqListEditor
                                    faqs={draft.faq_items || []}
                                    onChange={(f) => set('faq_items', f)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Code Buttons */}
                    <div>
                        <SectionHeader id="code" label={`Botones de consulta (${draft.code_buttons?.length || 0})`} icon={<Link className="h-4 w-4" />} />
                        {openSection === 'code' && (
                            <div className="mt-2 space-y-3">
                                {(draft.code_buttons || []).map((btn, btnIdx) => (
                                    <div key={btnIdx} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground font-medium">Botón #{btnIdx + 1}</span>
                                            <button
                                                onClick={() => {
                                                    const next = (draft.code_buttons || []).filter((_, i) => i !== btnIdx);
                                                    set('code_buttons', next);
                                                }}
                                                className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        {/* Label */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-muted-foreground">Texto del botón</label>
                                            <Input
                                                value={btn.label || ''}
                                                onChange={(e) => {
                                                    const next = [...(draft.code_buttons || [])];
                                                    next[btnIdx] = { ...next[btnIdx], label: e.target.value };
                                                    set('code_buttons', next);
                                                }}
                                                placeholder="Consultar Código de Inicio"
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        {/* Source selector */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-muted-foreground">Fuente</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[
                                                    { value: 'manual', label: '🤝 Manual' },
                                                    { value: 'iframe', label: '🌐 iFrame' },
                                                    { value: 'telegram_bot', label: '🤖 Telegram' },
                                                    { value: 'imap', label: '📨 IMAP' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => {
                                                            const next = [...(draft.code_buttons || [])];
                                                            next[btnIdx] = { ...next[btnIdx], source: opt.value };
                                                            set('code_buttons', next);
                                                        }}
                                                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                                                            (btn.source || 'manual') === opt.value
                                                                ? 'border-[#86EFAC]/60 bg-[#86EFAC]/10 text-[#86EFAC]'
                                                                : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-border'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* URL (iframe) */}
                                        {btn.source === 'iframe' && (
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-muted-foreground">URL del iFrame</label>
                                                <Input
                                                    value={btn.url || ''}
                                                    onChange={(e) => {
                                                        const next = [...(draft.code_buttons || [])];
                                                        next[btnIdx] = { ...next[btnIdx], url: e.target.value || null };
                                                        set('code_buttons', next);
                                                    }}
                                                    placeholder="https://householdcode.com/es"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        )}
                                        {/* IMAP hint */}
                                        {btn.source === 'imap' && (
                                            <p className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                                                📨 Se buscará automáticamente en las cuentas IMAP configuradas.
                                            </p>
                                        )}
                                        {/* Telegram config */}
                                        {btn.source === 'telegram_bot' && (
                                            <div className="space-y-2">
                                                <p className="text-xs text-[#818CF8]/80 bg-[#818CF8]/5 border border-[#818CF8]/15 rounded-lg px-3 py-2">
                                                    🤖 UserBot de Telegram pedirá el código al bot del proveedor.
                                                </p>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-muted-foreground">Username del Bot</label>
                                                    <Input
                                                        value={btn.telegram_bot_username || ''}
                                                        onChange={(e) => {
                                                            const next = [...(draft.code_buttons || [])];
                                                            next[btnIdx] = { ...next[btnIdx], telegram_bot_username: e.target.value || null };
                                                            set('code_buttons', next);
                                                        }}
                                                        placeholder="@autocodestream_bot"
                                                        className="h-8 text-sm font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-muted-foreground">Tu usuario en ese bot</label>
                                                    <Input
                                                        value={btn.telegram_user_identifier || ''}
                                                        onChange={(e) => {
                                                            const next = [...(draft.code_buttons || [])];
                                                            next[btnIdx] = { ...next[btnIdx], telegram_user_identifier: e.target.value || null };
                                                            set('code_buttons', next);
                                                        }}
                                                        placeholder="will"
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={() => set('code_buttons', [...(draft.code_buttons || []), { ...EMPTY_BUTTON }])}
                                    className="flex items-center gap-1.5 text-xs text-[#86EFAC] hover:text-[#86EFAC]/80"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Agregar botón de consulta
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-5 py-4 border-t border-border flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90 min-w-[90px]"
                    >
                        {saved ? (
                            <><Check className="mr-1.5 h-4 w-4" /> Guardado</>
                        ) : saving ? (
                            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando...</>
                        ) : (
                            isNew ? 'Crear' : 'Guardar'
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export function SupportConfigPanel() {
    const [configs, setConfigs] = useState<SupportConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editTarget, setEditTarget] = useState<Partial<SupportConfig> | null>(null);
    const [isNew, setIsNew] = useState(false);

    // Accordion state: only one platform open, only one supplier open
    const [openPlatform, setOpenPlatform] = useState<string | null>(null);
    const [openSupplier, setOpenSupplier] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/support-config');
            const data = await res.json();
            setConfigs(data.configs || []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Filter configs by search
    const filtered = configs.filter((c) => {
        const q = search.toLowerCase();
        return (
            c.platform.toLowerCase().includes(q) ||
            c.supplier_name.toLowerCase().includes(q)
        );
    });

    // Group by platform
    const grouped = useMemo(() => {
        const map = new Map<string, SupportConfig[]>();
        for (const c of filtered) {
            const list = map.get(c.platform) || [];
            list.push(c);
            map.set(c.platform, list);
        }
        // Sort platforms alphabetically
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [filtered]);

    const handleSave = async (draft: Partial<SupportConfig>) => {
        if (isNew) {
            await fetch('/api/admin/support-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
        } else {
            await fetch(`/api/admin/support-config?id=${draft.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
        }
        await load();
    };

    const handleDelete = async (id: string) => {
        await fetch(`/api/admin/support-config?id=${id}`, { method: 'DELETE' });
        await load();
    };

    const togglePlatform = (platform: string) => {
        if (openPlatform === platform) {
            setOpenPlatform(null);
            setOpenSupplier(null);
        } else {
            setOpenPlatform(platform);
            setOpenSupplier(null);
        }
    };

    const toggleSupplier = (supplierId: string) => {
        setOpenSupplier(prev => prev === supplierId ? null : supplierId);
    };

    return (
        <div className="p-5 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar plataforma o proveedor..."
                        className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
                <Button
                    size="sm"
                    onClick={() => { setIsNew(true); setEditTarget({ ...EMPTY_CONFIG }); }}
                    className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Nueva
                </Button>
            </div>

            {/* Accordion List */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#86EFAC]" />
                </div>
            ) : grouped.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                    {search ? 'Sin resultados para esa búsqueda' : 'No hay configuraciones de soporte'}
                </p>
            ) : (
                <div className="space-y-2">
                    {grouped.map(([platform, platformConfigs]) => {
                        const isOpen = openPlatform === platform;
                        const supplierCount = platformConfigs.length;

                        return (
                            <div
                                key={platform}
                                className={`rounded-xl border transition-all ${
                                    isOpen
                                        ? 'border-[#86EFAC]/30 bg-[#86EFAC]/[0.03]'
                                        : 'border-border/40 bg-card hover:border-border/60'
                                }`}
                            >
                                {/* Platform header */}
                                <button
                                    onClick={() => togglePlatform(platform)}
                                    className="flex w-full items-center justify-between px-4 py-3 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        {isOpen
                                            ? <ChevronDown className="h-4 w-4 text-[#86EFAC]" />
                                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        }
                                        <PlatformIcon platform={platform} size={24} />
                                        <span className={`font-semibold text-sm ${isOpen ? 'text-[#86EFAC]' : 'text-foreground'}`}>
                                            {platform}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground bg-muted/30 rounded-full px-2.5 py-0.5">
                                        {supplierCount} proveedor{supplierCount !== 1 ? 'es' : ''}
                                    </span>
                                </button>

                                {/* Supplier list (expanded) */}
                                {isOpen && (
                                    <div className="px-4 pb-3 space-y-2">
                                        {platformConfigs.map((config) => (
                                            <SupplierCard
                                                key={config.id}
                                                config={config}
                                                isExpanded={openSupplier === config.id}
                                                onToggle={() => toggleSupplier(config.id)}
                                                onEdit={(cfg) => { setIsNew(false); setEditTarget(cfg); }}
                                                onDelete={handleDelete}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <p className="text-xs text-muted-foreground text-right pt-1">
                        {filtered.length} configuración{filtered.length !== 1 ? 'es' : ''} en {grouped.length} plataforma{grouped.length !== 1 ? 's' : ''}
                    </p>
                </div>
            )}

            {/* Edit/Create Modal */}
            {editTarget && (
                <EditModal
                    config={editTarget}
                    isNew={isNew}
                    onSave={handleSave}
                    onClose={() => { setEditTarget(null); setIsNew(false); }}
                />
            )}
        </div>
    );
}
