// Tipos de roles disponibles
export type UserRole = 'super_admin' | 'staff' | 'customer' | 'affiliate' | 'vendedor' | 'proveedor';

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
    vendedor: {
        'inventory.view': true, 'inventory.edit': false, 'inventory.create': false, 'inventory.delete': false,
        'sales.view': true, 'sales.create': true,
        'customers.view': true, 'customers.edit': false,
        'finance.view': false,
        'renewals.view': true, 'renewals.manage': false,
        'emails.view': true,
        'settings.view': false, 'settings.manage': false,
    },
    customer: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    affiliate: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
    proveedor: Object.fromEntries(Object.keys(AVAILABLE_PERMISSIONS).map(k => [k, false])),
};
