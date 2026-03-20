import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { safeNormalizePhone } from '@/lib/utils/phone';
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const limit = parseInt(searchParams.get('limit') || '30');

    if (!q || q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const supabase = await createAdminClient();
    const pattern = `%${q}%`;

    // If the query looks like a phone number, try normalizing to 595 format.
    // Strip all non-digit characters first so formats like "+595 994 480158" or
    // "0994 480 158" are detected and normalized correctly.
    const digits = q.replace(/\D/g, '');
    // A query is phone-like if removing non-digits leaves >= 4 digits and the
    // original string contains only digits, spaces, +, -, (, ) characters.
    const isPhoneQuery = digits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
    const normalized = isPhoneQuery ? safeNormalizePhone(digits) : null;
    // For phone queries: use normalized or raw digits. For non-phone (emails, names): use the full pattern.
    const phonePattern = isPhoneQuery
        ? (normalized ? `%${normalized}%` : `%${digits}%`)
        : pattern;

    try {
        // 1. Search customers by name or phone (partial)
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone, email')
            .or(`full_name.ilike.${pattern},phone.ilike.${phonePattern}`)
            .limit(limit);

        // 2. Search mother accounts by email, platform, supplier_name
        const { data: accounts } = await supabase
            .from('mother_accounts')
            .select('id, email, password, platform, supplier_name, supplier_phone, status, renewal_date, purchase_cost_gs, sale_price_gs, sale_slots(*)')
            .or(`email.ilike.${pattern},platform.ilike.${pattern},supplier_name.ilike.${pattern},supplier_phone.ilike.${phonePattern}`)
            .order('platform')
            .limit(limit);

        // 3. Search suppliers
        const { data: suppliers } = await supabase
            .from('suppliers')
            .select('id, name, phone')
            .or(`name.ilike.${pattern},phone.ilike.${phonePattern}`)
            .limit(limit);

        // 3b. Search by slot_identifier (for family accounts: YouTube, Spotify, etc.)
        // where slot_identifier IS the customer email/name
        const { data: slotMatches } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, pin_code, status, mother_accounts:mother_account_id(id, platform, email, password, renewal_date)')
            .ilike('slot_identifier', pattern)
            .eq('status', 'sold')
            .limit(20);

        // For matched slots, get the active sale + customer
        const slotMatchIds = (slotMatches || []).map((s: any) => s.id);
        let slotSaleMap: Record<string, any> = {};
        if (slotMatchIds.length > 0) {
            const { data: slotSales } = await (supabase.from('sales') as any)
                .select('id, customer_id, slot_id, amount_gs, start_date, end_date')
                .in('slot_id', slotMatchIds)
                .eq('is_active', true);

            const slotCustIds = [...new Set((slotSales || []).map((s: any) => s.customer_id))];
            let slotCustMap = new Map<string, any>();
            if (slotCustIds.length > 0) {
                const { data: slotCusts } = await (supabase.from('customers') as any)
                    .select('id, full_name, phone')
                    .in('id', slotCustIds);
                (slotCusts || []).forEach((c: any) => slotCustMap.set(c.id, c));
            }

            (slotSales || []).forEach((sale: any) => {
                slotSaleMap[sale.slot_id] = { ...sale, customer: slotCustMap.get(sale.customer_id) || null };
            });
        }

        // 4. For found customers, get their active services with FULL details
        const customerIds = (customers || []).map((c: any) => c.id);
        let customerServices: Record<string, any[]> = {};
        if (customerIds.length > 0) {
            const { data: sales } = await (supabase.from('sales') as any)
                .select('id, customer_id, amount_gs, slot_id, is_active, start_date, end_date')
                .in('customer_id', customerIds)
                .eq('is_active', true)
                .not('slot_id', 'is', null);

            const slotIds = (sales || []).map((s: any) => s.slot_id).filter(Boolean);
            let slotMap = new Map<string, any>();
            if (slotIds.length > 0) {
                const { data: slots } = await (supabase.from('sale_slots') as any)
                    .select('id, slot_identifier, pin_code, status, mother_accounts:mother_account_id(id, platform, email, password, renewal_date, sale_price_gs)')
                    .in('id', slotIds);
                (slots || []).forEach((s: any) => {
                    slotMap.set(s.id, {
                        slot_identifier: s.slot_identifier,
                        pin_code: s.pin_code,
                        slot_status: s.status,
                        platform: s.mother_accounts?.platform || 'Servicio',
                        account_email: s.mother_accounts?.email || '',
                        account_password: s.mother_accounts?.password || '',
                        mother_account_id: s.mother_accounts?.id || '',
                        renewal_date: s.mother_accounts?.renewal_date || '',
                    });
                });
            }

            // Detect combo sales: group by customer+start_date, mark those with 2+ entries
            const comboGroups: Record<string, string[]> = {};
            (sales || []).forEach((sale: any) => {
                const key = `${sale.customer_id}__${sale.start_date}`;
                if (!comboGroups[key]) comboGroups[key] = [];
                comboGroups[key].push(sale.id);
            });
            const comboSaleIds = new Set<string>();
            Object.values(comboGroups).forEach(ids => {
                if (ids.length >= 2) ids.forEach(id => comboSaleIds.add(id));
            });

            (sales || []).forEach((sale: any) => {
                const cid = sale.customer_id;
                if (!customerServices[cid]) customerServices[cid] = [];
                const slotInfo = slotMap.get(sale.slot_id) || {};

                // Usar end_date real de la venta
                const saleEndDate = sale.end_date || '';

                customerServices[cid].push({
                    sale_id: sale.id,
                    slot_id: sale.slot_id,
                    platform: slotInfo.platform || 'Servicio',
                    slot_identifier: slotInfo.slot_identifier || '',
                    pin_code: slotInfo.pin_code || '',
                    slot_status: slotInfo.slot_status || '',
                    account_email: slotInfo.account_email || '',
                    account_password: slotInfo.account_password || '',
                    mother_account_id: slotInfo.mother_account_id || '',
                    renewal_date: slotInfo.renewal_date || '',
                    sale_end_date: saleEndDate,
                    amount: sale.amount_gs,
                    start_date: sale.start_date,
                    is_combo: comboSaleIds.has(sale.id),
                });
            });
        }

        // 5. For found accounts, get customer data for sold slots
        const accountIds = (accounts || []).map((a: any) => a.id);
        let accountSlotCustomers: Record<string, Record<string, any>> = {}; // slotId -> customer+sale info
        if (accountIds.length > 0) {
            // Get all active sales for these accounts' slots
            const allSlotIds = (accounts || []).flatMap((a: any) =>
                (a.sale_slots || []).map((s: any) => s.id)
            );
            if (allSlotIds.length > 0) {
                const { data: slotSales } = await (supabase.from('sales') as any)
                    .select('id, customer_id, slot_id, amount_gs, start_date, end_date, is_active')
                    .in('slot_id', allSlotIds)
                    .eq('is_active', true);

                // Get customer names for these sales
                const saleCustIds = [...new Set((slotSales || []).map((s: any) => s.customer_id))];
                let custNameMap = new Map<string, any>();
                if (saleCustIds.length > 0) {
                    const { data: custs } = await (supabase.from('customers') as any)
                        .select('id, full_name, phone')
                        .in('id', saleCustIds);
                    (custs || []).forEach((c: any) => custNameMap.set(c.id, c));
                }

                (slotSales || []).forEach((sale: any) => {
                    const cust = custNameMap.get(sale.customer_id);
                    accountSlotCustomers[sale.slot_id] = {
                        sale_id: sale.id,
                        customer_id: sale.customer_id,
                        customer_name: cust?.full_name || 'Sin nombre',
                        customer_phone: cust?.phone || '',
                        amount: sale.amount_gs,
                        start_date: sale.start_date,
                        end_date: sale.end_date || '',
                    };
                });
            }
        }

        // Build unified results
        const results: any[] = [];

        // Add customers with their services
        (customers || []).forEach((c: any) => {
            results.push({
                id: c.id,
                type: 'customer',
                title: c.full_name || 'Sin nombre',
                subtitle: c.phone || c.email || '',
                services: customerServices[c.id] || [],
            });
        });

        // Add accounts with full detail + customer info per slot
        (accounts || []).forEach((a: any) => {
            const slots = a.sale_slots || [];
            const totalSlots = slots.length;
            const availableSlots = slots.filter((s: any) => s.status === 'available').length;
            const soldSlots = slots.filter((s: any) => s.status === 'sold').length;

            const slotDetails = slots
                .sort((a: any, b: any) => {
                    // Natural sort: "Perfil 1" < "Perfil 2" < "Perfil 10"
                    return (a.slot_identifier || '').localeCompare(b.slot_identifier || '', undefined, { numeric: true });
                })
                .map((s: any) => {
                    const custInfo = accountSlotCustomers[s.id];
                    return {
                        id: s.id,
                        identifier: s.slot_identifier,
                        status: s.status,
                        pin_code: s.pin_code || '',
                        customer: custInfo || null,
                    };
                });

            results.push({
                id: a.id,
                type: 'account',
                title: `${a.platform} - ${a.email}`,
                subtitle: a.supplier_name ? `Proveedor: ${a.supplier_name}` : '',
                platform: a.platform,
                status: a.status,
                email: a.email,
                password: a.password,
                renewal_date: a.renewal_date,
                purchase_cost_gs: a.purchase_cost_gs,
                sale_price_gs: a.sale_price_gs,
                supplier_name: a.supplier_name || '',
                supplier_phone: a.supplier_phone || '',
                totalSlots,
                availableSlots,
                soldSlots,
                slots: slotDetails,
            });
        });

        // Add suppliers
        (suppliers || []).forEach((s: any) => {
            results.push({
                id: s.id,
                type: 'supplier',
                title: s.name || 'Sin nombre',
                subtitle: s.phone || '',
            });
        });

        // Add slot-identifier matches (family accounts: YouTube, Spotify)
        // Group by customer to avoid duplicates
        const addedCustomerIds = new Set(results.filter(r => r.type === 'customer').map((r: any) => r.id));
        (slotMatches || []).forEach((slot: any) => {
            const saleInfo = slotSaleMap[slot.id];
            const cust = saleInfo?.customer;
            const ma = slot.mother_accounts;

            if (cust && !addedCustomerIds.has(cust.id)) {
                // Show as customer result with service info
                addedCustomerIds.add(cust.id);
                results.unshift({
                    id: cust.id,
                    type: 'customer',
                    title: cust.full_name || cust.phone || slot.slot_identifier,
                    subtitle: cust.phone || slot.slot_identifier,
                    services: [{
                        sale_id: saleInfo.id,
                        slot_id: slot.id,
                        platform: ma?.platform || 'Servicio',
                        slot_identifier: slot.slot_identifier,
                        pin_code: slot.pin_code || '',
                        slot_status: slot.status,
                        account_email: ma?.email || '',
                        account_password: ma?.password || '',
                        mother_account_id: ma?.id || '',
                        renewal_date: ma?.renewal_date || '',
                        sale_end_date: saleInfo.end_date || '',
                        amount: saleInfo.amount_gs,
                        start_date: saleInfo.start_date,
                        is_combo: false,
                    }],
                });
            } else if (!cust && !results.some((r: any) => r.id === slot.id)) {
                // No customer found, show the slot itself
                results.push({
                    id: slot.id,
                    type: 'customer',
                    title: slot.slot_identifier,
                    subtitle: ma?.platform || 'Slot sin cliente',
                    services: [],
                });
            }
        });

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('[Search] Error:', error);
        return NextResponse.json({ results: [], error: error.message }, { status: 500 });
    }
}
