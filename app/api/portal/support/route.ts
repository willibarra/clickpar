import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';

/**
 * GET /api/portal/support
 * Returns personalized help content for the authenticated customer,
 * based on their active services and each service's provider (supplier).
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Get profile with phone
    const { data: profile } = await (admin.from('profiles') as any)
        .select('id, full_name, phone_number')
        .eq('id', user.id)
        .single();

    if (!profile?.phone_number) {
        return NextResponse.json({
            success: true,
            helpItems: [],
        });
    }

    // Find customer by phone
    const { data: customer } = await (admin.from('customers') as any)
        .select('id, full_name')
        .eq('phone', normalizePhone(profile.phone_number))
        .single();

    if (!customer) {
        return NextResponse.json({
            success: true,
            helpItems: [],
        });
    }

    // Get active sales
    const { data: sales } = await (admin.from('sales') as any)
        .select('id, slot_id')
        .eq('customer_id', customer.id)
        .eq('is_active', true);

    if (!sales || sales.length === 0) {
        return NextResponse.json({
            success: true,
            helpItems: [],
        });
    }

    // Get slot → mother_account details
    const slotIds = sales.map((s: any) => s.slot_id).filter(Boolean);
    if (slotIds.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    const { data: slots } = await (admin.from('sale_slots') as any)
        .select('id, mother_account_id')
        .in('id', slotIds);

    if (!slots || slots.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    const accountIds = [...new Set(slots.map((s: any) => s.mother_account_id).filter(Boolean))];
    if (accountIds.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    const { data: accounts } = await admin
        .from('mother_accounts')
        .select('id, platform, supplier_name')
        .in('id', accountIds);

    if (!accounts || accounts.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    // Collect unique platform+supplier combinations
    const uniqueKeys = new Set<string>();
    const combos: { platform: string; supplierName: string }[] = [];
    for (const acct of accounts as any[]) {
        const key = `${acct.platform}||${acct.supplier_name}`;
        if (!uniqueKeys.has(key)) {
            uniqueKeys.add(key);
            combos.push({ platform: acct.platform, supplierName: acct.supplier_name });
        }
    }

    // Fetch all provider_support_config
    const { data: configs } = await (admin.from('provider_support_config') as any)
        .select('platform, supplier_name, code_url, needs_code, support_instructions, help_steps, faq_items');

    const configMap = new Map<string, any>();
    if (configs) {
        for (const c of configs) {
            configMap.set(`${c.platform}||${c.supplier_name}`, c);
        }
    }

    // Build help items
    const helpItems = combos.map((combo) => {
        const config = configMap.get(`${combo.platform}||${combo.supplierName}`);
        return {
            platform: combo.platform,
            supplierName: combo.supplierName,
            supportInstructions: config?.support_instructions || 'Contactá soporte por WhatsApp para asistencia.',
            helpSteps: config?.help_steps || [],
            faqItems: config?.faq_items || [],
            needsCode: config?.needs_code || false,
            codeUrl: config?.code_url || null,
        };
    });

    return NextResponse.json({
        success: true,
        helpItems,
    });
}
