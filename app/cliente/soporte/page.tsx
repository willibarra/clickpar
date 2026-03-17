'use client';

import { useEffect, useState } from 'react';
import {
    MessageSquare,
    Phone,
    Clock,
    ChevronDown,
    ChevronUp,
    HelpCircle,
    Loader2,
    AlertTriangle,
    Search,
    ListChecks,
    Info,
} from 'lucide-react';
import { CodeIframeModal } from '@/components/portal/code-iframe-modal';

interface FAQItem {
    q: string;
    a: string;
}

interface HelpItem {
    platform: string;
    supplierName: string;
    supportInstructions: string;
    helpSteps: string[];
    faqItems: FAQItem[];
    needsCode: boolean;
    codeUrl: string | null;
}

const PLATFORM_ICONS: Record<string, { emoji: string; gradient: string }> = {
    Netflix: { emoji: '🎬', gradient: 'from-red-600 to-red-800' },
    'HBO Max': { emoji: '💜', gradient: 'from-purple-600 to-purple-800' },
    'Disney+': { emoji: '🏰', gradient: 'from-blue-600 to-blue-800' },
    'Amazon Prime Video': { emoji: '📦', gradient: 'from-blue-500 to-cyan-600' },
    'Spotify Premium': { emoji: '🎧', gradient: 'from-green-500 to-green-700' },
    Spotify: { emoji: '🎧', gradient: 'from-green-500 to-green-700' },
    'YouTube Premium': { emoji: '▶️', gradient: 'from-red-500 to-red-700' },
    Crunchyroll: { emoji: '🍥', gradient: 'from-orange-500 to-orange-700' },
    VIX: { emoji: '📺', gradient: 'from-amber-500 to-amber-700' },
    Vix: { emoji: '📺', gradient: 'from-amber-500 to-amber-700' },
    'Paramount+': { emoji: '⛰️', gradient: 'from-blue-700 to-blue-900' },
    iCloud: { emoji: '☁️', gradient: 'from-sky-400 to-sky-600' },
    FLUJOTV: { emoji: '📡', gradient: 'from-indigo-500 to-indigo-700' },
};

function FAQAccordion({ item }: { item: FAQItem }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
                <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">{item.q}</span>
                {open ? (
                    <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                )}
            </button>
            {open && (
                <div className="border-t border-border/30 px-4 py-3">
                    <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                        {item.a}
                    </p>
                </div>
            )}
        </div>
    );
}

function VerCodeButton({ platform, codeUrl }: { platform: string; codeUrl: string }) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 py-2.5 text-sm font-medium text-[#86EFAC] transition-all hover:bg-[#86EFAC]/20"
            >
                <Search className="h-4 w-4" />
                Consultar Código
            </button>
            <CodeIframeModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                codeUrl={codeUrl}
                platform={platform}
            />
        </>
    );
}

function PlatformHelpCard({ item }: { item: HelpItem }) {
    const platformInfo = PLATFORM_ICONS[item.platform] || { emoji: '📱', gradient: 'from-gray-600 to-gray-800' };

    return (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            {/* Platform header */}
            <div className={`bg-gradient-to-r ${platformInfo.gradient} px-5 py-3.5`}>
                <div className="flex items-center gap-3">
                    <span className="text-xl">{platformInfo.emoji}</span>
                    <div>
                        <h3 className="text-base font-bold text-white">{item.platform}</h3>
                        <p className="text-[11px] text-white/60">Proveedor: {item.supplierName}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4 p-5">
                {/* Instructions summary */}
                {item.supportInstructions && (
                    <div className="flex items-start gap-3 rounded-xl bg-blue-500/5 border border-blue-500/15 p-3.5">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                        <p className="text-sm text-blue-200/80 leading-relaxed">
                            {item.supportInstructions}
                        </p>
                    </div>
                )}

                {/* Step-by-step guide */}
                {item.helpSteps.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <ListChecks className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Pasos de acceso</span>
                        </div>
                        <div className="space-y-1.5">
                            {item.helpSteps.map((step, i) => (
                                <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/30 px-3.5 py-2.5">
                                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#86EFAC]/20 text-[10px] font-bold text-[#86EFAC]">
                                        {i + 1}
                                    </span>
                                    <span className="text-sm text-foreground/90 leading-relaxed">{step}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Code lookup button */}
                {item.needsCode && item.codeUrl && (
                    <VerCodeButton platform={item.platform} codeUrl={item.codeUrl} />
                )}

                {/* FAQs */}
                {item.faqItems.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <HelpCircle className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Preguntas frecuentes</span>
                        </div>
                        <div className="space-y-1.5">
                            {item.faqItems.map((faq, i) => (
                                <FAQAccordion key={i} item={faq} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SoportePage() {
    const [helpItems, setHelpItems] = useState<HelpItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/portal/support')
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setHelpItems(data.helpItems);
                } else {
                    setError(data.error || 'Error al cargar soporte');
                }
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Soporte</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Ayuda personalizada para tus servicios activos
                </p>
            </div>

            {/* Personalized help per service */}
            {helpItems.length > 0 ? (
                <div className="space-y-4">
                    {helpItems.map((item, i) => (
                        <PlatformHelpCard key={`${item.platform}-${item.supplierName}-${i}`} item={item} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-12 text-center">
                    <div className="rounded-full bg-muted p-4">
                        <HelpCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-medium text-foreground">Sin servicios activos</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            La ayuda se personaliza según tus servicios contratados
                        </p>
                    </div>
                </div>
            )}

            {/* General FAQ - always shown */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Preguntas Generales
                </h2>
                <div className="space-y-1.5">
                    <FAQAccordion item={{ q: '¿Cómo renuevo mi servicio?', a: 'Escribinos por WhatsApp antes del vencimiento. Aceptamos Giros (Tigo, Personal, Claro), WALLY, ZIMPLE y Transferencia bancaria.' }} />
                    <FAQAccordion item={{ q: '¿Puedo cambiar de plataforma?', a: 'Sí, al momento de renovar podés elegir otra plataforma. El precio puede variar según el servicio elegido.' }} />
                    <FAQAccordion item={{ q: '¿Dónde veo mis credenciales?', a: 'En la sección "Servicios" de tu panel tenés el correo, contraseña y perfil de cada servicio.' }} />
                </div>
            </div>

            {/* WhatsApp contact */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Contactar por WhatsApp
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <a
                        href="https://wa.me/595971995666"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-[#86EFAC]/50 hover:bg-[#86EFAC]/5"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                            <MessageSquare className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">0971 995 666</p>
                            <p className="text-xs text-muted-foreground">Línea 1</p>
                        </div>
                    </a>
                    <a
                        href="https://wa.me/595994540904"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-[#86EFAC]/50 hover:bg-[#86EFAC]/5"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                            <MessageSquare className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">0994 540 904</p>
                            <p className="text-xs text-muted-foreground">Línea 2</p>
                        </div>
                    </a>
                </div>
            </div>

            {/* Business hours */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Horario de Atención</span>
                </div>
                <div className="space-y-1 text-sm">
                    {[
                        { day: 'Lunes a Viernes', time: '9:00 AM - 8:00 PM' },
                        { day: 'Sábado y Domingo', time: '2:00 PM - 8:00 PM' },
                    ].map((h) => (
                        <div key={h.day} className="flex justify-between">
                            <span className="text-muted-foreground">{h.day}</span>
                            <span className="font-medium text-foreground">{h.time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
