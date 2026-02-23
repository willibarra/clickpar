'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, Shield, AlertTriangle, Info, Eye, EyeOff, Loader2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    resolvePasswordAlert,
    type Notification,
} from '@/lib/actions/notifications';
import Link from 'next/link';

export function NotificationBell() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);

    // Resolve modal state
    const [resolveModal, setResolveModal] = useState(false);
    const [resolveNotif, setResolveNotif] = useState<Notification | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [showPass, setShowPass] = useState(false);

    // Fetch unread count on mount + interval
    useEffect(() => {
        fetchCount();
        const interval = setInterval(fetchCount, 30000); // Every 30s
        return () => clearInterval(interval);
    }, []);

    async function fetchCount() {
        try {
            const count = await getUnreadCount();
            setUnreadCount(count);
        } catch { }
    }

    async function fetchNotifications() {
        setLoading(true);
        try {
            const data = await getNotifications();
            setNotifications(data.slice(0, 10)); // Show last 10
            setUnreadCount(data.filter(n => !n.is_read).length);
        } catch { }
        setLoading(false);
    }

    function handleOpen() {
        setOpen(!open);
        if (!open) fetchNotifications();
    }

    function handleMarkAllRead() {
        startTransition(async () => {
            await markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        });
    }

    function handleRead(id: string) {
        startTransition(async () => {
            await markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        });
    }

    function handleResolve(notif: Notification) {
        setResolveNotif(notif);
        setNewPassword('');
        setShowPass(false);
        setResolveModal(true);
        setOpen(false);
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
                setUnreadCount(prev => Math.max(0, prev - 1));
                router.refresh();
            }
        });
    }

    function getNotifIcon(type: string) {
        if (type === 'security_password_rotation') return <Shield className="h-4 w-4 text-red-400" />;
        if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-orange-400" />;
        return <Info className="h-4 w-4 text-blue-400" />;
    }

    function timeAgo(dateStr: string) {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 60) return `Hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `Hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `Hace ${days}d`;
    }

    return (
        <>
            {/* Bell Button */}
            <div className="relative">
                <button
                    onClick={handleOpen}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* Dropdown */}
                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div className="absolute right-0 top-12 z-50 w-[380px] rounded-xl border border-border bg-card shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-border p-4">
                                <h3 className="font-semibold text-foreground">Notificaciones</h3>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            className="rounded px-2 py-1 text-xs text-[#86EFAC] hover:bg-[#86EFAC]/10 transition-colors"
                                        >
                                            Marcar todo leído
                                        </button>
                                    )}
                                    <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Notifications List */}
                            <div className="max-h-[400px] overflow-y-auto">
                                {loading && (
                                    <div className="py-8 text-center text-muted-foreground">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                                    </div>
                                )}
                                {!loading && notifications.length === 0 && (
                                    <div className="py-8 text-center text-muted-foreground text-sm">
                                        Sin notificaciones
                                    </div>
                                )}
                                {!loading && notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        className={`border-b border-border/50 p-3 transition-colors hover:bg-secondary/50 ${!notif.is_read ? 'bg-[#86EFAC]/5' : ''
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notif.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                    {notif.message}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(notif.created_at)}</p>
                                                <div className="flex gap-2 mt-2">
                                                    {!notif.is_read && (
                                                        <button
                                                            onClick={() => handleRead(notif.id)}
                                                            className="text-[10px] text-[#86EFAC] hover:underline"
                                                        >
                                                            Marcar leído
                                                        </button>
                                                    )}
                                                    {notif.type === 'security_password_rotation' && !notif.is_resolved && (
                                                        <button
                                                            onClick={() => handleResolve(notif)}
                                                            className="text-[10px] text-red-400 hover:underline font-medium"
                                                        >
                                                            🔒 Resolver (Cambiar Contraseña)
                                                        </button>
                                                    )}
                                                    {notif.is_resolved && (
                                                        <span className="text-[10px] text-green-400">✅ Resuelto</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="border-t border-border p-3">
                                <Link
                                    href="/notifications"
                                    onClick={() => setOpen(false)}
                                    className="flex items-center justify-center gap-1 text-xs text-[#86EFAC] hover:underline"
                                >
                                    Ver todas <ExternalLink className="h-3 w-3" />
                                </Link>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ─── RESOLVE PASSWORD MODAL ─── */}
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
                            ⚠️ Un usuario dejó de pagar. Cambia la contraseña para proteger a los demás usuarios activos.
                        </div>
                        <div className="space-y-2">
                            <Label>Nueva Contraseña</Label>
                            <div className="relative">
                                <Input
                                    type={showPass ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Nueva contraseña de la cuenta"
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
