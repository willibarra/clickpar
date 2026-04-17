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
    const digits = q.replace(/\D/g, '');
    const isPhoneQuery = digits.length >= 4 && /^[\d\s\+\-\(\)]+$/.test(q);
    const normalized = isPhoneQuery ? safeNormalizePhone(digits) : null;
    const phonePattern = isPhoneQuery
        ? (normalized ? `%${normalized}%` : `%${digits}%`)
        : pattern;

    try {
        // ─── PHASE 1: All initial searches run in parallel ──────────────────────
        // None of these depend on each other, so we fire them all at once.
        const [
            { data: customers },
            { data: accounts },
            { data: suppliers },
            { data: slotMatches },
        ] = await Promise.all([
            // 1. Customers by name or phone
            (supabase.from('customers') as any)
                .select('id, full_name, phone, email')
                .or(`full_name.ilike.${pattern},phone.ilike.${phonePattern}`)
                .limit(limit),

            // 2. Mother accounts by email, platform, supplier (include slots)
            supabase
                .from('mother_accounts')
                .select('id, email, password, platform, supplier_name, supplier_phone, status, renewal_date, purchase_cost_gs, sale_price_gs, sale_type, sale_slots(*)')
                .or(`email.ilike.${pattern},platform.ilike.${pattern},supplier_name.ilike.${pattern},supplier_phone.ilike.${phonePattern}`)
                .is('deleted_at', null)
                .order('platform')
                .limit(limit),

            // 3. Suppliers
            supabase
                .from('suppliers')
                .select('id, name, phone')
                .or(`name.ilike.${pattern},phone.ilike.${phonePattern}`)
                .limit(limit),

            // 4. Slot identifier matches (family accounts: YouTube, Spotify, etc.)
            (supabase.from('sale_slots') as any)
                .select('id, slot_identifier, pin_code, status, mother_accounts:mother_account_id(id, platform, email, password, renewal_date)')
                .ilike('slot_identifier', pattern)
                .eq('status', 'sold')
                .limit(20),
        ]);

        // ─── PHASE 2: Dependent queries, all run in parallel ────────────────────
        // Each batch depends on Phase 1 results but not on each other.
        const platformNamesInResults = [...new Set((accounts || []).map((a: any) => a.platform))];
        const customerIds = (customers || []).map((c: any) => c.id);
        const allSlotIds = (accounts || []).flatMap((a: any) =>
            (a.sale_slots || []).map((s: any) => s.id)
        );
        const slotMatchIds = (slotMatches || []).map((s: any) => s.id);

        const [
            { data: platData },
            { data: customerSales },
            { data: accountSlotSales },
            { data: slotMatchSales },
        ] = await Promise.all([
            // Platforms → business_type for accounts found in Phase 1
            platformNamesInResults.length > 0
                ? supabase.from('platforms').select('name, business_type').in('name', platformNamesInResults)
                : Promise.resolve({ data: [], error: null }),

            // Active sales for found customers
            customerIds.length > 0
                ? (supabase.from('sales') as any)
                    .select('id, customer_id, amount_gs, slot_id, is_active, start_date, end_date')
                    .in('customer_id', customerIds)
                    .eq('is_active', true)
                    .not('slot_id', 'is', null)
                : Promise.resolve({ data: [], error: null }),

            // Active sales for found accounts' slots
            allSlotIds.length > 0
                ? (supabase.from('sales') as any)
                    .select('id, customer_id, slot_id, amount_gs, start_date, end_date, is_active')
                    .in('slot_id', allSlotIds)
                    .eq('is_active', true)
                : Promise.resolve({ data: [], error: null }),

            // Active sales for family-slot matches
            slotMatchIds.length > 0
                ? (supabase.from('sales') as any)
                    .select('id, customer_id, slot_id, amount_gs, start_date, end_date')
                    .in('slot_id', slotMatchIds)
                    .eq('is_active', true)
                : Promise.resolve({ data: [], error: null }),
        ]);

        // Build initial platform type map from Phase 2
        let platformTypeMap: Record<string, string> = {};
        (platData || []).forEach((p: any) => { platformTypeMap[p.name] = p.business_type || ''; });

        // ─── PHASE 3: Final dependent queries, all run in parallel ──────────────
        const customerSaleSlotIds = (customerSales || []).map((s: any) => s.slot_id).filter(Boolean);
        const accountSaleCustIds = [...new Set((accountSlotSales || []).map((s: any) => s.customer_id))];
        const slotMatchCustIds = [...new Set((slotMatchSales || []).map((s: any) => s.customer_id))];

        const [
            { data: customerSaleSlots },
            { data: accountSaleCustomers },
            { data: slotMatchCustomers },
        ] = await Promise.all([
            // Slot + mother account details for customer sales
            customerSaleSlotIds.length > 0
                ? (supabase.from('sale_slots') as any)
                    .select('id, slot_identifier, pin_code, status, mother_accounts:mother_account_id(id, platform, email, password, renewal_date, sale_price_gs, sale_type)')
                    .in('id', customerSaleSlotIds)
                : Promise.resolve({ data: [], error: null }),

            // Customer names for account slot sales
            accountSaleCustIds.length > 0
                ? (supabase.from('customers') as any)
                    .select('id, full_name, phone')
                    .in('id', accountSaleCustIds)
                : Promise.resolve({ data: [], error: null }),

            // Customer names for slot-match sales
            slotMatchCustIds.length > 0
                ? (supabase.from('customers') as any)
                    .select('id, full_name, phone')
                    .in('id', slotMatchCustIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

        // ─── PHASE 4: Enrich platform map with any new platforms from customer slots ──
        // (only runs additional query if there are platforms not yet in the map)
        const newPlats = [...new Set(
            (customerSaleSlots || []).map((s: any) => s.mother_accounts?.platform || '').filter(Boolean)
        )].filter((p): p is string => typeof p === 'string' && !(p in platformTypeMap));

        if (newPlats.length > 0) {
            const { data: newPlatData } = await supabase
                .from('platforms')
                .select('name, business_type')
                .in('name', newPlats);
            (newPlatData || []).forEach((p: any) => { platformTypeMap[p.name] = p.business_type || ''; });
        }

        // ─── Build Maps ────────────────────────────────────────────────────────────

        // Slot info map for customer sales
        let slotMap = new Map<string, any>();
        (customerSaleSlots || []).forEach((s: any) => {
            const maPlat = s.mother_accounts?.platform || '';
            const slotIsFamily = platformTypeMap[maPlat] === 'family_account';
            slotMap.set(s.id, {
                slot_identifier: s.slot_identifier,
                pin_code: s.pin_code,
                slot_status: s.status,
                platform: maPlat || 'Servicio',
                account_email: slotIsFamily ? '' : (s.mother_accounts?.email || ''),
                account_password: slotIsFamily ? '' : (s.mother_accounts?.password || ''),
                mother_account_id: s.mother_accounts?.id || '',
                renewal_date: s.mother_accounts?.renewal_date || '',
                sale_type: s.mother_accounts?.sale_type || 'profile',
                is_family: slotIsFamily,
                mother_platform: maPlat,
                client_email: slotIsFamily ? s.slot_identifier : '',
                client_password: slotIsFamily ? (s.pin_code || '') : '',
            });
        });

        // Detect combo sales (same customer + same start_date → 2+ services)
        const comboGroups: Record<string, string[]> = {};
        (customerSales || []).forEach((sale: any) => {
            const key = `${sale.customer_id}__${sale.start_date}`;
            if (!comboGroups[key]) comboGroups[key] = [];
            comboGroups[key].push(sale.id);
        });
        const comboSaleIds = new Set<string>();
        Object.values(comboGroups).forEach(ids => {
            if (ids.length >= 2) ids.forEach(id => comboSaleIds.add(id));
        });

        // Customer services map
        let customerServices: Record<string, any[]> = {};
        (customerSales || []).forEach((sale: any) => {
            const cid = sale.customer_id;
            if (!customerServices[cid]) customerServices[cid] = [];
            const slotInfo = slotMap.get(sale.slot_id) || {};
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
                sale_type: slotInfo.sale_type || 'profile',
                sale_end_date: sale.end_date || '',
                amount: sale.amount_gs,
                start_date: sale.start_date,
                is_combo: comboSaleIds.has(sale.id),
                is_family: slotInfo.is_family || false,
                mother_platform: slotInfo.mother_platform || '',
                client_email: slotInfo.client_email || '',
                client_password: slotInfo.client_password || '',
            });
        });

        // Account slot → customer map
        let custNameMap = new Map<string, any>();
        (accountSaleCustomers || []).forEach((c: any) => custNameMap.set(c.id, c));

        let accountSlotCustomers: Record<string, any> = {};
        (accountSlotSales || []).forEach((sale: any) => {
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

        // Slot match sale map
        let slotMatchCustMap = new Map<string, any>();
        (slotMatchCustomers || []).forEach((c: any) => slotMatchCustMap.set(c.id, c));

        let slotSaleMap: Record<string, any> = {};
        (slotMatchSales || []).forEach((sale: any) => {
            slotSaleMap[sale.slot_id] = { ...sale, customer: slotMatchCustMap.get(sale.customer_id) || null };
        });

        // ─── Build Unified Results ────────────────────────────────────────────────

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

        // Add mother accounts with full detail + customer info per slot
        (accounts || []).forEach((a: any) => {
            const slots = a.sale_slots || [];
            const totalSlots = slots.length;
            const availableSlots = slots.filter((s: any) => s.status === 'available').length;
            const soldSlots = slots.filter((s: any) => s.status === 'sold').length;
            const isFamily = platformTypeMap[a.platform] === 'family_account';

            const slotDetails = slots
                .sort((a: any, b: any) =>
                    (a.slot_identifier || '').localeCompare(b.slot_identifier || '', undefined, { numeric: true })
                )
                .map((s: any) => {
                    const custInfo = accountSlotCustomers[s.id];
                    return {
                        id: s.id,
                        identifier: s.slot_identifier,
                        status: s.status,
                        pin_code: s.pin_code || '',
                        customer: custInfo || null,
                        is_family: isFamily,
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
                sale_type: a.sale_type || 'profile',
                supplier_name: a.supplier_name || '',
                supplier_phone: a.supplier_phone || '',
                is_family: isFamily,
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
        const addedCustomerIds = new Set(results.filter(r => r.type === 'customer').map((r: any) => r.id));
        (slotMatches || []).forEach((slot: any) => {
            const saleInfo = slotSaleMap[slot.id];
            const cust = saleInfo?.customer;
            const ma = slot.mother_accounts;
            const motherIsFamily = platformTypeMap[ma?.platform] === 'family_account';

            if (cust && !addedCustomerIds.has(cust.id)) {
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
                        account_email: motherIsFamily ? '' : (ma?.email || ''),
                        account_password: motherIsFamily ? '' : (ma?.password || ''),
                        mother_account_id: ma?.id || '',
                        renewal_date: ma?.renewal_date || '',
                        sale_type: ma?.sale_type || 'profile',
                        sale_end_date: saleInfo.end_date || '',
                        amount: saleInfo.amount_gs,
                        start_date: saleInfo.start_date,
                        is_combo: false,
                        is_family: motherIsFamily,
                        mother_platform: ma?.platform || '',
                        client_email: motherIsFamily ? slot.slot_identifier : '',
                        client_password: motherIsFamily ? (slot.pin_code || '') : '',
                    }],
                });
            } else if (!cust && !results.some((r: any) => r.id === slot.id)) {
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
