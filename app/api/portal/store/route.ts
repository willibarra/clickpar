import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/store
 * Returns grouped store products: by platform, sale_type (perfiles, familia) and full accounts.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch visible products with available slot count
    const { data: accounts, error } = await (admin.from('mother_accounts') as any)
        .select(`
            id,
            platform,
            slot_price_gs,
            max_slots,
            sale_type,
            sale_price_gs,
            sale_slots (id, status)
        `)
        .eq('show_in_store', true)
        .eq('status', 'active');

    if (error) {
        console.error('[Store API] Error:', error);
        return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
    }

    // Fetch store_alias from platforms table
    const platformNames = [...new Set((accounts || []).map((a: any) => a.platform).filter(Boolean))];
    const storeAliasMap = new Map<string, string>();
    if (platformNames.length > 0) {
        const { data: platformRows } = await (admin.from('platforms') as any)
            .select('name, store_alias')
            .in('name', platformNames);
        (platformRows || []).forEach((p: any) => {
            if (p.store_alias) storeAliasMap.set(p.name, p.store_alias);
        });
    }

    const productsMap = new Map<string, any>();
    
    for (const acc of (accounts || [])) {
        const availableSlots = acc.sale_slots?.filter((s: any) => s.status === 'available').length || 0;
        const saleType = acc.sale_type === 'family' ? 'family' : 'profile';
        const basePrice = Number(acc.slot_price_gs ?? 25000);
        const storeAlias = storeAliasMap.get(acc.platform) || null;
        
        // 1. Group regular accounts (Por Perfiles / Familia)
        const regularKey = `${acc.platform}_${saleType}`;
        if (!productsMap.has(regularKey)) {
            productsMap.set(regularKey, {
                id: acc.id, // we keep one representative account_id
                platform: acc.platform,
                storeAlias,
                sale_type: saleType,
                is_full_account: false,
                priceGs: basePrice,
                availableSlots: 0,
            });
        }
        
        productsMap.get(regularKey)!.availableSlots += availableSlots;
        
        // 2. Detect "Cuenta Completa" if it's completely empty
        if (saleType === 'profile' && availableSlots === acc.max_slots && acc.max_slots > 1) {
            const fullKey = `${acc.platform}_full`;
            const fullPrice = Number(acc.sale_price_gs || (basePrice * acc.max_slots));
            
            if (!productsMap.has(fullKey)) {
                productsMap.set(fullKey, {
                    id: acc.id,
                    platform: acc.platform,
                    storeAlias,
                    sale_type: 'full_account',
                    is_full_account: true,
                    priceGs: fullPrice,
                    availableSlots: 0,
                });
            }
            productsMap.get(fullKey)!.availableSlots += 1;
        }
    }

    const products = Array.from(productsMap.values());

    return NextResponse.json({ success: true, products });
}
