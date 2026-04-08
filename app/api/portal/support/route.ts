import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/support
 * Returns active services with their personalized help content for the authenticated customer.
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

    // Resolve phone
    let resolvedPhone: string | null = profile?.phone_number || null;
    if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
        const extracted = user.email.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    if (!resolvedPhone) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    // Find customer by phone
    let customer: any = null;
    const phonesToTry = [
        normalizePhone(resolvedPhone),
        resolvedPhone,
        resolvedPhone.replace(/^\+/, ''),
    ];
    for (const phone of phonesToTry) {
        const { data } = await (admin.from('customers') as any)
            .select('id, full_name')
            .eq('phone', phone)
            .maybeSingle();
        if (data) { customer = data; break; }
    }

    if (!customer) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    // Get active sales
    const { data: sales, error: salesError } = await (admin.from('sales') as any)
        .select('id, slot_id, is_active')
        .eq('customer_id', customer.id)
        .eq('is_active', true);

    if (salesError || !sales || sales.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    // Get slot details
    const slotIds = sales.map((s: any) => s.slot_id).filter(Boolean);
    if (slotIds.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    const { data: slots } = await (admin.from('sale_slots') as any)
        .select('id, pin_code, mother_account_id')
        .in('id', slotIds);

    if (!slots || slots.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    // Get mother account details
    const accountIds = [...new Set(slots.map((s: any) => s.mother_account_id).filter(Boolean))];
    if (accountIds.length === 0) {
        return NextResponse.json({ success: true, helpItems: [] });
    }

    const { data: accounts } = await admin
        .from('mother_accounts')
        .select('id, platform, email, supplier_name')
        .in('id', accountIds);

    const accountMap = new Map<string, any>();
    (accounts || []).forEach((a: any) => accountMap.set(a.id, a));

    const slotMap = new Map<string, any>();
    slots.forEach((s: any) => {
        slotMap.set(s.id, {
            ...s,
            mother_account: accountMap.get(s.mother_account_id) || null,
        });
    });

    // Fetch provider support configurations
    const uniqueKeys = new Set<string>();
    for (const [, slot] of slotMap) {
        const acct = slot?.mother_account;
        if (acct?.platform && acct?.supplier_name) {
            uniqueKeys.add(`${acct.platform}||${acct.supplier_name}`);
        }
    }

    const configMap = new Map<string, any>();
    if (uniqueKeys.size > 0) {
        const { data: configs } = await (admin.from('provider_support_config') as any)
            .select('platform, supplier_name, code_url, needs_code, support_instructions, help_steps, faq_items, code_source');
        if (configs) {
            for (const c of configs) {
                configMap.set(`${c.platform}||${c.supplier_name}`, c);
            }
        }
    }

    // Build per-service help items
    const helpItems = sales.map((sale: any) => {
        const slot = slotMap.get(sale.slot_id);
        const account = slot?.mother_account;
        const config = configMap.get(`${account?.platform}||${account?.supplier_name}`);
        
        return {
            saleId: sale.id,
            email: account?.email || 'N/A',
            pin: slot?.pin_code || null,
            platform: account?.platform || 'Desconocido',
            supplierName: account?.supplier_name || 'N/A',
            supportInstructions: config?.support_instructions || 'Contactá soporte por WhatsApp para asistencia.',
            helpSteps: config?.help_steps || [],
            faqItems: config?.faq_items || [],
            needsCode: config?.needs_code || false,
            codeUrl: config?.code_url || null,
            codeSource: config?.code_source || 'manual',
        };
    });

    return NextResponse.json({
        success: true,
        helpItems,
    });
}
