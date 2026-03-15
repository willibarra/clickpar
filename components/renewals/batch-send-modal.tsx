import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Send, AlertTriangle } from 'lucide-react';
interface ClientRenewal {
    sale_id: string;
    phone: string;
    customer_name: string;
    platform: string;
    end_date?: string;
    amount?: number;
    days: number;
}
import { toast } from 'sonner';

interface BatchSendModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: ClientRenewal[];
}

export function BatchSendModal({ isOpen, onClose, clients }: BatchSendModalProps) {
    const [isSending, setIsSending] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [results, setResults] = useState<{ id: string; success: boolean; error?: string }[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const [wantsToCancel, setWantsToCancel] = useState(false);

    const isSendingRef = useRef(false);
    const wantsToCancelRef = useRef(false);
    const currentIndexRef = useRef(0);

    const handleReset = () => {
        setIsSending(false);
        setCountdown(0);
        setResults([]);
        setIsFinished(false);
        setWantsToCancel(false);
        
        isSendingRef.current = false;
        wantsToCancelRef.current = false;
        currentIndexRef.current = 0;
    };

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const startSendingLoop = async () => {
        if (clients.length === 0) return;
        
        setIsSending(true);
        isSendingRef.current = true;
        
        setIsFinished(false);
        setWantsToCancel(false);
        wantsToCancelRef.current = false;
        
        currentIndexRef.current = 0;
        setResults([]);

        for (let i = 0; i < clients.length; i++) {
            if (wantsToCancelRef.current) break;
            
            currentIndexRef.current = i;
            
            const client = clients[i];
            try {
                const days = client.days;
                const payload = {
                    saleId: client.sale_id,
                    customerPhone: client.phone,
                    customerName: client.customer_name,
                    platform: client.platform,
                    expirationDate: client.end_date,
                    amountGs: client.amount,
                    daysRemaining: days,
                    isExpired: days < 0,
                    isToday: days === 0
                };

                const res = await fetch('/api/whatsapp/send-expiry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await res.json();
                setResults(prev => [...prev, { id: client.sale_id, success: data.success, error: data.error }]);
            } catch (err) {
                const error = err as Error;
                setResults(prev => [...prev, { id: client.sale_id, success: false, error: error.message || 'Error de red' }]);
            }

            // If not the last one, and user hasn't cancelled, wait 30 seconds
            if (i < clients.length - 1 && !wantsToCancelRef.current) {
                for (let c = 30; c > 0; c--) {
                    if (wantsToCancelRef.current) break;
                    setCountdown(c);
                    await delay(1000);
                }
                setCountdown(0);
            }
        }
        
        setIsSending(false);
        isSendingRef.current = false;
        setIsFinished(true);

        if (wantsToCancelRef.current) {
            toast.info('Envío masivo cancelado.');
        } else {
            toast.success('Envío masivo completado.');
        }
    };

    const handleClose = () => {
        if (isSending) {
            setWantsToCancel(true);
            wantsToCancelRef.current = true;
        } else {
            handleReset();
            onClose();
        }
    };

    // Calculate progress
    const progress = Math.min(100, (results.length / (clients.length || 1)) * 100);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
            <DialogContent className="sm:max-w-md bg-[#111] border-border text-foreground">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Send className="h-5 w-5 text-[#86EFAC]" />
                        Envío de Avisos Masivos
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {!isSending && !isFinished && (
                        <div className="space-y-4">
                            <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4">
                                <div className="flex gap-3">
                                    <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-orange-400">Atención con el SPAM</p>
                                        <p className="text-xs text-muted-foreground">
                                            Se enviarán <strong>{clients.length}</strong> mensajes de aviso.
                                            Para proteger tus números de bloqueos de WhatsApp, cada mensaje se enviará con una <strong>pausa estricta de 30 segundos</strong> entre cada uno. 
                                            <br /><br />
                                            Tiempo aprox. total: <strong>{Math.ceil((clients.length * 30) / 60)} minutos</strong>. No cierres esta pestaña.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                onClick={startSendingLoop} 
                                className="w-full bg-[#86EFAC] hover:bg-[#86EFAC]/90 text-black font-semibold h-11"
                            >
                                <Send className="mr-2 h-4 w-4" /> Comenzar envío ({clients.length})
                            </Button>
                        </div>
                    )}

                    {(isSending || isFinished) && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-muted-foreground">Progreso</span>
                                    <span className="font-bold text-[#86EFAC]">{results.length} / {clients.length}</span>
                                </div>
                                <Progress value={progress} className="h-2 bg-secondary" indicatorClassName="bg-[#86EFAC]" />
                            </div>

                            {isSending && countdown > 0 && (
                                <div className="flex flex-col items-center justify-center p-6 bg-black/40 rounded-xl border border-border">
                                    <Loader2 className="h-8 w-8 text-[#86EFAC] animate-spin mb-4" />
                                    <p className="text-sm font-medium text-center">Protegiendo cuenta de WhatsApp</p>
                                    <p className="text-2xl font-bold text-foreground mt-2">{countdown}s</p>
                                    <p className="text-xs text-muted-foreground mt-1 text-center">esperando para enviar el sgte. mensaje...</p>
                                </div>
                            )}

                            {isFinished && (
                                <div className="flex flex-col items-center justify-center p-6 bg-[#86EFAC]/10 rounded-xl border border-[#86EFAC]/20">
                                    <CheckCircle2 className="h-8 w-8 text-[#86EFAC] mb-2" />
                                    <p className="font-bold text-[#86EFAC]">¡Envío Finalizado!</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Se enviaron {results.filter(r => r.success).length} exitosos y fallaron {results.filter(r => !r.success).length}.
                                    </p>
                                </div>
                            )}

                            {wantsToCancel && isSending && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-sm text-center font-medium">
                                    Cancelando envío... (espera a que termine la pausa actual)
                                </div>
                            )}

                            <div className="max-h-[160px] overflow-y-auto space-y-2 rounded-md bg-[#0a0a0a] p-3 border border-border text-xs">
                                {results.length === 0 && <p className="text-muted-foreground italic text-center py-4">Iniciando...</p>}
                                {results.map((r, idx) => {
                                    const c = clients[idx];
                                    return (
                                        <div key={r.id} className="flex items-center gap-2 pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                            {r.success ? <CheckCircle2 className="h-3 w-3 text-[#86EFAC]" /> : <XCircle className="h-3 w-3 text-red-500" />}
                                            <span className="truncate flex-1 text-muted-foreground">
                                                <span className="text-foreground font-medium">{c?.customer_name}</span> ({c?.platform})
                                            </span>
                                            {!r.success && <span className="text-red-400/80 truncate max-w-[100px]" title={r.error}>{r.error}</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            <Button 
                                onClick={handleClose} 
                                variant={isFinished ? 'default' : 'destructive'}
                                disabled={wantsToCancel && isSending}
                                className={`w-full ${isFinished ? 'bg-secondary hover:bg-secondary/80 text-foreground' : ''}`}
                            >
                                {isFinished ? 'Cerrar ventana' : 'Cancelar envío restante'}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
