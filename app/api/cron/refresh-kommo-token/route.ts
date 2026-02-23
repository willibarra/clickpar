import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshKommoToken } from '@/lib/kommo';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CRON_SECRET = process.env.CRON_SECRET || 'clickpar-cron-2024';

/**
 * GET /api/cron/refresh-kommo-token?secret=clickpar-cron-2024
 * 
 * Dedicated cron for refreshing the Kommo access token.
 * Run this every 12 hours on your VPS via crontab.
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Try to load refresh_token from DB first (might be newer than env)
        const { data: dbTokens } = await supabase
            .from('kommo_tokens' as any)
            .select('refresh_token')
            .eq('id', 'default')
            .single();

        if (dbTokens?.refresh_token) {
            process.env.KOMMO_REFRESH_TOKEN = (dbTokens as any).refresh_token;
        }

        const newTokens = await refreshKommoToken();
        if (!newTokens) {
            return NextResponse.json({
                success: false,
                error: 'Token refresh failed. May need re-authorization.',
            }, { status: 500 });
        }

        // Persist to DB
        await supabase.from('kommo_tokens' as any).upsert({
            id: 'default',
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        // Update process.env
        process.env.KOMMO_ACCESS_TOKEN = newTokens.access_token;
        process.env.KOMMO_REFRESH_TOKEN = newTokens.refresh_token;

        return NextResponse.json({
            success: true,
            message: 'Token refreshed and saved to DB',
            expires_in: '24 hours',
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
