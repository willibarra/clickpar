'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

type CheckStatus = 'idle' | 'loading' | 'exists' | 'not_found' | 'error';

interface PhoneInputWithCheckProps {
    id?: string;
    name?: string;
    defaultValue?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
}

export function PhoneInputWithCheck({
    id = 'phone_number',
    name = 'phone_number',
    defaultValue = '',
    placeholder = '+595 9XX XXX XXX',
    onChange,
}: PhoneInputWithCheckProps) {
    const [value, setValue] = useState(defaultValue);
    const [status, setStatus] = useState<CheckStatus>('idle');
    const [statusMsg, setStatusMsg] = useState('');

    async function handleCheck() {
        const trimmed = value.trim();
        if (!trimmed) return;

        setStatus('loading');
        setStatusMsg('');

        try {
            const res = await fetch('/api/admin/check-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: trimmed }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setStatus('error');
                setStatusMsg(data.error || 'Error al verificar');
                return;
            }

            if (data.exists) {
                setStatus('exists');
                setStatusMsg(`✅ Activo en WhatsApp`);
            } else {
                setStatus('not_found');
                setStatusMsg(`❌ No registrado en WhatsApp`);
            }
        } catch {
            setStatus('error');
            setStatusMsg('Sin conexión con la API');
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setValue(e.target.value);
        setStatus('idle');
        setStatusMsg('');
        onChange?.(e.target.value);
    }

    const statusColors: Record<CheckStatus, string> = {
        idle: '',
        loading: 'text-muted-foreground',
        exists: 'text-green-400',
        not_found: 'text-red-400',
        error: 'text-amber-400',
    };

    const StatusIcon = () => {
        if (status === 'loading') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
        if (status === 'exists') return <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />;
        if (status === 'not_found') return <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
        if (status === 'error') return <HelpCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />;
        return null;
    };

    return (
        <div className="space-y-1.5">
            <div className="flex gap-2">
                <Input
                    id={id}
                    name={name}
                    value={value}
                    onChange={handleChange}
                    placeholder={placeholder}
                    className="flex-1"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCheck}
                    disabled={status === 'loading' || !value.trim()}
                    className="shrink-0 h-10 px-3 text-xs border-[#86EFAC]/40 text-[#86EFAC] hover:bg-[#86EFAC]/10 hover:text-[#86EFAC] disabled:opacity-40"
                    title="Verificar si el número tiene WhatsApp"
                >
                    {status === 'loading' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <>
                            <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            Verificar
                        </>
                    )}
                </Button>
            </div>

            {/* Status message */}
            {statusMsg && (
                <div className={`flex items-center gap-1.5 text-xs ${statusColors[status]}`}>
                    <StatusIcon />
                    <span>{statusMsg}</span>
                </div>
            )}

            {/* Hint when idle */}
            {status === 'idle' && value.trim() && (
                <p className="text-[11px] text-muted-foreground/60">
                    Con código de país, sin espacios. Ej: 595971234567 o +1 555 000 0000
                </p>
            )}
        </div>
    );
}
