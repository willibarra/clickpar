'use client';

import { useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings as SettingsIcon, User, Bell, Shield, Save, Loader2, ChevronDown, MessageSquare, Mail, Package, Users as UsersIcon, Monitor, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserManagementPanel } from '@/components/settings/user-management-panel';
import { StaffManagementPanel } from '@/components/settings/staff-management-panel';
import { StockAlertSettings } from '@/components/settings/stock-alert-settings';
import { EmailSettingsPanel } from '@/components/settings/email-settings-panel';
import { WhatsAppSettingsPanel } from '@/components/settings/whatsapp-settings-panel';

// ==========================================
// Collapsible Section Component
// ==========================================
function CollapsibleSection({
    icon,
    iconColor = 'text-[#86EFAC]',
    title,
    description,
    children,
    defaultOpen = false,
}: {
    icon: ReactNode;
    iconColor?: string;
    title: string;
    description?: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <Card className="border-border bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className={iconColor}>{icon}</div>
                    <div>
                        <h3 className="font-semibold text-foreground">{title}</h3>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                className={`transition-all duration-300 ease-in-out ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                    }`}
            >
                <div className="border-t border-border">
                    {children}
                </div>
            </div>
        </Card>
    );
}

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
    const isSuperAdmin = profile?.role === 'super_admin';

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
        <div className="space-y-4">
            {/* Header */}
            <div className="mb-2">
                <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
                <p className="text-muted-foreground">Administra tu cuenta y preferencias</p>
            </div>

            {/* 1. Perfil de Usuario */}
            <CollapsibleSection
                icon={<User className="h-5 w-5" />}
                title="Perfil de Usuario"
                description="Actualiza tu información personal"
                defaultOpen={true}
            >
                <CardContent className="space-y-4 pt-4">
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
            </CollapsibleSection>

            {/* 2. Seguridad */}
            <CollapsibleSection
                icon={<Shield className="h-5 w-5" />}
                title="Seguridad"
                description="Email, contraseña y sesión"
            >
                <CardContent className="space-y-3 pt-4">
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
            </CollapsibleSection>

            {/* 3. Gestión de Usuarios (Admin) */}
            {isAdmin && (
                <CollapsibleSection
                    icon={<UsersIcon className="h-5 w-5" />}
                    title="Gestión de Usuarios"
                    description="Administrar cuentas de staff y clientes"
                >
                    <div className="p-0">
                        <UserManagementPanel />
                    </div>
                </CollapsibleSection>
            )}

            {/* 3b. Equipo (Super Admin only) */}
            {isSuperAdmin && (
                <CollapsibleSection
                    icon={<Shield className="h-5 w-5" />}
                    iconColor="text-yellow-400"
                    title="Equipo de Trabajo"
                    description="Crear y gestionar vendedoras y staff"
                >
                    <div className="p-0">
                        <StaffManagementPanel />
                    </div>
                </CollapsibleSection>
            )}

            {/* 4. Alertas de Stock (Admin) */}
            {isAdmin && (
                <CollapsibleSection
                    icon={<Package className="h-5 w-5" />}
                    iconColor="text-[#F97316]"
                    title="Alertas de Stock"
                    description="Configurar notificaciones de inventario bajo"
                >
                    <div className="p-0">
                        <StockAlertSettings />
                    </div>
                </CollapsibleSection>
            )}

            {/* 5. Configuración de Email (Admin) */}
            {isAdmin && (
                <CollapsibleSection
                    icon={<Mail className="h-5 w-5" />}
                    title="Configuración de Email"
                    description="Cuenta de correo para notificaciones"
                >
                    <div className="p-0">
                        <EmailSettingsPanel />
                    </div>
                </CollapsibleSection>
            )}

            {/* 6. WhatsApp */}
            <CollapsibleSection
                icon={<MessageSquare className="h-5 w-5" />}
                title="WhatsApp"
                description="Instancias, plantillas y envío automático"
            >
                <div className="p-0">
                    <WhatsAppSettingsPanel />
                </div>
            </CollapsibleSection>

            {/* 7. Plataformas Disponibles */}
            <CollapsibleSection
                icon={<Monitor className="h-5 w-5" />}
                title="Plataformas Disponibles"
                description="Plataformas de streaming en el inventario"
            >
                <CardContent className="pt-4">
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
            </CollapsibleSection>

            {/* 8. Información del Sistema */}
            <CollapsibleSection
                icon={<Info className="h-5 w-5" />}
                iconColor="text-muted-foreground"
                title="Información del Sistema"
                description="Versiones y tecnologías"
            >
                <CardContent className="pt-4">
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
            </CollapsibleSection>
        </div>
    );
}
