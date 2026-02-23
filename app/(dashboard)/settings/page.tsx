'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings as SettingsIcon, User, Bell, Shield, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserManagementPanel } from '@/components/settings/user-management-panel';
import { StockAlertSettings } from '@/components/settings/stock-alert-settings';
import { EmailSettingsPanel } from '@/components/settings/email-settings-panel';

export default function SettingsPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                setProfile(profile);
                setFullName((profile as any)?.full_name || '');
                setPhoneNumber((profile as any)?.phone_number || '');
            }
            setLoading(false);
        };

        fetchUserData();
    }, [supabase]);

    const handleSaveProfile = async () => {
        if (!user) return;
        setSaving(true);
        setMessage(null);

        const { error } = await (supabase
            .from('profiles') as any)
            .update({
                full_name: fullName,
                phone_number: phoneNumber,
            })
            .eq('id', user.id);

        if (error) {
            setMessage({ type: 'error', text: 'Error al guardar: ' + error.message });
        } else {
            setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
        }
        setSaving(false);
    };

    const roleLabels: Record<string, string> = {
        super_admin: 'Super Administrador',
        staff: 'Staff / Vendedor',
        customer: 'Cliente',
        affiliate: 'Afiliado',
        vendedor: 'Vendedor',
        proveedor: 'Proveedor',
    };

    const isAdmin = profile?.role === 'super_admin' || profile?.role === 'staff' || !profile?.role;

    const initials = fullName
        ?.split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'XX';

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
                <p className="text-muted-foreground">Administra tu cuenta y preferencias</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Profile Card */}
                <Card className="border-border bg-card lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <User className="h-5 w-5 text-[#86EFAC]" />
                            <CardTitle>Perfil de Usuario</CardTitle>
                        </div>
                        <CardDescription>Actualiza tu información personal</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {message && (
                            <div className={`rounded-lg p-3 text-sm ${message.type === 'success'
                                ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                : 'bg-red-500/20 text-red-500'
                                }`}>
                                {message.text}
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarFallback className="bg-[#86EFAC] text-black text-lg">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-medium text-foreground">{user?.email}</p>
                                <span className="inline-block mt-1 rounded-full bg-[#F97316]/20 px-2 py-0.5 text-xs font-medium text-[#F97316]">
                                    {roleLabels[profile?.role] || profile?.role}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Nombre completo
                                </label>
                                <Input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Tu nombre completo"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Teléfono (WhatsApp)
                                </label>
                                <Input
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="+595 9XX XXX XXX"
                                />
                            </div>
                        </div>

                        <Button
                            onClick={handleSaveProfile}
                            className="bg-[#86EFAC] text-black hover:bg-[#86EFAC]/90"
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar Cambios
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Account Info */}
                <div className="space-y-6">
                    <Card className="border-border bg-card">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-[#86EFAC]" />
                                <CardTitle className="text-base">Seguridad</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-medium text-foreground">{user?.email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Última conexión</p>
                                <p className="text-sm text-foreground">
                                    {user?.last_sign_in_at
                                        ? new Date(user.last_sign_in_at).toLocaleString('es-PY')
                                        : 'N/A'}
                                </p>
                            </div>
                            <Button variant="outline" className="w-full mt-2">
                                Cambiar Contraseña
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-border bg-card">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Bell className="h-5 w-5 text-[#F97316]" />
                                <CardTitle className="text-base">Notificaciones</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Las notificaciones de WhatsApp se enviarán al número de teléfono registrado.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* User Management - Only for Admins */}
            {isAdmin && (
                <UserManagementPanel />
            )}

            {/* Stock Alert Settings - Only for Admins */}
            {isAdmin && (
                <StockAlertSettings />
            )}

            {/* Email Settings - Only for Admins */}
            {isAdmin && (
                <EmailSettingsPanel />
            )}

            {/* Platforms Management */}
            <Card className="border-border bg-card">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <SettingsIcon className="h-5 w-5 text-[#86EFAC]" />
                            <CardTitle>Plataformas Disponibles</CardTitle>
                        </div>
                    </div>
                    <CardDescription>
                        Estas son las plataformas de streaming que puedes agregar en el inventario
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {['Netflix', 'Spotify', 'HBO', 'Disney+', 'Amazon Prime', 'YouTube Premium', 'Apple TV+', 'Crunchyroll', 'Paramount+', 'Star+'].map((platform) => (
                            <div
                                key={platform}
                                className="rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground"
                            >
                                {platform}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        Para agregar nuevas plataformas, edita el archivo{' '}
                        <code className="bg-muted px-1 rounded">components/inventory/add-account-modal.tsx</code>
                    </p>
                </CardContent>
            </Card>

            {/* Platform Info */}
            <Card className="border-border bg-card">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5 text-muted-foreground" />
                        <CardTitle>Información del Sistema</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Versión</p>
                            <p className="font-medium text-foreground">ClickPar v1.0.0</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Framework</p>
                            <p className="font-medium text-foreground">Next.js 16</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Base de Datos</p>
                            <p className="font-medium text-foreground">Supabase (Self-hosted)</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">UI</p>
                            <p className="font-medium text-foreground">Shadcn/ui + Tailwind</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
