'use server';

import { createAdminClient } from '@/lib/supabase/server';

export interface AuditDetails {
    message?: string;
    [key: string]: any;
}

/**
 * Registra una acción en la tabla de auditoría.
 * También crea una notificación genérica para mostrar en la interfaz en tiempo real,
 * la cual escuchará el cliente.
 * 
 * @param action Acción realizada (ej. 'create_sale', 'update_password')
 * @param resourceType Tipo de recurso ('sale', 'mother_account', 'user')
 * @param resourceId ID del recurso afectado
 * @param details Detalles adicionales (JSON extra)
 * @param userId (Opcional) El ID del usuario que originó la acción. Si no se pasa, se usa auth.getUser()
 */
export async function logAction(
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: AuditDetails,
    userId?: string
) {
    const supabase = await createAdminClient();

    let actorId = userId;
    let actorName = 'Sistema';

    if (!actorId) {
        const { data: { user } } = await supabase.auth.getUser();
        actorId = user?.id;
    }

    if (actorId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', actorId)
            .single() as { data: { full_name: string } | null, error: any };
        if (profile?.full_name) {
            actorName = profile.full_name;
        }
    }

    // Insertar en audit_log
    const { error: auditError } = await (supabase.from('audit_log') as any).insert({
        user_id: actorId || null,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        details: details || {},
    });

    if (auditError) {
        console.error('Error recording audit log:', auditError);
    }

    // Insertar en notificaciones SI hay un mensaje amigable (para los toasts)
    // Para que los toasts tengan texto y se propaguen por websocket a los demás
    if (details?.message) {
        await (supabase.from('notifications') as any).insert({
            type: 'audit_event',
            message: `🟢 ${actorName} ${details.message}`,
            related_resource_type: resourceType,
            related_resource_id: resourceId || null,
            // Las notificaciones de auditoría las marcamos para que no saturen 
            // la campanita a menos que se quiera, pero sirven para el toast realtime
            is_read: true, // Automáticamente leídas para no saturar 
            is_resolved: true
        });
    }
}
