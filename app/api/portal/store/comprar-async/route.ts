import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveCustomer } from '@/lib/utils/resolve-customer';

export const dynamic = 'force-dynamic';

function generateRandomEmail(customerName: string): string {
    const randomSuffix = Math.floor(Math.random() * 10000);
    const cleanName = customerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return `${cleanName}${randomSuffix}@clickpar.shop`;
}

function generateRandomPassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { account_id, is_full_account, activation_type, email, password } = body;

    if (!account_id || !activation_type) {
        return NextResponse.json({ error: 'Faltan parámetros requeridos (account_id, activation_type)' }, { status: 400 });
    }

    const admin = await createAdminClient();
    const customer = await resolveCustomer(admin, user.id, user.email);
    
    if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    let finalEmail = email;
    let finalPassword = password;

    if (activation_type === 'new_email') {
        finalEmail = generateRandomEmail(customer.full_name || 'user');
        finalPassword = generateRandomPassword();
    } else if (activation_type === 'own_email') {
        if (!email || !password) {
            return NextResponse.json({ error: 'Faltan credenciales para correo propio' }, { status: 400 });
        }
    } else {
        return NextResponse.json({ error: 'Tipo de activación inválido' }, { status: 400 });
    }

    // Call async RPC
    const { data: result, error: rpcError } = await (admin.rpc as any)('purchase_async_from_store', {
        p_customer_id: customer.id,
        p_account_id: account_id,
        p_user_id: user.id,
        p_activation_type: activation_type,
        p_email: finalEmail,
        p_password: finalPassword,
        p_is_full_account: Boolean(is_full_account),
    });

    if (rpcError) {
        console.error('[Store/ComprarAsync] RPC error:', rpcError);
        return NextResponse.json({ error: 'Error al procesar la compra asíncrona. Intentá nuevamente.' }, { status: 500 });
    }

    const rpcResult = result as any;

    if (!rpcResult?.success) {
        const errorMsg = rpcResult?.code === 'INSUFFICIENT_BALANCE'
            ? `Saldo insuficiente. Necesitás Gs. ${(rpcResult.required ?? 0).toLocaleString('es-PY')}.`
            : rpcResult?.error || 'Error desconocido';
        return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    return NextResponse.json({
        success: true,
        message: 'Tu solicitud fue recibida. Activaremos la cuenta en breve.',
        saleId: rpcResult.sale_id,
        email: finalEmail,
        password: finalPassword,
    });
}
