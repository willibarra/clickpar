'use client';

import { useState } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';

interface CodeIframeModalProps {
    isOpen: boolean;
    onClose: () => void;
    codeUrl: string;
    platform: string;
}

export function CodeIframeModal({ isOpen, onClose, codeUrl, platform }: CodeIframeModalProps) {
    const [loading, setLoading] = useState(true);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl" style={{ maxHeight: '85vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            Consultar Código — {platform}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Ingresá el correo de tu cuenta para obtener el código
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Iframe */}
                <div className="relative flex-1 overflow-hidden" style={{ minHeight: '400px' }}>
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-card">
                            <Loader2 className="h-6 w-6 animate-spin text-[#86EFAC]" />
                        </div>
                    )}
                    <iframe
                        src={codeUrl}
                        className="h-full w-full border-0"
                        style={{ minHeight: '400px' }}
                        onLoad={() => setLoading(false)}
                        title={`Código de verificación - ${platform}`}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
                    <a
                        href={codeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-[#86EFAC]"
                    >
                        <ExternalLink className="h-3 w-3" />
                        Abrir en navegador
                    </a>
                    <button
                        onClick={onClose}
                        className="rounded-lg bg-muted px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
