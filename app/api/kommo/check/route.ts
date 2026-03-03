import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/utils/phone';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kommo/check
 * Check customer status: active subscriptions, problems, etc.
 * Body: { customerPhone }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { customerPhone } = body;

        if (!customerPhone) {
            return NextResponse.json({ error: 'Se requiere teléfono del cliente' }, { status: 400 });
        }

        // 1. Find customer
        const { data: customer } = await supabase
            .from('customers' as any)
            .select('id, full_name, phone, notes')
            .eq('phone', normalizePhone(customerPhone))
            .single();

        if (!customer) {
            return NextResponse.json({
                found: false,
                message: 'Cliente no encontrado en el sistema. Es un cliente nuevo.',
            });
        }

        const customerData = customer as any;

        // 2. Get active sales
        const { data: sales } = await supabase
            .from('sales' as any)
            .select('id, slot_id, amount_gs, start_date, is_active')
            .eq('customer_id', customerData.id)
            .eq('is_active', true);

        const activeSales = (sales || []) as any[];

        // 3. Get slot details for active sales
        const slotIds = activeSales.map((s: any) => s.slot_id).filter(Boolean);
        let slotDetails: any[] = [];
        if (slotIds.length > 0) {
            const { data: slots } = await supabase
                .from('sale_slots')
                .select('id, status, slot_identifier, mother_accounts!inner(platform, email, status)')
                .in('id', slotIds);
            slotDetails = (slots || []) as any[];
        }

        // 4. Check for problems
        const problems: string[] = [];
        for (const slot of slotDetails) {
            const account = Array.isArray(slot.mother_accounts) ? slot.mother_accounts[0] : slot.mother_accounts;
            if (account?.status !== 'active') {
                problems.push(`La cuenta madre de ${account?.platform} (${account?.email}) está ${account?.status}`);
            }
            if (slot.status !== 'sold') {
                problems.push(`El slot ${slot.slot_identifier} de ${account?.platform} tiene estado "${slot.status}" en vez de "sold"`);
            }
        }

        // 5. Build response
        const subscriptions = slotDetails.map((slot: any) => {
            const account = Array.isArray(slot.mother_accounts) ? slot.mother_accounts[0] : slot.mother_accounts;
            return {
                platform: account?.platform,
                profile: slot.slot_identifier,
                account_status: account?.status,
                slot_status: slot.status,
            };
        });

        return NextResponse.json({
            found: true,
            customer: {
                name: customerData.full_name,
                phone: customerData.phone,
            },
            active_subscriptions: subscriptions.length,
            subscriptions,
            has_problems: problems.length > 0,
            problems,
            message: problems.length > 0
                ? `Cliente encontrado con ${problems.length} problema(s): ${problems.join('; ')}`
                : `Cliente encontrado con ${subscriptions.length} suscripción(es) activa(s). Sin problemas detectados.`,
        });
    } catch (error: any) {
        console.error('[API Check Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
