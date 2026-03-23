import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) return NextResponse.json({ customers: [] });

    const supabase = await createAdminClient();

    const { data, error } = await (supabase.from('customers') as any)
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(10);

    if (error) return NextResponse.json({ customers: [], error: error.message });

    return NextResponse.json({ customers: data || [] });
}
