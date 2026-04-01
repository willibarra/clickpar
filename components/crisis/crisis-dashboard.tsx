'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Send, Loader2, RefreshCw, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getCrisisSuppliersByPlatform, getCrisisFilteredAccounts, getAffectedSalesByAccounts, bulkSendCrisisMessage, markSalesAsWarrantyClaim, getCrisisSendLogs } from '@/lib/actions/crisis';

const PLATFORMS = ["Spotify", "Netflix", "Disney+", "Amazon Prime", "HBO", "Crunchyroll", "Paramount+", "Star+", "Tidal"];

export function CrisisDashboard() {
    const [suppliers, setSuppliers] = useState<Array<{id: string, name: string}>>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
    const [selectedPlatform, setSelectedPlatform] = useState<string>('Spotify');
    
    // New state for mother accounts
    const [accounts, setAccounts] = useState<Array<{id: string, email: string, supplier_name: string, status: string, max_slots: number}>>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

    const [affectedSales, setAffectedSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    
    const [messageTemplate, setMessageTemplate] = useState(`⚠️ *Aviso Importante sobre tu cuenta de {plataforma}*

Hola {nombre}, te contactamos desde ClickPar.
Actualmente {plataforma} está presentando una caída masiva que afecta a tu cuenta ({email_cliente}).

Para no dejarte sin servicio, te ofrecemos como garantía inmediata el cambio a *Deezer Premium, Tidal o Amazon Music* sin costo adicional. + 1 semana extra. 

Tu fecha de vencimiento de tu {plataforma} es el {vencimiento} si desea la migracion de tus musicas a las plataformas mencionadas responde este mensaje.
( podes averiguar desde google las otras plataformas son muy buenas y no tienen mucho problema como spotify ) 

Si desea esperar 48 horas para solucionar tu {plataforma} favor responder este mensaje. 
Pedimos disculpas por los inconvenientes.`);

    useEffect(() => {
        loadSuppliers();
    }, [selectedPlatform]);

    const fetchLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const data = await getCrisisSendLogs();
            setLogs(data);
        } catch (error) {
            console.error("Error loading crisis logs:", error);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        // Optional: poll every 10 seconds to see background progress
        const interval = setInterval(fetchLogs, 10000);
        return () => clearInterval(interval);
    }, []);

    // Load accounts dynamically when filters change
    useEffect(() => {
        const loadAccounts = async () => {
            if (!selectedPlatform) {
                setAccounts([]);
                setSelectedAccounts([]);
                setAffectedSales([]);
                return;
            }
            setIsLoadingAccounts(true);
            try {
                const data = await getCrisisFilteredAccounts(selectedPlatform, selectedSupplierId);
                setAccounts(data as any);
                // DO NOT pre-select all accounts to prevent UI freeze on huge platforms like Netflix
                setSelectedAccounts([]);
            } catch (error) {
                console.error("Failed to load accounts", error);
            } finally {
                setIsLoadingAccounts(false);
            }
        };

        loadAccounts();
    }, [selectedPlatform, selectedSupplierId]);

    const loadSuppliers = async () => {
        if (!selectedPlatform) {
            setSuppliers([]);
            return;
        }
        try {
            const data = await getCrisisSuppliersByPlatform(selectedPlatform);
            setSuppliers(data as Array<{id: string, name: string}>);
            
            // If currently selected supplier is no longer in the list for this platform, reset to ALL
            if (selectedSupplierId !== 'ALL' && !data.some(s => s.id === selectedSupplierId)) {
                setSelectedSupplierId('ALL');
            }
        } catch (error) {
            console.error("Failed to load suppliers", error);
        }
    };

    const loadAffectedData = async () => {
        if (selectedAccounts.length === 0) {
            toast.error('Atención', { description: 'Selecciona al menos una cuenta madre de la lista.' });
            return;
        }
        setIsLoading(true);
        try {
            const data = await getAffectedSalesByAccounts(selectedAccounts, selectedPlatform);
            setAffectedSales(data);
            toast.success('Datos cargados', { description: `Se encontraron ${data.length} clientes activos afectados.` });
        } catch (error: any) {
            const msg = error?.message || error?.details || JSON.stringify(error) || 'Error desconocido';
            toast.error('Error al cargar clientes', { description: msg });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendBlast = async () => {
        if (affectedSales.length === 0) return;
        setIsSending(true);
        try {
            await bulkSendCrisisMessage(affectedSales, messageTemplate);
            toast.success('Envío en Segundo Plano Iniciado', {
                description: `Se encolaron ${affectedSales.length} clientes. Puedes ver el proceso abajo en el Historial.`
            });
            
            // Refrescar los logs
            fetchLogs();
            
            // Optionally mark them as in warranty claim automatically
            await markSalesAsWarrantyClaim(affectedSales.map(s => s.id));
            toast.success('Estado Actualizado', { description: 'Las ventas se marcaron en estado de reclamo.' });
            
        } catch (error: any) {
            let msg = 'Error desconocido';
            if (typeof error === 'string') msg = error;
            else if (error && typeof error === 'object') {
                if (error.message && typeof error.message === 'string') {
                    // Si el mensaje en sí parece un JSON (pasa a veces con NextJS Server Actions)
                    if (error.message.includes('{') && error.message.includes('code:')) {
                        try {
                            const parsed = JSON.parse(error.message);
                            msg = parsed.message || parsed.details || error.message;
                        } catch(e) { msg = error.message; }
                    } else {
                        msg = error.message;
                    }
                } else {
                    msg = JSON.stringify(error);
                }
            }
            toast.error('Error en envío', { description: msg });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-red-900/50 bg-red-950/10">
                    <CardHeader>
                        <CardTitle className="text-red-500 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Análisis de Impacto
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label>1. Filtrar Plataforma</Label>
                                    <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar plataforma" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PLATFORMS.map(p => (
                                                <SelectItem key={p} value={p}>{p}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label>2. Filtrar Proveedor (Opcional)</Label>
                                    <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Todos los proveedores" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Todos los proveedores</SelectItem>
                                            {suppliers.map(sup => (
                                                <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        
                        {isLoadingAccounts && <div className="text-sm text-muted-foreground animate-pulse">Cargando cuentas...</div>}
                        
                        {accounts.length > 0 && (
                            <div className="flex flex-col gap-2 mt-4">
                                <Label>Cuentas Madre Seleccionadas</Label>
                                <div className="flex justify-between items-center mb-1 text-xs">
                                    <span className="text-muted-foreground">Seleccionadas: {selectedAccounts.length} de {accounts.length}</span>
                                    <div className="space-x-2">
                                        <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setSelectedAccounts(accounts.map(a => a.id))}>Todas</Button>
                                        <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setSelectedAccounts([])}>Ninguna</Button>
                                    </div>
                                </div>
                                <div className="max-h-52 overflow-y-auto border rounded-md p-2 flex flex-col gap-1 bg-background/50">
                                    {accounts.map(acc => {
                                        const isSelected = selectedAccounts.includes(acc.id);
                                        return (
                                            <div 
                                                key={acc.id} 
                                                className={`flex items-center justify-between p-2 rounded-sm text-sm cursor-pointer border ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'}`}
                                                onClick={() => {
                                                    setSelectedAccounts(prev => 
                                                        prev.includes(acc.id) 
                                                            ? prev.filter(id => id !== acc.id)
                                                            : [...prev, acc.id]
                                                    );
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" />
                                                    <span className="truncate">{acc.email}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{acc.supplier_name.split(' ')[0]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <Button onClick={loadAffectedData} disabled={isLoading || selectedAccounts.length === 0} className="w-full mt-2">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Cargar Clientes de estas Cuentas ({selectedAccounts.length})
                        </Button>
                        
                        {affectedSales.length > 0 && (
                            <div className="p-4 bg-background rounded-md border mt-4 border-primary/50">
                                <p className="text-2xl font-bold">{affectedSales.length}</p>
                                <p className="text-sm text-muted-foreground">Clientes de Spotify impactados en estas cuentas.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5 text-blue-500" />
                            Comunicación Masiva (Blast)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Plantilla de Mensaje</Label>
                            <Textarea 
                                className="min-h-[200px] font-mono text-sm" 
                                value={messageTemplate}
                                onChange={(e) => setMessageTemplate(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Variables disponibles: {'{nombre}'}, {'{plataforma}'}, {'{email_cliente}'}, {'{vencimiento}'}</p>
                        </div>
                        
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button className="w-full" disabled={affectedSales.length === 0 || isSending}>
                                    Preparar Envío a {affectedSales.length} clientes
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Confirmar Envío Masivo</DialogTitle>
                                    <DialogDescription>
                                        Estás por enviar un mensaje de WhatsApp a {affectedSales.length} clientes.
                                        Este proceso tomará varios minutos para evitar bloqueos por spam.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                                    {messageTemplate.replace('{nombre}', 'Juan').replace('{plataforma}', 'Spotify').replace('{email_cuenta}', 'cuenta@spotify.com')}
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleSendBlast} disabled={isSending} className="w-full bg-red-600 hover:bg-red-700">
                                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                                        {isSending ? 'Enviando...' : 'Sí, Iniciar Blast'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                    </CardContent>
                </Card>
            </div>

            {affectedSales.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Listado de Afectados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border max-h-[500px] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Teléfono</TableHead>
                                        <TableHead>Cuenta Madre</TableHead>
                                        <TableHead>Perfil</TableHead>
                                        <TableHead>Proveedor</TableHead>
                                        <TableHead>Vencimiento</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {affectedSales.map(sale => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-medium">{sale.customerName || 'N/A'}</TableCell>
                                            <TableCell>{sale.customerPhone}</TableCell>
                                            <TableCell>{sale.accountEmail}</TableCell>
                                            <TableCell>{sale.slotIdentifier}</TableCell>
                                            <TableCell>{sale.supplierName}</TableCell>
                                            <TableCell>{new Date(sale.endDate).toLocaleDateString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Historial de Envíos en Vivo */}
            <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-primary">
                        <Clock className="h-5 w-5" />
                        Historial de Envíos Masivos (Cola en Vivo)
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoadingLogs}>
                        {isLoadingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">Actualizar</span>
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Teléfono</TableHead>
                                    <TableHead>Estado Real</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                            No hay envíos recientes en la cola de crisis para mostrar.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log: any) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs">
                                                {new Date(log.date).toLocaleString('es-PY')}
                                            </TableCell>
                                            <TableCell className="font-medium">{log.customerName}</TableCell>
                                            <TableCell>{log.phone}</TableCell>
                                            <TableCell>
                                                {log.status === 'Sent' ? (
                                                    <span className="inline-flex items-center gap-1 text-green-500 text-xs font-medium">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Enviado
                                                    </span>
                                                ) : log.status === 'PREVENIDO' || log.status.includes('❌') ? (
                                                    <span className="inline-flex items-center gap-1 text-yellow-500 text-xs font-medium">
                                                        <AlertTriangle className="h-3.5 w-3.5" />
                                                        Prevenido: {log.status.replace('PREVENIDO', '')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium" title={log.status}>
                                                        <XCircle className="h-3.5 w-3.5" />
                                                        Error: {log.status.length > 30 ? log.status.substring(0, 30) + "..." : log.status}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
