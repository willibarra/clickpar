import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/creator-stats?slug=willibarra
// Returns click counts for a creator slug (last 30 days + all time)
export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get('slug');
    if (!slug) {
        return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [allTime, last30, recent] = await Promise.all([
        // All time total
        supabase
            .from('creator_clicks')
            .select('id', { count: 'exact', head: true })
            .eq('slug', slug),

        // Last 30 days
        supabase
            .from('creator_clicks')
            .select('id', { count: 'exact', head: true })
            .eq('slug', slug)
            .gte('clicked_at', thirtyDaysAgo.toISOString()),

        // Last 10 clicks with date
        supabase
            .from('creator_clicks')
            .select('clicked_at, referrer')
            .eq('slug', slug)
            .order('clicked_at', { ascending: false })
            .limit(10),
    ]);

    return NextResponse.json({
        slug,
        total: allTime.count ?? 0,
        last30Days: last30.count ?? 0,
        recent: recent.data ?? [],
    });
}
