'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, AlertTriangle, Info, Check, Loader2, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    markAsRead,
    markAllAsRead,
    resolvePasswordAlert,
    type Notification,
} from '@/lib/actions/notifications';

interface Props {
    notifications: Notification[];
}

export function NotificationsListView({ notifications: initial }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [notifications, setNotifications] = useState(initial);
    const [filter, setFilter] = useState<'all' | 'unread' | 'security'>('all');

    // Resolve modal
    const [resolveModal, setResolveModal] = useState(false);
    const [resolveNotif, setResolveNotif] = useState<Notification | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [showPass, setShowPass] = useState(false);

    const filtered = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        if (filter === 'security') return n.type === 'security_password_rotation';
        return true;
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;
    const securityCount = notifications.filter(n => n.type === 'security_password_rotation' && !n.is_resolved).length;

    function handleMarkAllRead() {
        startTransition(async () => {
            await markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        });
    }

    function handleRead(id: string) {
        startTransition(async () => {
            await markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        });
    }

    function handleResolve(notif: Notification) {
        setResolveNotif(notif);
        setNewPassword('');
        setShowPass(false);
        setResolveModal(true);
    }

    function handleResolveSubmit() {
        if (!resolveNotif || !newPassword) return;
        startTransition(async () => {
            const result = await resolvePasswordAlert(
                resolveNotif.id,
                resolveNotif.related_resource_id!,
                newPassword
            );
            if (result.success) {
                setResolveModal(false);
                setNotifications(prev => prev.map(n =>
                    n.id === resolveNotif.id ? { ...n, is_resolved: true, is_read: true } : n
                ));
                router.refresh();
            }
        });
    }

    function getNotifIcon(type: string) {
        if (type === 'security_password_rotation') return <Shield className="h-5 w-5 text-red-400" />;
        if (type === 'warning') return <AlertTriangle className="h-5 w-5 text-orange-400" />;
        return <Info className="h-5 w-5 text-blue-400" />;
    }

    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleString('es-PY', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    const filterButtons: { key: 'all' | 'unread' | 'security'; label: string; count?: number }[] = [
        { key: 'all', label: 'Todas' },
        { key: 'unread', label: 'Sin leer', count: unreadCount },
        { key: 'security', label: '🔒 Seguridad', count: securityCount },
    ];

    return (
        <>
            {/* Filters + Actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {filterButtons.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f.key
                                    ? 'bg-[#86EFAC] text-black'
                                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {f.label}{f.count ? ` (${f.count})` : ''}
                        </button>
                    ))}
                </div>
                {unreadCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="text-xs">
                        <Check className="h-3 w-3 mr-1" /> Marcar todo leído
                    </Button>
                )}
            </div>

            {/* List */}
            <div className="space-y-2">
                {filtered.length === 0 && (
                    <div className="rounded-xl border border-border bg-[#1a1a1a] py-16 text-center text-muted-foreground">
                        Sin notificaciones en este filtro
                    </div>
                )}
                {filtered.map(notif => (
                    <div
                        key={notif.id}
                        className={`rounded-xl border p-4 transition-colors ${!notif.is_read
                                ? 'border-[#86EFAC]/30 bg-[#86EFAC]/5'
                                : 'border-border bg-[#1a1a1a]'
                            }`}
                    >
                        <div className="flex gap-3">
                            <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm ${!notif.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                    {notif.message}
                                </p>
                                <p className="text-[11px] text-muted-foreground/60 mt-1">
                                    {formatDate(notif.created_at)}
                                </p>
                                <div className="flex items-center gap-3 mt-3">
                                    {!notif.is_read && (
                                        <button
                                            onClick={() => handleRead(notif.id)}
                                            className="text-xs text-[#86EFAC] hover:underline"
                                        >
                                            Marcar leído
                                        </button>
                                    )}
                                    {notif.type === 'security_password_rotation' && !notif.is_resolved && (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleResolve(notif)}
                                            className="h-7 text-xs gap-1"
                                        >
                                            <Shield className="h-3 w-3" />
                                            Resolver — Cambiar Contraseña
                                        </Button>
                                    )}
                                    {notif.is_resolved && (
                                        <span className="text-xs text-green-400 flex items-center gap-1">
                                            <Check className="h-3 w-3" /> Resuelto
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Resolve Modal */}
            <Dialog open={resolveModal} onOpenChange={setResolveModal}>
                <DialogContent className="bg-card border-border sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-400">
                            <Shield className="h-5 w-5" />
                            Cambiar Contraseña de Cuenta
                        </DialogTitle>
                        <DialogDescription>
                            {resolveNotif?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                            ⚠️ Cambia la contraseña para proteger a los usuarios activos.
                        </div>
                        <div className="space-y-2">
                            <Label>Nueva Contraseña</Label>
                            <div className="relative">
                                <Input
                                    type={showPass ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Nueva contraseña"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                                >
                                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResolveModal(false)}>Cancelar</Button>
                        <Button
                            onClick={handleResolveSubmit}
                            disabled={isPending || !newPassword}
                            className="bg-red-500 hover:bg-red-600 text-white gap-2"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                            Guardar y Resolver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
