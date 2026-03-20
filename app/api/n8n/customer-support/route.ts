import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';


const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const N8N_SECRET = process.env.N8N_SECRET || 'clickpar-n8n-2024';

/**
 * POST /api/n8n/customer-support
 *
 * Called by N8N when the AI detects that a customer is reporting a problem.
 * Returns the customer's portal URL and a context message for the AI to use.
 *
 * Body: { phone: string, problem_description?: string }
 */
export async function POST(request: NextRequest) {
    // Verify N8N secret
    const secret = request.headers.get('x-n8n-secret');
    if (secret !== N8N_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { phone } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
        }

        // Normalize phone
        const normalizedPhone = phone.replace(/\D/g, '').replace(/^595/, '').replace(/^0/, '');
        const phoneVariants = [
            `595${normalizedPhone}`,
            `0${normalizedPhone}`,
            normalizedPhone,
        ];

        // Find customer
        const { data: customer } = await (supabase as any)
            .from('customers')
            .select('id, full_name, phone, portal_password')
            .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
            .limit(1)
            .single();

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clickpar.shop';
        const portalUrl = `${baseUrl}/portal`;

        if (!customer) {
            return NextResponse.json({
                found: false,
                support_message: `Por favor ingresá a nuestro portal de soporte: ${portalUrl}`,
                portal_url: portalUrl,
            });
        }

        const c = customer as any;

        // Get their active sales to give context of what they might be having trouble with
        const { data: sales } = await (supabase as any)
            .from('sales')
            .select(`
                id,
                sale_slots:slot_id (
                    slot_identifier,
                    mother_accounts:mother_account_id (
                        platform
                    )
                )
            `)
            .eq('customer_id', c.id)
            .eq('is_active', true);

        const platforms = (sales || []).map((s: any) =>
            s.sale_slots?.mother_accounts?.platform || 'tu servicio'
        ).filter(Boolean);

        const uniquePlatforms = [...new Set(platforms)];

        // Build platform-specific deep link for the support card
        const firstPlatform = platforms[0] ? encodeURIComponent(platforms[0]) : null;
        const supportUrl = firstPlatform
            ? `${baseUrl}/portal/soporte?platform=${firstPlatform}`
            : `${baseUrl}/portal/soporte`;

        return NextResponse.json({
            found: true,
            customer: {
                id: c.id,
                name: c.full_name || 'Cliente',
                phone: c.phone,
                portal_url: `${baseUrl}/portal`,
                support_url: supportUrl,
            },
            active_platforms: uniquePlatforms,
            support_context: {
                portal_url: `${baseUrl}/portal`,
                support_url: supportUrl,
                portal_phone_login: c.phone,
                message_template: `Hola ${c.full_name || 'Cliente'}! 👋 Para resolver tu problema con ${uniquePlatforms[0] || 'tu servicio'}, ingresá a tu portal de clientes donde vas a encontrar los pasos exactos:\n\n🔗 ${supportUrl}\n\n📱 Tu usuario es tu número de WhatsApp: *${c.phone}*\n\n¿Podés ingresar? Ahí vas a ver cómo solucionar el problema con tu ${uniquePlatforms[0] || 'servicio'}. 🚀`,
            },
        });


    } catch (error: any) {
        console.error('[N8N Customer Support] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
