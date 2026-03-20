import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
    sendExpiredNotification,
    sendExpiryNotification,
    sendPreExpiryReminder
} from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';


// Helper to format currency
function getGsValue(amount: number | string): string {
    return Number(amount).toLocaleString('es-PY') + ' Gs.';
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            saleId,
            customerPhone,
            customerName,
            platform,
            expirationDate,
            amountGs,
            daysRemaining,
            isExpired,
            isToday
        } = body;

        if (!customerPhone || !customerName || !platform || !expirationDate) {
            return NextResponse.json({ success: false, error: 'Datos incompletos' }, { status: 400 });
        }

        const supabase = await createAdminClient();

        // Ensure we pass the precise price as a properly formatted string
        const price = amountGs ? getGsValue(amountGs) : '0';
        
        // Fetch sale to get customer_id
        let customerId: string | undefined = undefined;
        if (saleId) {
             const { data: sale } = await supabase.from('sales').select('customer_id').eq('id', saleId).single() as any;
             if (sale) customerId = sale.customer_id;
        }

        // Fetch customer's preferred WhatsApp instance
        let existingInstance: string | null = null;
        if (customerId) {
            const { data: cust } = await supabase.from('customers').select('whatsapp_instance').eq('id', customerId).single() as any;
            if (cust) existingInstance = cust.whatsapp_instance || null;
        }

        let result;
        const params = {
            customerPhone,
            customerName,
            platform,
            expirationDate,
            price,
            customerId,
            saleId,
            // If the sale already has a preferred instance, use it; otherwise let round-robin pick
            instanceName: existingInstance || undefined,
        };

        if (isExpired) {
            result = await sendExpiredNotification(params);
        } else if (isToday) {
            result = await sendExpiryNotification(params);
        } else {
            result = await sendPreExpiryReminder({
                ...params,
                daysRemaining: daysRemaining || 0
            });
        }

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        // Auto-assign: if the customer had no whatsapp_instance, save the one that was used
        if (customerId && !existingInstance && result.instanceUsed) {
            await (supabase.from('customers') as any)
                .update({ whatsapp_instance: result.instanceUsed })
                .eq('id', customerId);
        }

        return NextResponse.json({ success: true, messageId: result.messageId, instanceUsed: result.instanceUsed });
    } catch (error: any) {
        console.error('[SendExpiry] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
