'use client';

import { MessageSquare, Phone, Clock, ChevronDown, ChevronUp, HelpCircle, Tv, Key, CreditCard } from 'lucide-react';
import { useState } from 'react';

interface FAQItem {
    question: string;
    answer: string;
    icon: React.ReactNode;
}

const faqs: FAQItem[] = [
    {
        question: '¿Cómo accedo a mi servicio de Netflix?',
        answer: 'Ingresá a netflix.com con el correo y contraseña que figuran en la sección "Servicios". Seleccioná el perfil que te fue asignado. Recordá que solo podés usar 1 dispositivo a la vez.',
        icon: <Tv className="h-4 w-4" />,
    },
    {
        question: '¿Qué hago si me pide código hogar?',
        answer: '1. Seleccioná "estoy de viaje" (TV) o "ver temporalmente" (Cel)\n2. Seleccioná "Enviar Email"\n3. Ingresá a householdcode.com/es\n4. Colocá el correo de tu Netflix → CONSULTAR\n5. Ahí estará el código\n⚠️ SOLO ACTIVAR 1 DISPOSITIVO',
        icon: <Key className="h-4 w-4" />,
    },
    {
        question: '¿Cómo renuevo mi servicio?',
        answer: 'Escribinos por WhatsApp al 0994 540 904 antes del vencimiento. Aceptamos Giros (Tigo, Personal, Claro), WALLY, ZIMPLE y Transferencia bancaria.',
        icon: <CreditCard className="h-4 w-4" />,
    },
    {
        question: '¿Puedo cambiar de plataforma?',
        answer: 'Sí, al momento de renovar podés elegir otra plataforma. El precio puede variar según el servicio elegido.',
        icon: <HelpCircle className="h-4 w-4" />,
    },
];

function FAQAccordion({ item }: { item: FAQItem }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
            >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {item.icon}
                </div>
                <span className="flex-1 text-sm font-medium text-foreground">{item.question}</span>
                {open ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
            </button>
            {open && (
                <div className="border-t border-border/50 px-4 py-3">
                    <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                        {item.answer}
                    </p>
                </div>
            )}
        </div>
    );
}

export default function SoportePage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Soporte</h1>

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

            {/* FAQ */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Preguntas Frecuentes
                </h2>
                <div className="space-y-2">
                    {faqs.map((faq, i) => (
                        <FAQAccordion key={i} item={faq} />
                    ))}
                </div>
            </div>
        </div>
    );
}
