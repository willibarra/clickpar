'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, Shield, AlertTriangle, Info, Eye, EyeOff, Loader2, ExternalLink, Sparkles } from 'lucide-react';
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

    const [resolveModal, setResolveModal] = useState(false);
    const [resolveNotif, setResolveNotif] = useState<Notification | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [showPass, setShowPass] = useState(false);

    useEffect(() => {
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
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
            setNotifications(data.slice(0, 10));
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

    function getNotifClass(type: string): string {
        if (type === 'security_password_rotation') return 'notif-security';
        if (type === 'warning') return 'notif-warning';
        return 'notif-info';
    }

    function getNotifIcon(type: string) {
        if (type === 'security_password_rotation') return (
            <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Shield className="h-4 w-4 text-red-400" />
            </div>
        );
        if (type === 'warning') return (
            <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.3)' }}>
                <AlertTriangle className="h-4 w-4" style={{ color: '#e879f9' }} />
            </div>
        );
        return (
            <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <Info className="h-4 w-4 text-blue-400" />
            </div>
        );
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
                    className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200"
                    style={{
                        background: open
                            ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(59,130,246,0.15))'
                            : 'rgba(168,85,247,0.08)',
                        border: '1px solid rgba(168,85,247,0.2)',
                    }}
                >
                    <Bell
                        className="h-5 w-5 transition-colors"
                        style={{ color: open ? '#a855f7' : '#8b8ba7' }}
                    />
                    {unreadCount > 0 && (
                        <span
                            className="absolute -right-0.5 -top-0.5 badge-glow flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* Dropdown */}
                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div
                            className="absolute right-0 top-12 z-50 w-[400px] rounded-2xl overflow-hidden shadow-2xl"
                            style={{
                                background: 'rgba(11, 11, 20, 0.92)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(168,85,247,0.25)',
                                boxShadow: '0 20px 60px rgba(168,85,247,0.15), 0 0 0 1px rgba(168,85,247,0.1)',
                            }}
                        >
                            {/* Header */}
                            <div
                                className="flex items-center justify-between px-5 py-4"
                                style={{
                                    borderBottom: '1px solid rgba(168,85,247,0.15)',
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(59,130,246,0.05))',
                                }}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Sparkles className="h-4 w-4" style={{ color: '#a855f7' }} />
                                    <h3 className="font-semibold text-white">Notificaciones</h3>
                                    {unreadCount > 0 && (
                                        <span
                                            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                                            style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)' }}
                                        >
                                            {unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                                            style={{
                                                color: '#a855f7',
                                                background: 'rgba(168,85,247,0.10)',
                                                border: '1px solid rgba(168,85,247,0.2)',
                                            }}
                                        >
                                            <Check className="h-3 w-3" />
                                            Todo leído
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setOpen(false)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8b8ba7] hover:text-white transition-colors"
                                        style={{ background: 'rgba(255,255,255,0.05)' }}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Notifications List */}
                            <div className="max-h-[420px] overflow-y-auto">
                                {loading && (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#a855f7' }} />
                                            <span className="text-xs text-[#8b8ba7]">Cargando...</span>
                                        </div>
                                    </div>
                                )}

                                {!loading && notifications.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                                        <div
                                            className="flex h-12 w-12 items-center justify-center rounded-full"
                                            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}
                                        >
                                            <Bell className="h-5 w-5" style={{ color: '#a855f7' }} />
                                        </div>
                                        <p className="text-sm text-[#8b8ba7]">Sin notificaciones</p>
                                    </div>
                                )}

                                {!loading && notifications.map((notif, i) => (
                                    <div
                                        key={notif.id}
                                        className={`notif-item p-4 transition-all cursor-default ${getNotifClass(notif.type)} ${!notif.is_read ? 'notif-unread' : ''}`}
                                        style={{
                                            animationDelay: `${i * 40}ms`,
                                            borderBottom: '1px solid rgba(168,85,247,0.08)',
                                        }}
                                    >
                                        <div className="flex gap-3 items-start">
                                            <div className="mt-0.5 shrink-0">{getNotifIcon(notif.type)}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-relaxed ${!notif.is_read ? 'font-medium text-white' : 'text-[#8b8ba7]'}`}>
                                                    {notif.message}
                                                </p>
                                                <p className="text-[11px] mt-1" style={{ color: 'rgba(139,139,167,0.7)' }}>
                                                    {timeAgo(notif.created_at)}
                                                </p>
                                                <div className="flex gap-2 mt-2 flex-wrap">
                                                    {!notif.is_read && (
                                                        <button
                                                            onClick={() => handleRead(notif.id)}
                                                            className="text-[11px] font-medium transition-colors px-2 py-0.5 rounded-md"
                                                            style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)' }}
                                                        >
                                                            Marcar leído
                                                        </button>
                                                    )}
                                                    {notif.type === 'security_password_rotation' && !notif.is_resolved && (
                                                        <button
                                                            onClick={() => handleResolve(notif)}
                                                            className="text-[11px] font-medium transition-colors px-2 py-0.5 rounded-md"
                                                            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
                                                        >
                                                            🔒 Cambiar contraseña
                                                        </button>
                                                    )}
                                                    {notif.is_resolved && (
                                                        <span
                                                            className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                                                            style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)' }}
                                                        >
                                                            ✓ Resuelto
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div
                                className="px-5 py-3"
                                style={{
                                    borderTop: '1px solid rgba(168,85,247,0.15)',
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.05), rgba(59,130,246,0.03))',
                                }}
                            >
                                <Link
                                    href="/notifications"
                                    onClick={() => setOpen(false)}
                                    className="flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
                                    style={{ color: '#a855f7' }}
                                >
                                    Ver todas las notificaciones
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ─── RESOLVE PASSWORD MODAL ─── */}
            <Dialog open={resolveModal} onOpenChange={setResolveModal}>
                <DialogContent className="sm:max-w-[440px]" style={{ background: 'rgba(11,11,20,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-400">
                            <Shield className="h-5 w-5" />
                            Cambiar Contraseña de Cuenta
                        </DialogTitle>
                        <DialogDescription className="text-[#8b8ba7]">
                            {resolveNotif?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            ⚠️ Un usuario dejó de pagar. Cambia la contraseña para proteger a los demás usuarios activos.
                        </div>
                        <div className="space-y-2">
                            <Label className="text-white">Nueva Contraseña</Label>
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
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b8ba7] hover:text-white p-1"
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
