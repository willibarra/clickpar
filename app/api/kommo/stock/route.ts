import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/kommo/stock
 * Returns available platforms with slot counts.
 * Used by Kommo AI agent to show customers what's available.
 */
export async function GET(request: NextRequest) {
    try {
        // Get available slots grouped by platform
        const { data: slots, error } = await supabase
            .from('sale_slots')
            .select('id, mother_accounts!inner(platform, slot_price_gs)')
            .eq('status', 'available')
            .eq('mother_accounts.status', 'active');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Group by platform
        const platforms: Record<string, { available: number; price: number }> = {};
        for (const slot of (slots || []) as any[]) {
            const p = slot.mother_accounts?.platform;
            const price = slot.mother_accounts?.slot_price_gs || 0;
            if (!p) continue;
            if (!platforms[p]) platforms[p] = { available: 0, price };
            platforms[p].available++;
            if (price > 0) platforms[p].price = price;
        }

        // Format as a readable list for the AI agent
        const productList = Object.entries(platforms)
            .filter(([_, info]) => info.available > 0)
            .map(([name, info]) => ({
                platform: name,
                available: info.available,
                price_gs: info.price,
                price_formatted: info.price > 0 ? `Gs. ${info.price.toLocaleString()}` : 'Consultar',
            }));

        return NextResponse.json({
            success: true,
            total_platforms: productList.length,
            products: productList,
            message: productList.length > 0
                ? `Tenemos ${productList.length} plataformas disponibles`
                : 'No hay stock disponible en este momento',
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
