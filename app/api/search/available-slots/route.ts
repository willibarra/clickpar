import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


export async function GET() {
    const supabase = await createAdminClient();

    try {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, status, mother_accounts:mother_account_id(id, platform, email, status, renewal_date)')
            .eq('status', 'available')
            .order('slot_identifier');

        const today = new Date().toISOString().split('T')[0];

        // Filter out slots from quarantined/inactive/expired accounts
        const formattedSlots = (slots || [])
            .filter((s: any) => {
                const acct = s.mother_accounts;
                if (!acct || acct.status !== 'active') return false;
                // Exclude expired accounts
                if (acct.renewal_date && acct.renewal_date < today) return false;
                return true;
            })
            .map((s: any) => ({
                id: s.id,
                identifier: s.slot_identifier,
                platform: s.mother_accounts?.platform || 'Desconocido',
                account_email: s.mother_accounts?.email || '',
                account_id: s.mother_accounts?.id || '',
                renewal: s.mother_accounts?.renewal_date || '1970-01-01'
            })).sort((a: any, b: any) => new Date(b.renewal).getTime() - new Date(a.renewal).getTime());

        return NextResponse.json({ slots: formattedSlots });
    } catch (error: any) {
        console.error('[AvailableSlots] Error:', error);
        return NextResponse.json({ slots: [], error: error.message }, { status: 500 });
    }
}
