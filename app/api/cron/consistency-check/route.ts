import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

/**
 * POST /api/cron/consistency-check
 * 
 * Auto-healing endpoint that runs every hour:
 * 1. Finds orphan slots (sold without active sale) and releases them
 * 2. Finds ghost sales (active sale with available slot) and deactivates them
 * 3. Generates admin notification with summary
 * 
 * Protected by CRON_SECRET.
 * 
 * curl -X POST "https://clickpar.shop/api/cron/consistency-check" \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer clickpar-cron-2024"
 */
export async function POST(request: NextRequest) {
    // Verify auth via header or query param
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.replace('Bearer ', '');
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret');
    const secret = bearerToken || querySecret;

    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results = {
            orphan_slots_fixed: 0,
            ghost_sales_fixed: 0,
            orphan_details: [] as string[],
            ghost_details: [] as string[],
            errors: [] as string[],
        };

        // ================================================
        // 1. ORPHAN SLOTS: sold slots without active sale
        // ================================================
        const { data: orphans, error: orphanError } = await supabase
            .from('orphan_slots' as any)
            .select('slot_id, slot_identifier, platform, account_email');

        if (orphanError) {
            results.errors.push(`Error consultando orphan_slots: ${orphanError.message}`);
        } else if (orphans && orphans.length > 0) {
            for (const orphan of orphans as any[]) {
                const { error: fixError } = await supabase
                    .from('sale_slots')
                    .update({ status: 'available' })
                    .eq('id', orphan.slot_id);

                if (fixError) {
                    results.errors.push(`Error liberando slot ${orphan.slot_id}: ${fixError.message}`);
                } else {
                    results.orphan_slots_fixed++;
                    results.orphan_details.push(
                        `${orphan.platform} - ${orphan.account_email} - ${orphan.slot_identifier || 'sin identificador'}`
                    );
                }
            }
        }

        // ================================================
        // 2. GHOST SALES: active sales with available slot
        // ================================================
        const { data: ghostSales, error: ghostError } = await supabase
            .from('sales' as any)
            .select(`
                id, customer_id, slot_id,
                sale_slots:slot_id (status, slot_identifier, mother_accounts:mother_account_id(platform, email))
            `)
            .eq('is_active', true);

        if (ghostError) {
            results.errors.push(`Error consultando ghost sales: ${ghostError.message}`);
        } else if (ghostSales) {
            for (const sale of ghostSales as any[]) {
                const slotStatus = sale.sale_slots?.status;
                // A ghost sale is an active sale whose slot is available (not sold)
                if (slotStatus === 'available') {
                    const { error: deactivateError } = await supabase
                        .from('sales' as any)
                        .update({ is_active: false })
                        .eq('id', sale.id);

                    if (deactivateError) {
                        results.errors.push(`Error desactivando ghost sale ${sale.id}: ${deactivateError.message}`);
                    } else {
                        results.ghost_sales_fixed++;
                        const platform = sale.sale_slots?.mother_accounts?.platform || '?';
                        const identifier = sale.sale_slots?.slot_identifier || '?';
                        results.ghost_details.push(`${platform} - ${identifier} (sale ${sale.id.slice(0, 8)})`);
                    }
                }
            }
        }

        // ================================================
        // 3. ADMIN NOTIFICATION
        // ================================================
        const totalFixed = results.orphan_slots_fixed + results.ghost_sales_fixed;

        if (totalFixed > 0 || results.errors.length > 0) {
            const parts: string[] = [];
            if (results.orphan_slots_fixed > 0) {
                parts.push(`🔧 ${results.orphan_slots_fixed} slot(s) huérfano(s) liberado(s)`);
            }
            if (results.ghost_sales_fixed > 0) {
                parts.push(`👻 ${results.ghost_sales_fixed} venta(s) fantasma desactivada(s)`);
            }
            if (results.errors.length > 0) {
                parts.push(`⚠️ ${results.errors.length} error(es)`);
            }

            await supabase.from('notifications' as any).insert({
                type: 'consistency_check',
                message: `🔍 Consistency Check: ${parts.join(' | ')}`,
                is_read: false,
            });
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                orphan_slots_fixed: results.orphan_slots_fixed,
                ghost_sales_fixed: results.ghost_sales_fixed,
                errors: results.errors.length,
            },
            details: results,
        });
    } catch (error: any) {
        console.error('[Cron ConsistencyCheck] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
