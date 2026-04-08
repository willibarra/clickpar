import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Send, Info } from 'lucide-react';
interface ClientRenewal {
    sale_id: string;
    customer_id?: string;
    phone: string;
    customer_name: string;
    platform: string;
    end_date?: string;
    amount?: number;
    days: number;
}
import { toast } from 'sonner';
import { queueBulkRenewalNotices } from '@/lib/actions/renewals';

interface BatchSendModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: ClientRenewal[];
}

export function BatchSendModal({ isOpen, onClose, clients }: BatchSendModalProps) {
    const [isPending, startTransition] = useTransition();
    const [isFinished, setIsFinished] = useState(false);

    const handleReset = () => {
        setIsFinished(false);
    };

    const startQueueing = () => {
        if (clients.length === 0) return;
        
        startTransition(async () => {
            const result = await queueBulkRenewalNotices(clients);
            if (result.success) {
                toast.success(`Se encolaron ${result.queued} mensajes.`);
                setIsFinished(true);
            } else {
                toast.error('Error al encolar', { description: result.error });
            }
        });
    };

    const handleClose = () => {
        if (!isPending) {
            handleReset();
            onClose();
        }
    };

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
                    {!isFinished && (
                        <div className="space-y-4">
                            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
                                <div className="flex gap-3">
                                    <Info className="h-5 w-5 text-blue-400 shrink-0" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-blue-400">Envío en Segundo Plano</p>
                                        <p className="text-xs text-muted-foreground">
                                            Al confirmar, <strong>{clients.length}</strong> mensajes de aviso se encolarán en la base de datos de manera instantánea.
                                            <br /><br />
                                            Para proteger tu número de WhatsApp de bloqueos por SPAM, el servidor enviará los mensajes poco a poco en segundo plano de manera automática. <strong>Puedes cerrar la página una vez confirmes.</strong>
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                onClick={startQueueing} 
                                disabled={isPending}
                                className="w-full bg-[#86EFAC] hover:bg-[#86EFAC]/90 text-black font-semibold h-11"
                            >
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} 
                                {isPending ? 'Encolando Mensajes...' : `Encolar Mensajes (${clients.length})`}
                            </Button>
                        </div>
                    )}

                    {isFinished && (
                        <div className="space-y-6">
                            <div className="flex flex-col items-center justify-center p-6 bg-[#86EFAC]/10 rounded-xl border border-[#86EFAC]/20">
                                <CheckCircle2 className="h-8 w-8 text-[#86EFAC] mb-2" />
                                <p className="font-bold text-[#86EFAC]">¡Mensajes Encolados!</p>
                                <p className="text-sm text-center text-muted-foreground mt-3">
                                    Los mensajes se enviarán automáticamente en lotes.<br />
                                    Ya no es necesario que mantengas esta página abierta.
                                </p>
                            </div>

                            <Button 
                                onClick={handleClose} 
                                className="w-full bg-secondary hover:bg-secondary/80 text-foreground"
                            >
                                Cerrar ventana
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
