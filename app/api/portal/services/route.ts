import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


/**
 * GET /api/portal/services
 * Returns active services for the authenticated customer.
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

    // Resolve phone: prefer profile.phone_number, fallback to extracting from
    // the email when auth user was created as "{phone}@clickpar.shop"
    let resolvedPhone: string | null = profile?.phone_number || null;
    if (!resolvedPhone && user.email?.endsWith('@clickpar.shop')) {
        const extracted = user.email.replace('@clickpar.shop', '');
        if (extracted) resolvedPhone = `+${extracted}`;
    }

    if (!resolvedPhone) {
        return NextResponse.json({
            success: true,
            customer: { name: profile?.full_name || user.email, phone: null },
            services: [],
            totalActive: 0,
        });
    }

    // Find customer by phone — try normalized first, then raw fallbacks
    let customer: any = null;
    const phonesToTry = [
        normalizePhone(resolvedPhone),
        resolvedPhone,
        resolvedPhone.replace(/^\+/, ''),
    ];
    for (const phone of phonesToTry) {
        const { data } = await (admin.from('customers') as any)
            .select('id, full_name, customer_type, creator_slug, panel_disabled')
            .eq('phone', phone)
            .maybeSingle();
        if (data) { customer = data; break; }
    }

    if (!customer) {
        return NextResponse.json({
            success: true,
            customer: { name: profile?.full_name || user.email, phone: resolvedPhone },
            services: [],
            totalActive: 0,
        });
    }

    // Step 1: Get active sales
    const { data: sales, error: salesError } = await (admin.from('sales') as any)
        .select('id, amount_gs, start_date, end_date, is_active, slot_id, is_canje')
        .eq('customer_id', customer.id)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    if (salesError) {
        console.error('[Portal] Error fetching sales:', salesError);
        return NextResponse.json({ error: 'Error al obtener servicios' }, { status: 500 });
    }

    if (!sales || sales.length === 0) {
        return NextResponse.json({
            success: true,
            customer: {
                name: profile?.full_name || customer.full_name,
                phone: resolvedPhone,
                panelDisabled: customer.panel_disabled ?? false,
            },
            services: [],
            totalActive: 0,
        });
    }

    // Step 2: Get slot details for each sale
    const slotIds = sales.map((s: any) => s.slot_id).filter(Boolean);
    const slotMap = new Map<string, any>();

    if (slotIds.length > 0) {
        const { data: slots } = await (admin.from('sale_slots') as any)
            .select('id, slot_identifier, pin_code, status, mother_account_id')
            .in('id', slotIds);

        if (slots) {
            // Step 3: Get mother account details
            const accountIds = [...new Set(slots.map((s: any) => s.mother_account_id).filter(Boolean))];
            const accountMap = new Map<string, any>();

            if (accountIds.length > 0) {
                const { data: accounts } = await admin
                    .from('mother_accounts')
                    .select('id, platform, email, password, renewal_date, status, supplier_name')
                    .in('id', accountIds);

                (accounts || []).forEach((a: any) => accountMap.set(a.id, a));
            }

            // Fetch platform nicknames for alias display
            const uniquePlatforms = [...new Set([...accountMap.values()].map((a: any) => a.platform).filter(Boolean))];
            const platformNicknamesMap = new Map<string, string[]>();
            if (uniquePlatforms.length > 0) {
                const { data: platformRows } = await (admin.from('platforms') as any)
                    .select('name, nicknames')
                    .in('name', uniquePlatforms);
                (platformRows || []).forEach((p: any) => {
                    if (p.nicknames && Array.isArray(p.nicknames) && p.nicknames.length > 0) {
                        platformNicknamesMap.set(p.name, p.nicknames);
                    }
                });
            }

            slots.forEach((s: any) => {
                const acct = accountMap.get(s.mother_account_id) || null;
                slotMap.set(s.id, {
                    ...s,
                    mother_account: acct,
                    platform_nicknames: acct ? (platformNicknamesMap.get(acct.platform) || []) : [],
                });
            });
        }
    }

    // Fetch provider support config for all platforms/suppliers
    const providerConfigs = new Map<string, any>();
    const configKeys = new Set<string>();
    for (const [, slot] of slotMap) {
        const acct = slot?.mother_account;
        if (acct?.platform && acct?.supplier_name) {
            configKeys.add(`${acct.platform}||${acct.supplier_name}`);
        }
    }
    if (configKeys.size > 0) {
        const { data: configs } = await (admin.from('provider_support_config') as any)
            .select('platform, supplier_name, code_url, needs_code, support_instructions, code_source');
        if (configs) {
            configs.forEach((c: any) => {
                providerConfigs.set(`${c.platform}||${c.supplier_name}`, c);
            });
        }
    }

    // Build services array — show ALL active sales, no email filter
    const services = sales.map((sale: any) => {
        const slot = slotMap.get(sale.slot_id);
        const account = slot?.mother_account;
        const configKey = `${account?.platform}||${account?.supplier_name}`;
        const providerConfig = providerConfigs.get(configKey);
        return {
            saleId: sale.id,
            platform: account?.platform || 'Desconocido',
            platformNicknames: slot?.platform_nicknames || [],
            email: account?.email || '',
            password: account?.password || '',
            pin: slot?.pin_code || null,
            profile: slot?.slot_identifier || null,
            startDate: sale.start_date,
            expiresAt: sale.end_date,
            renewalDate: account?.renewal_date || null,
            amount: sale.amount_gs,
            supplierName: account?.supplier_name || null,
            needsCode: providerConfig?.needs_code || false,
            codeUrl: providerConfig?.code_url || null,
            codeSource: providerConfig?.code_source || 'manual',
            isCanje: sale.is_canje || false,
        };
    });

    return NextResponse.json({
        success: true,
        customer: {
            name: profile?.full_name || customer.full_name || user.email,
            phone: resolvedPhone,
            customerType: customer.customer_type || 'cliente',
            creatorSlug: customer.creator_slug || null,
            panelDisabled: customer.panel_disabled ?? false,
        },
        services,
        totalActive: services.length,
    });
}
