import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/code-requests
 * List pending code requests for admin dashboard
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Verify admin role
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin' && profile?.role !== 'staff') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Auto-expire old pending requests
    await (admin.from('code_requests') as any)
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString());

    // Get all non-expired pending/processing requests, plus recent completed
    const { data: requests, error } = await (admin.from('code_requests') as any)
        .select(`
            *,
            customers:customer_id (full_name, phone)
        `)
        .in('status', ['pending', 'processing', 'completed'])
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('[CodeRequests Admin] Error:', error);
        return NextResponse.json({ error: 'Error al obtener solicitudes' }, { status: 500 });
    }

    return NextResponse.json({ success: true, requests });
}

/**
 * POST /api/admin/code-requests
 * Resolve a code request by providing the verification code
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { request_id?: string; code?: string; action?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { request_id, code, action } = body;

    if (!request_id) {
        return NextResponse.json({ error: 'Falta request_id' }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Verify admin role
    const { data: profile } = await (admin.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'super_admin' && profile?.role !== 'staff') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    if (action === 'fail') {
        // Mark as failed
        const { error: updateError } = await (admin.from('code_requests') as any)
            .update({
                status: 'failed',
                resolved_by: user.id,
                resolved_at: new Date().toISOString(),
                notes: 'Marcado como fallido por admin',
                updated_at: new Date().toISOString(),
            })
            .eq('id', request_id);

        if (updateError) {
            return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Solicitud marcada como fallida' });
    }

    // Default: resolve with code
    if (!code || code.trim().length === 0) {
        return NextResponse.json({ error: 'Falta el código' }, { status: 400 });
    }

    const { error: updateError } = await (admin.from('code_requests') as any)
        .update({
            status: 'completed',
            code: code.trim(),
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', request_id);

    if (updateError) {
        console.error('[CodeRequests Admin] Update error:', updateError);
        return NextResponse.json({ error: 'Error al resolver solicitud' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Código ingresado correctamente' });
}
