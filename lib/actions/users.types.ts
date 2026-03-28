// Tipos de roles disponibles (deben coincidir con el enum user_role de la DB)
export type UserRole = 'super_admin' | 'staff' | 'customer' | 'affiliate' | 'reseller';

export interface UserProfile {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    role: UserRole;
    avatar_url: string | null;
    created_at: string;
    email?: string;
    permissions?: Record<string, boolean>;
}

// Permisos disponibles en el sistema
export const AVAILABLE_PERMISSIONS = {
    'inventory.view': 'Ver Inventario',
    'inventory.edit': 'Editar Inventario',
    'inventory.create': 'Crear Cuentas',
    'inventory.delete': 'Eliminar Cuentas',
    'sales.view': 'Ver Ventas',
    'sales.create': 'Crear Ventas',
    'customers.view': 'Ver Clientes',
    'customers.edit': 'Editar Clientes',
    'finance.view': 'Ver Finanzas',
    'renewals.view': 'Ver Renovaciones',
    'renewals.manage': 'Gestionar Renovaciones',
    'emails.view': 'Ver Correos',
    'settings.view': 'Ver Ajustes',
    'settings.manage': 'Gestionar Ajustes',
} as const;

// Permisos por defecto según el rol
export const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
    super_admin: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, true])),
    staff: {
        'inventory.view': true, 'inventory.edit': true, 'inventory.create': true, 'inventory.delete': false,
        'sales.view': true, 'sales.create': true,
        'customers.view': true, 'customers.edit': true,
        'finance.view': false,
        'renewals.view': true, 'renewals.manage': true,
        'emails.view': true,
        'settings.view': false, 'settings.manage': false,
    },
    customer: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    affiliate: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    reseller: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
};
